import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, type RecordId } from '@bt/shared/types';
import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

const CONTRIBUTION_DATE = '2026-09-10';

describe('Investment contribution (POST /investments/portfolios/:id/contributions)', () => {
  let portfolioId: RecordId;
  let accountId: RecordId;
  let categoryId: RecordId;
  let securityIds: RecordId[];

  beforeEach(async () => {
    const [portfolio, account, category, securities] = await Promise.all([
      helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Investment Portfolio' }),
        raw: true,
      }),
      helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Main Account' }),
        raw: true,
      }),
      helpers.addCustomCategory({ name: 'Investments', raw: true }),
      helpers.seedSecurities([
        { symbol: 'AAA', name: 'Alpha ETF' },
        { symbol: 'BBB', name: 'Beta ETF' },
      ]),
    ]);

    portfolioId = portfolio.id;
    accountId = account.id;
    categoryId = category.id;
    securityIds = securities.map((security) => security.id);

    await Promise.all(
      securityIds.map((securityId) =>
        helpers.createHolding({
          payload: { portfolioId, securityId },
          raw: true,
        }),
      ),
    );
  });

  it('creates one account expense, one portfolio transfer, and multiple investment purchases', async () => {
    const contribution = await helpers.createInvestmentContribution({
      portfolioId,
      payload: {
        accountId,
        amount: '1000',
        date: CONTRIBUTION_DATE,
        categoryId,
        description: 'Monthly investing',
        purchases: [
          {
            securityId: securityIds[0]!,
            quantity: '2',
            price: '100',
            fees: '1',
            date: CONTRIBUTION_DATE,
          },
          {
            securityId: securityIds[1]!,
            quantity: '3',
            price: '100',
            fees: '0',
            date: '2026-09-11',
          },
        ],
      },
      raw: true,
    });

    expect(contribution).toMatchObject({
      fromAccountId: accountId,
      toPortfolioId: portfolioId,
      amount: expect.toBeNumericEqual('1000'),
      transactionId: expect.any(String),
    });
    expect(contribution.investmentTransactions).toHaveLength(2);

    const investments = await helpers.getInvestmentTransactions({ portfolioId, raw: true });
    expect(investments.transactions).toHaveLength(2);
    expect(investments.transactions.every((transaction) => transaction.portfolioTransferId === contribution.id)).toBe(
      true,
    );

    const transactions = await helpers.getTransactions({ accountIds: [accountId], raw: true });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      transactionType: TRANSACTION_TYPES.expense,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio,
      categoryId,
    });

    const [balance] = await helpers.getPortfolioBalance({
      portfolioId,
      currencyCode: 'USD',
      raw: true,
    });
    expect(balance!.availableCash).toBeNumericEqual('499');
    expect(balance!.totalCash).toBeNumericEqual('499');
  });

  it('resolves and creates a holding for a newly searched security', async () => {
    const contribution = await helpers.createInvestmentContribution({
      portfolioId,
      payload: {
        accountId,
        amount: '1000',
        date: CONTRIBUTION_DATE,
        categoryId,
        purchases: [
          {
            searchResult: {
              symbol: 'CCC',
              providerSymbol: 'CCC',
              name: 'Gamma ETF',
              assetClass: ASSET_CLASS.stocks,
              providerName: SECURITY_PROVIDER.fmp,
              currencyCode: 'USD',
              exchangeAcronym: 'NASDAQ',
              exchangeMic: 'XNAS',
              exchangeName: 'NASDAQ',
            },
            quantity: '1',
            price: '150',
            fees: '0',
            date: CONTRIBUTION_DATE,
          },
        ],
      },
      raw: true,
    });

    const searchedSecurityId = contribution.investmentTransactions![0]!.securityId;
    expect(searchedSecurityId).not.toBe(securityIds[0]);
    expect((await helpers.getAllSecurities({ raw: true })).some((security) => security.id === searchedSecurityId)).toBe(
      true,
    );
  });

  it('replaces grouped purchases while preserving the parent transfer', async () => {
    const contribution = await helpers.createInvestmentContribution({
      portfolioId,
      payload: {
        accountId,
        amount: '1000',
        date: CONTRIBUTION_DATE,
        categoryId,
        purchases: [
          {
            securityId: securityIds[0]!,
            quantity: '2',
            price: '100',
            fees: '0',
            date: CONTRIBUTION_DATE,
          },
        ],
      },
      raw: true,
    });

    const updated = await helpers.updateInvestmentContribution({
      portfolioId,
      transferId: contribution.id,
      payload: {
        purchases: [
          {
            securityId: securityIds[1]!,
            quantity: '1',
            price: '100',
            fees: '0',
            date: '2026-09-12',
          },
        ],
      },
      raw: true,
    });

    expect(updated.id).toBe(contribution.id);
    expect(updated.transactionId).toBe(contribution.transactionId);
    expect(updated.investmentTransactions).toHaveLength(1);
    expect(updated.investmentTransactions![0]!.securityId).toBe(securityIds[1]);
    expect((await helpers.getInvestmentTransactions({ portfolioId, raw: true })).transactions).toHaveLength(1);
  });

  it('rejects an empty purchase list when updating a contribution', async () => {
    const contribution = await helpers.createInvestmentContribution({
      portfolioId,
      payload: {
        accountId,
        amount: '1000',
        date: CONTRIBUTION_DATE,
        categoryId,
        purchases: [
          {
            securityId: securityIds[0]!,
            quantity: '1',
            price: '100',
            fees: '0',
            date: CONTRIBUTION_DATE,
          },
        ],
      },
      raw: true,
    });

    const response = await helpers.updateInvestmentContribution({
      portfolioId,
      transferId: contribution.id,
      payload: { purchases: [] },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    expect((await helpers.getInvestmentTransactions({ portfolioId, raw: true })).transactions).toHaveLength(1);
  });

  it('requires explicit confirmation before deleting linked purchases', async () => {
    const contribution = await helpers.createInvestmentContribution({
      portfolioId,
      payload: {
        accountId,
        amount: '1000',
        date: CONTRIBUTION_DATE,
        categoryId,
        purchases: [
          {
            securityId: securityIds[0]!,
            quantity: '1',
            price: '100',
            fees: '0',
            date: CONTRIBUTION_DATE,
          },
        ],
      },
      raw: true,
    });

    const blocked = await helpers.deletePortfolioTransfer({
      portfolioId,
      transferId: contribution.id,
    });
    expect(blocked.statusCode).toBe(ERROR_CODES.ValidationError);
    expect((await helpers.getInvestmentTransactions({ portfolioId, raw: true })).transactions).toHaveLength(1);

    await helpers.deletePortfolioTransfer({
      portfolioId,
      transferId: contribution.id,
      deleteLinkedTransaction: true,
      deleteLinkedInvestmentTransactions: true,
    });

    expect((await helpers.getInvestmentTransactions({ portfolioId, raw: true })).transactions).toHaveLength(0);
    expect(await helpers.getTransactions({ accountIds: [accountId], raw: true })).toHaveLength(0);
    expect(await helpers.listPortfolioTransfers({ portfolioId, raw: true })).toMatchObject({ data: [] });
  });

  it('rejects an empty purchase list without creating any records', async () => {
    const response = await helpers.createInvestmentContribution({
      portfolioId,
      payload: {
        accountId,
        amount: '1000',
        date: CONTRIBUTION_DATE,
        categoryId,
        purchases: [],
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    expect(await helpers.getTransactions({ raw: true })).toHaveLength(0);
    expect((await helpers.getInvestmentTransactions({ portfolioId, raw: true })).transactions).toHaveLength(0);
  });

  it('links an existing expense without duplicating the bank transaction', async () => {
    const [sourceTransaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId,
        amount: 1000,
        categoryId,
        time: `${CONTRIBUTION_DATE}T00:00:00.000Z`,
      }),
      raw: true,
    });

    const contribution = await helpers.createInvestmentContributionFromTransaction({
      transactionId: sourceTransaction!.id,
      payload: {
        portfolioId,
        categoryId,
        purchases: [
          {
            securityId: securityIds[0]!,
            quantity: '2',
            price: '100',
            fees: '0',
            date: CONTRIBUTION_DATE,
          },
        ],
      },
      raw: true,
    });

    expect(contribution.transactionId).toBe(sourceTransaction!.id);
    expect(await helpers.getTransactions({ accountIds: [accountId], raw: true })).toHaveLength(1);
    expect((await helpers.getInvestmentTransactions({ portfolioId, raw: true })).transactions).toHaveLength(1);
  });

  it('rejects an empty purchase list when linking an existing transaction', async () => {
    const [sourceTransaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId,
        categoryId,
        time: `${CONTRIBUTION_DATE}T00:00:00.000Z`,
      }),
      raw: true,
    });

    const response = await helpers.createInvestmentContributionFromTransaction({
      transactionId: sourceTransaction!.id,
      payload: { portfolioId, categoryId, purchases: [] },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    expect(await helpers.getTransactions({ accountIds: [accountId], raw: true })).toHaveLength(1);
    expect((await helpers.getInvestmentTransactions({ portfolioId, raw: true })).transactions).toHaveLength(0);
  });

  it('rolls back the transfer and purchases when investment cost exceeds available cash', async () => {
    const response = await helpers.createInvestmentContribution({
      portfolioId,
      payload: {
        accountId,
        amount: '100',
        date: CONTRIBUTION_DATE,
        categoryId,
        purchases: [
          {
            securityId: securityIds[0]!,
            quantity: '2',
            price: '100',
            fees: '0',
            date: CONTRIBUTION_DATE,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    expect(await helpers.getTransactions({ raw: true })).toHaveLength(0);
    expect((await helpers.getInvestmentTransactions({ portfolioId, raw: true })).transactions).toHaveLength(0);
    expect(await helpers.listPortfolioTransfers({ portfolioId, raw: true })).toMatchObject({ data: [] });
  });
});
