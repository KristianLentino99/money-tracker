import { currencyCode, dateString, numericString, recordId } from '@common/lib/zod/custom-types';
import {
  investmentContributionPurchaseSchema,
  securitySearchResultSchema,
} from '@controllers/investments/portfolios/investment-contribution-schemas';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createInvestmentContribution,
  createInvestmentContributionFromTransaction,
  updateInvestmentContribution,
} from '@services/investments/portfolios/transfers/create-investment-contribution.service';
import { deletePortfolioTransfer } from '@services/investments/portfolios/transfers/delete-portfolio-transfer.service';
import { setTransferAdjustment } from '@services/investments/portfolios/transfers/set-transfer-adjustment.service';
import { z } from 'zod';

import { slimPortfolioTransferForMcp } from '../serializers';
import { assertMcpMutationAllowed, getUserId, jsonContent } from './helpers';

// MCP publishes the input object; the transform applies REST identity and settlement validation plus defaults.
const purchaseInputSchema = z
  .object({
    securityId: recordId().optional(),
    searchResult: securitySearchResultSchema.optional(),
    quantity: numericString(),
    price: numericString({ allowZero: true }),
    fees: numericString({ allowZero: true }).optional(),
    date: z.union([dateString(), z.string().datetime({ offset: true })]),
    name: z.string().max(2000).optional(),
    settlementCurrencyCode: currencyCode().optional(),
    settlementAmount: numericString({ allowZero: true }).optional(),
    settlementFees: numericString({ allowZero: true }).optional(),
    settlementRate: numericString().optional(),
  })
  .transform((value) => investmentContributionPurchaseSchema.parse(value));

const purchases = z
  .array(purchaseInputSchema)
  .min(1)
  .describe(
    'Purchases grouped under the contribution. Each row needs exactly one securityId or full searchResult from search_securities; quantity, price, fees and settlement amounts are decimal strings.',
  );
const createSchema = {
  portfolioId: recordId().describe('Destination portfolio ID'),
  accountId: recordId().describe('Source account ID'),
  amount: numericString().describe('Account expense and contribution amount, as a positive decimal string'),
  date: dateString().describe('Cash movement date (YYYY-MM-DD)'),
  categoryId: recordId().describe('Expense category ID for the bank/account transaction'),
  description: z.string().max(2000).nullable().optional(),
  purchases,
};
const fromTransactionSchema = {
  transactionId: recordId().describe('Existing expense transaction ID; the movement is linked, never duplicated'),
  portfolioId: recordId().describe('Destination portfolio ID'),
  categoryId: recordId().describe('Expense category ID assigned to the source transaction'),
  purchases,
};
const updateSchema = {
  portfolioId: recordId().describe('Destination portfolio ID'),
  transferId: recordId().describe('Contribution transfer ID from list_portfolio_transfers'),
  purchases: purchases.describe('Complete replacement purchase list; the underlying account movement is preserved'),
};
const deleteSchema = {
  transferId: recordId().describe('Portfolio transfer ID from list_portfolio_transfers'),
  deleteLinkedTransaction: z
    .boolean()
    .optional()
    .describe('Explicitly confirm deletion of the linked account transaction; omitted/false preserves it'),
  deleteLinkedInvestmentTransactions: z
    .boolean()
    .optional()
    .describe(
      'Explicitly confirm deletion of grouped purchases; deletion is rejected if purchases exist and this is not true',
    ),
};
const adjustmentSchema = {
  transferId: recordId().describe('Portfolio transfer ID from list_portfolio_transfers'),
  isAdjustment: z
    .boolean()
    .describe(
      'True excludes the movement from contributions; false counts it as a contribution. Cash balance stays unchanged.',
    ),
};

export function registerInvestmentContributionTools(server: McpServer) {
  server.registerTool(
    'create_investment_contribution',
    {
      description:
        'Create one grouped investment contribution: source-account expense, portfolio cash movement, holdings and purchases together. Reuse full search_securities results to preserve provider identity. Amounts are decimal strings.',
      inputSchema: createSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'create_investment_contribution', clientId: extra.authInfo?.clientId });
      const transfer = await createInvestmentContribution({ userId, ...args });
      return jsonContent({ data: slimPortfolioTransferForMcp(transfer) });
    },
  );

  server.registerTool(
    'create_investment_contribution_from_transaction',
    {
      description:
        'Attach grouped investment purchases to an existing expense transaction without duplicating the account movement. The transaction must not already be a transfer. Creates missing securities and holdings from full search results.',
      inputSchema: fromTransactionSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({
        userId,
        tool: 'create_investment_contribution_from_transaction',
        clientId: extra.authInfo?.clientId,
      });
      const transfer = await createInvestmentContributionFromTransaction({ userId, ...args });
      return jsonContent({ data: slimPortfolioTransferForMcp(transfer) });
    },
  );

  server.registerTool(
    'update_investment_contribution',
    {
      description:
        'Replace the purchases in a grouped contribution while preserving its original account cash movement. Submit the complete desired purchase list; existing purchases are reversed and recreated with recalculation.',
      inputSchema: updateSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'update_investment_contribution', clientId: extra.authInfo?.clientId });
      const transfer = await updateInvestmentContribution({ userId, ...args });
      return jsonContent({ data: slimPortfolioTransferForMcp(transfer) });
    },
  );

  server.registerTool(
    'delete_portfolio_transfer',
    {
      description:
        'Delete a portfolio transfer and reverse its cash effect. Confirm with the user before deleting. Grouped purchases require deleteLinkedInvestmentTransactions=true; deleteLinkedTransaction=true also deletes the linked account row. Both flags default to false.',
      inputSchema: deleteSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_portfolio_transfer', clientId: extra.authInfo?.clientId });
      return jsonContent({ data: await deletePortfolioTransfer({ userId, ...args }) });
    },
  );

  server.registerTool(
    'set_portfolio_transfer_adjustment',
    {
      description:
        'Set whether an existing portfolio transfer is a balance adjustment or a contribution. This classification changes return/contribution reporting without changing the transfer amount, date or cash balance.',
      inputSchema: adjustmentSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'set_portfolio_transfer_adjustment', clientId: extra.authInfo?.clientId });
      const transfer = await setTransferAdjustment({ userId, ...args });
      return jsonContent({ data: slimPortfolioTransferForMcp(transfer) });
    },
  );
}
