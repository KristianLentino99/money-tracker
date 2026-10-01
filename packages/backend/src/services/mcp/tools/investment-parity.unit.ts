import { USER_ROLES } from '@bt/shared/types';
import {
  ASSET_CLASS,
  MANUAL_PORTFOLIO_JSON_FORMAT,
  MANUAL_PORTFOLIO_JSON_VERSION,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY,
  PORTFOLIO_TYPE,
  SECURITY_PROVIDER,
} from '@bt/shared/types/investments';
import { Money } from '@common/types/money';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isBaseCurrencyChangeLocked } from '@services/currencies/base-currency-lock';
import { createHolding } from '@services/investments/holdings/create-holding.service';
import { createPortfolio } from '@services/investments/portfolios/create.service';
import { listPortfolios } from '@services/investments/portfolios/list.service';
import {
  executeManualImport,
  extractManualAi,
  extractManualCsv,
} from '@services/investments/portfolios/manual-values-import.service';
import { importManualPortfolioJson } from '@services/investments/portfolios/manual-values-json.service';
import {
  createManualPortfolioTransaction,
  createManualPortfolioValuation,
  deleteManualPortfolioTransaction,
  deleteManualPortfolioValuation,
  getManualPortfolioOverview,
  updateManualPortfolioTransaction,
  updateManualPortfolioValuation,
} from '@services/investments/portfolios/manual-values.service';
import {
  createInvestmentContribution,
  createInvestmentContributionFromTransaction,
  updateInvestmentContribution,
} from '@services/investments/portfolios/transfers/create-investment-contribution.service';
import { deletePortfolioTransfer } from '@services/investments/portfolios/transfers/delete-portfolio-transfer.service';
import { setTransferAdjustment } from '@services/investments/portfolios/transfers/set-transfer-adjustment.service';
import { addSecurityFromSearch } from '@services/investments/securities/add-from-search.service';
import { searchSecurities } from '@services/investments/securities/search.service';
import { z } from 'zod';

import { registerCreateHolding } from './create-holding';
import { registerCreatePortfolio } from './create-portfolio';
import { registerGetPortfolios } from './get-portfolios';
import { registerInvestmentContributionTools } from './investment-contribution-tools';
import { registerManualPortfolioTools } from './manual-portfolio-tools';
import { registerSearchSecurities } from './search-securities';

jest.mock('@js/utils/posthog', () => ({ trackMcpToolUsed: jest.fn() }));
jest.mock('@services/currencies/base-currency-lock', () => ({ isBaseCurrencyChangeLocked: jest.fn() }));
jest.mock('@services/investments/holdings/create-holding.service', () => ({ createHolding: jest.fn() }));
jest.mock('@services/investments/portfolios/create.service', () => ({ createPortfolio: jest.fn() }));
jest.mock('@services/investments/portfolios/list.service', () => ({ listPortfolios: jest.fn() }));
jest.mock('@services/investments/portfolios/manual-values-import.service', () => ({
  executeManualImport: jest.fn(),
  extractManualAi: jest.fn(),
  extractManualCsv: jest.fn(),
}));
jest.mock('@services/investments/portfolios/manual-values-json.service', () => ({
  importManualPortfolioJson: jest.fn(),
}));
jest.mock('@services/investments/portfolios/manual-values.service', () => ({
  createManualPortfolioTransaction: jest.fn(),
  createManualPortfolioValuation: jest.fn(),
  deleteManualPortfolioTransaction: jest.fn(),
  deleteManualPortfolioValuation: jest.fn(),
  getManualPortfolioOverview: jest.fn(),
  updateManualPortfolioTransaction: jest.fn(),
  updateManualPortfolioValuation: jest.fn(),
}));
jest.mock('@services/investments/portfolios/transfers/create-investment-contribution.service', () => ({
  createInvestmentContribution: jest.fn(),
  createInvestmentContributionFromTransaction: jest.fn(),
  updateInvestmentContribution: jest.fn(),
}));
jest.mock('@services/investments/portfolios/transfers/delete-portfolio-transfer.service', () => ({
  deletePortfolioTransfer: jest.fn(),
}));
jest.mock('@services/investments/portfolios/transfers/set-transfer-adjustment.service', () => ({
  setTransferAdjustment: jest.fn(),
}));
jest.mock('@services/investments/securities/add-from-search.service', () => ({ addSecurityFromSearch: jest.fn() }));
jest.mock('@services/investments/securities/search.service', () => ({ searchSecurities: jest.fn() }));

const portfolioId = '00000000-0000-4000-8000-000000000001';
const recordId = '00000000-0000-4000-8000-000000000002';
const securityId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000004';
const categoryId = '00000000-0000-4000-8000-000000000005';
const date = '2026-09-15';
const searchResult = {
  symbol: 'SXRT',
  providerSymbol: 'IE00B53L3W79.IR',
  priceSourceSymbol: 'SXRT.DE',
  name: 'UCITS ETF',
  providerName: SECURITY_PROVIDER.yahoo,
  assetClass: ASSET_CLASS.stocks,
  currencyCode: 'EUR',
  exchangeAcronym: 'XETRA',
  exchangeMic: 'XETR',
  exchangeName: 'XETRA',
  isin: 'IE00B53L3W79',
};
const purchase = { searchResult, quantity: '2.5', price: '100.10', fees: '0.25', date };
const transfer = {
  id: recordId,
  date,
  amount: Money.fromDecimal('250.50'),
  refAmount: Money.fromDecimal('250.50'),
  currencyCode: 'EUR',
  transactionId: accountId,
  toPortfolioId: portfolioId,
  investmentTransactions: [
    {
      id: recordId,
      securityId,
      category: 'buy',
      date,
      quantity: Money.fromDecimal('2.5'),
      price: Money.fromDecimal('100.10'),
      amount: Money.fromDecimal('250.50'),
      fees: Money.fromDecimal('0.25'),
      currencyCode: 'EUR',
      settlementCurrencyCode: 'EUR',
      settlementAmount: Money.fromDecimal('250.50'),
      settlementFees: Money.fromDecimal('0.25'),
      settlementRate: '1',
      security: { id: securityId, ...searchResult },
    },
  ],
};
type Extra = {
  authInfo?: { clientId?: string; scopes: string[]; extra: { userId?: number; role?: string; readOnly?: boolean } };
};
type Tool = {
  schema: z.ZodRawShape;
  handler: (args: Record<string, unknown>, extra: Extra) => Promise<{ content: { text: string }[] }>;
};
const tools = new Map<string, Tool>();
const server = {
  registerTool: (name: string, config: { inputSchema: z.ZodRawShape }, handler: Tool['handler']) => {
    tools.set(name, { schema: config.inputSchema, handler });
  },
} as unknown as McpServer;
const auth = ({
  scopes = ['finance:read', 'finance:write', 'finance:delete'],
  readOnly = false,
  role = USER_ROLES.common,
}: { scopes?: string[]; readOnly?: boolean; role?: string } = {}): Extra => ({
  authInfo: { clientId: 'mcp-test', scopes, extra: { userId: 42, role, readOnly } },
});
const call = async ({ tool, args, extra = auth() }: { tool: string; args: Record<string, unknown>; extra?: Extra }) => {
  const registered = tools.get(tool)!;
  const result = await registered.handler(z.object(registered.schema).parse(args), extra);
  return JSON.parse(result.content[0]!.text);
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(isBaseCurrencyChangeLocked).mockResolvedValue(false);
  jest.mocked(updateManualPortfolioTransaction).mockResolvedValue({} as never);
  jest.mocked(createManualPortfolioValuation).mockResolvedValue({} as never);
  jest.mocked(updateManualPortfolioValuation).mockResolvedValue({} as never);
  tools.clear();
  registerInvestmentContributionTools(server);
  registerManualPortfolioTools(server);
  registerCreateHolding(server);
  registerCreatePortfolio(server);
  registerGetPortfolios(server);
  registerSearchSecurities(server);
});

describe('investment MCP parity', () => {
  it('publishes every grouped contribution input as JSON Schema', () => {
    for (const name of [
      'create_investment_contribution',
      'create_investment_contribution_from_transaction',
      'update_investment_contribution',
    ]) {
      expect(() => z.toJSONSchema(z.object(tools.get(name)!.schema), { io: 'input' })).not.toThrow();
    }
  });

  it('preserves provider search identity through search and holding creation', async () => {
    jest.mocked(searchSecurities).mockResolvedValue([searchResult]);
    const results = await call({ tool: 'search_securities', args: { query: 'SXRT', portfolioId } });
    expect(results).toEqual([searchResult]);
    jest.mocked(addSecurityFromSearch).mockResolvedValue({ security: { id: securityId } } as never);
    jest.mocked(createHolding).mockResolvedValue({ securityId, quantity: Money.zero() } as never);
    expect(await call({ tool: 'create_holding', args: { portfolioId, searchResult: results[0] } })).toMatchObject({
      securityId,
      quantity: 0,
    });
    expect(addSecurityFromSearch).toHaveBeenCalledWith({ searchResult });
    expect(createHolding).toHaveBeenCalledWith({ userId: 42, portfolioId, securityId });
  });

  it('rejects missing or ambiguous holding security identity before creating anything', async () => {
    await expect(call({ tool: 'create_holding', args: { portfolioId } })).rejects.toThrow(/exactly one/);
    await expect(call({ tool: 'create_holding', args: { portfolioId, securityId, searchResult } })).rejects.toThrow(
      /exactly one/,
    );
    expect(addSecurityFromSearch).not.toHaveBeenCalled();
    expect(createHolding).not.toHaveBeenCalled();
  });

  it('creates grouped purchases with decimal input and decimal output plus routing identity', async () => {
    jest.mocked(createInvestmentContribution).mockResolvedValue(transfer as never);
    const args = { portfolioId, accountId, categoryId, date, amount: '250.50', purchases: [purchase] };
    const result = await call({ tool: 'create_investment_contribution', args });
    expect(createInvestmentContribution).toHaveBeenCalledWith({ userId: 42, ...args });
    expect(Number(result.amount)).toBe(250.5);
    expect(Number(result.investmentTransactions[0].quantity)).toBe(2.5);
    expect(Number(result.investmentTransactions[0].settlementFees)).toBe(0.25);
    expect(result.investmentTransactions[0].security.providerSymbol).toBe('IE00B53L3W79.IR');
  });

  it('rejects empty purchases and incomplete cross-currency settlement before invoking the service', async () => {
    const args = { portfolioId, accountId, categoryId, date, amount: '250.50' };
    await expect(call({ tool: 'create_investment_contribution', args: { ...args, purchases: [] } })).rejects.toThrow();
    await expect(
      call({
        tool: 'create_investment_contribution',
        args: { ...args, purchases: [{ ...purchase, settlementCurrencyCode: 'USD' }] },
      }),
    ).rejects.toThrow(/settlementAmount/);
    expect(createInvestmentContribution).not.toHaveBeenCalled();
  });

  it('links an existing transaction without asking the creation service to duplicate it', async () => {
    jest.mocked(createInvestmentContributionFromTransaction).mockResolvedValue(transfer as never);
    const args = { transactionId: recordId, portfolioId, categoryId, purchases: [purchase] };
    await call({ tool: 'create_investment_contribution_from_transaction', args });
    expect(createInvestmentContributionFromTransaction).toHaveBeenCalledWith({ userId: 42, ...args });
    expect(createInvestmentContribution).not.toHaveBeenCalled();
  });

  it('replaces purchase lists and preserves deletion confirmation flags', async () => {
    jest.mocked(updateInvestmentContribution).mockResolvedValue(transfer as never);
    await call({
      tool: 'update_investment_contribution',
      args: { portfolioId, transferId: recordId, purchases: [purchase] },
    });
    expect(updateInvestmentContribution).toHaveBeenCalledWith({
      userId: 42,
      portfolioId,
      transferId: recordId,
      purchases: [purchase],
    });
    jest.mocked(deletePortfolioTransfer).mockRejectedValueOnce(new Error('Purchase confirmation required'));
    await expect(call({ tool: 'delete_portfolio_transfer', args: { transferId: recordId } })).rejects.toThrow(
      /confirmation/,
    );
    expect(deletePortfolioTransfer).toHaveBeenCalledWith({ userId: 42, transferId: recordId });
    jest.mocked(deletePortfolioTransfer).mockResolvedValue({ success: true });
    await call({
      tool: 'delete_portfolio_transfer',
      args: { transferId: recordId, deleteLinkedTransaction: false, deleteLinkedInvestmentTransactions: true },
      extra: auth({ scopes: ['finance:delete'] }),
    });
    expect(deletePortfolioTransfer).toHaveBeenLastCalledWith({
      userId: 42,
      transferId: recordId,
      deleteLinkedTransaction: false,
      deleteLinkedInvestmentTransactions: true,
    });
  });

  it('changes contribution classification through the dedicated adjustment service', async () => {
    jest.mocked(setTransferAdjustment).mockResolvedValue({ ...transfer, isAdjustment: true } as never);
    expect(
      await call({ tool: 'set_portfolio_transfer_adjustment', args: { transferId: recordId, isAdjustment: true } }),
    ).toMatchObject({ isAdjustment: true });
    expect(setTransferAdjustment).toHaveBeenCalledWith({ userId: 42, transferId: recordId, isAdjustment: true });
  });

  it('passes manual tracking/display currency configuration and returns it on read-only listings', async () => {
    jest.mocked(createPortfolio).mockResolvedValue({ id: portfolioId } as never);
    await call({
      tool: 'create_portfolio',
      args: {
        name: 'Pension',
        portfolioType: PORTFOLIO_TYPE.retirement,
        displayCurrencyCode: 'eur',
        isManualTracking: true,
      },
    });
    expect(createPortfolio).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, displayCurrencyCode: 'EUR', isManualTracking: true }),
    );
    jest
      .mocked(listPortfolios)
      .mockResolvedValue([
        { id: portfolioId, name: 'Pension', displayCurrencyCode: 'EUR', isManualTracking: true },
      ] as never);
    expect(
      await call({ tool: 'get_portfolios', args: {}, extra: auth({ scopes: ['finance:read'], readOnly: true }) }),
    ).toEqual([expect.objectContaining({ displayCurrencyCode: 'EUR', isManualTracking: true })]);
  });
});

describe('manual portfolio MCP parity', () => {
  it('keeps overview readable for demo/read-only callers', async () => {
    jest.mocked(getManualPortfolioOverview).mockResolvedValue({ currencyCode: 'EUR', currentValue: '100.25' } as never);
    expect(
      await call({
        tool: 'get_manual_portfolio',
        args: { portfolioId },
        extra: auth({ scopes: ['finance:read'], readOnly: true, role: USER_ROLES.demo }),
      }),
    ).toMatchObject({ currentValue: '100.25' });
    expect(getManualPortfolioOverview).toHaveBeenCalledWith({ userId: 42, portfolioId });
  });

  it('routes transaction and valuation create/update/delete actions with decimal strings', async () => {
    const transaction = { category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution, amount: '100.25', date };
    const valuation = { value: '150.75', date };
    jest.mocked(createManualPortfolioTransaction).mockResolvedValue({ amount: Money.fromDecimal('100.25') } as never);
    expect(
      await call({ tool: 'manage_manual_portfolio_transaction', args: { portfolioId, action: 'create', transaction } }),
    ).toEqual({ amount: 100.25 });
    expect(createManualPortfolioTransaction).toHaveBeenCalledWith({ userId: 42, portfolioId, ...transaction });
    await call({
      tool: 'manage_manual_portfolio_transaction',
      args: { portfolioId, action: 'update', recordId, transaction },
    });
    expect(updateManualPortfolioTransaction).toHaveBeenCalledWith({
      userId: 42,
      portfolioId,
      recordId,
      ...transaction,
    });
    await call({
      tool: 'manage_manual_portfolio_transaction',
      args: { portfolioId, action: 'delete', recordId },
      extra: auth({ scopes: ['finance:delete'] }),
    });
    expect(deleteManualPortfolioTransaction).toHaveBeenCalledWith({ userId: 42, portfolioId, recordId });
    await call({ tool: 'manage_manual_portfolio_valuation', args: { portfolioId, action: 'create', valuation } });
    expect(createManualPortfolioValuation).toHaveBeenCalledWith({ userId: 42, portfolioId, ...valuation });
    await call({
      tool: 'manage_manual_portfolio_valuation',
      args: { portfolioId, action: 'update', valuationId: recordId, valuation },
    });
    expect(updateManualPortfolioValuation).toHaveBeenCalledWith({
      userId: 42,
      portfolioId,
      valuationId: recordId,
      ...valuation,
    });
    await call({
      tool: 'manage_manual_portfolio_valuation',
      args: { portfolioId, action: 'delete', valuationId: recordId },
      extra: auth({ scopes: ['finance:delete'] }),
    });
    expect(deleteManualPortfolioValuation).toHaveBeenCalledWith({ userId: 42, portfolioId, valuationId: recordId });
  });

  it('rejects negative amounts, missing update IDs and missing valuation bodies without service writes', async () => {
    await expect(
      call({
        tool: 'manage_manual_portfolio_transaction',
        args: { portfolioId, action: 'create', transaction: { category: 'contribution', amount: '-1', date } },
      }),
    ).rejects.toThrow();
    await expect(
      call({
        tool: 'manage_manual_portfolio_transaction',
        args: { portfolioId, action: 'update', transaction: { category: 'contribution', amount: '1', date } },
      }),
    ).rejects.toThrow();
    await expect(
      call({ tool: 'manage_manual_portfolio_valuation', args: { portfolioId, action: 'create' } }),
    ).rejects.toThrow();
    expect(createManualPortfolioTransaction).not.toHaveBeenCalled();
    expect(updateManualPortfolioTransaction).not.toHaveBeenCalled();
    expect(createManualPortfolioValuation).not.toHaveBeenCalled();
  });

  it('delegates versioned JSON import and surfaces currency/duplicate conflicts unchanged', async () => {
    const payload = {
      format: MANUAL_PORTFOLIO_JSON_FORMAT,
      version: MANUAL_PORTFOLIO_JSON_VERSION,
      portfolioName: 'Pension',
      currencyCode: 'EUR',
      transactions: [],
      valuations: [{ value: '100.25', date, note: null, source: null }],
    };
    jest.mocked(importManualPortfolioJson).mockRejectedValue(new Error('Currency does not match'));
    await expect(call({ tool: 'import_manual_portfolio_json', args: { portfolioId, payload } })).rejects.toThrow(
      /Currency does not match/,
    );
    expect(importManualPortfolioJson).toHaveBeenCalledWith({ userId: 42, portfolioId, payload });
  });

  it('previews CSV and AI candidates, then imports only the reviewed/explicitly skipped payload', async () => {
    const records = [
      {
        tempId: 'candidate-1',
        kind: 'valuation',
        date,
        amount: '100.25',
        confidence: 1,
        warnings: [],
        possibleDuplicate: false,
      },
    ];
    jest.mocked(extractManualCsv).mockResolvedValue({ records, warnings: [] } as never);
    expect(
      await call({
        tool: 'extract_manual_portfolio_import',
        args: { portfolioId, source: 'csv', csv: 'date,value\n2026-09-15,100.25' },
      }),
    ).toMatchObject({ records });
    jest.mocked(extractManualAi).mockResolvedValue({ records, warnings: [], tokenCount: 1 } as never);
    await call({
      tool: 'extract_manual_portfolio_import',
      args: { portfolioId, source: 'ai', text: 'valuation 100.25' },
    });
    expect(extractManualAi).toHaveBeenCalledWith({
      userId: 42,
      portfolioId,
      text: 'valuation 100.25',
      fileBase64: undefined,
    });
    expect(executeManualImport).not.toHaveBeenCalled();
    jest.mocked(executeManualImport).mockResolvedValue({ imported: 0, skipped: 1 } as never);
    await call({
      tool: 'execute_manual_portfolio_import',
      args: { portfolioId, records, skipTempIds: ['candidate-1'] },
    });
    expect(executeManualImport).toHaveBeenCalledWith({
      userId: 42,
      portfolioId,
      records,
      skipTempIds: ['candidate-1'],
    });
  });

  it('rejects empty extraction content before either extractor runs', async () => {
    await expect(
      call({ tool: 'extract_manual_portfolio_import', args: { portfolioId, source: 'ai', text: ' ' } }),
    ).rejects.toThrow(/Paste text/);
    await expect(
      call({ tool: 'extract_manual_portfolio_import', args: { portfolioId, source: 'csv' } }),
    ).rejects.toThrow();
    expect(extractManualAi).not.toHaveBeenCalled();
    expect(extractManualCsv).not.toHaveBeenCalled();
  });
});

describe('investment tool authorization', () => {
  const writes = [
    'create_investment_contribution',
    'create_investment_contribution_from_transaction',
    'update_investment_contribution',
    'set_portfolio_transfer_adjustment',
    'create_holding',
    'manage_manual_portfolio_transaction',
    'manage_manual_portfolio_valuation',
    'import_manual_portfolio_json',
    'extract_manual_portfolio_import',
    'execute_manual_portfolio_import',
  ];

  it.each(writes)('%s requires authentication and write scope before touching services', async (name) => {
    const handler = tools.get(name)!.handler;
    await expect(handler({}, {})).rejects.toThrow(/Authentication required/);
    await expect(handler({ action: 'create' }, auth({ scopes: ['finance:read'] }))).rejects.toThrow(/finance:write/);
  });

  it('blocks writes while base currency recalculation is active', async () => {
    jest.mocked(isBaseCurrencyChangeLocked).mockResolvedValue(true);
    await expect(call({ tool: 'create_holding', args: { portfolioId, securityId } })).rejects.toThrow(/recalculation/);
    expect(createHolding).not.toHaveBeenCalled();
  });

  it('requires delete scope independently from write scope', async () => {
    await expect(
      call({
        tool: 'delete_portfolio_transfer',
        args: { transferId: recordId },
        extra: auth({ scopes: ['finance:write'] }),
      }),
    ).rejects.toThrow(/finance:delete/);
    await expect(
      call({
        tool: 'manage_manual_portfolio_transaction',
        args: { portfolioId, action: 'delete', recordId },
        extra: auth({ scopes: ['finance:write'] }),
      }),
    ).rejects.toThrow(/finance:delete/);
    expect(deletePortfolioTransfer).not.toHaveBeenCalled();
    expect(deleteManualPortfolioTransaction).not.toHaveBeenCalled();
  });
});
