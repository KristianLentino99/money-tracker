import { SORT_DIRECTIONS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

// The MCP search tool delegates its visibility and pagination to this HTTP list
// service. The Jest MCP transport is a no-op, so tool behavior has a separate unit suite.
describe('Transaction history visibility used by MCP', () => {
  it('paginates old and recent transactions across every owned account, including accounts excluded from stats', async () => {
    const account = await helpers.createAccount({ raw: true });
    const excludedAccount = await helpers.createAccount({ raw: true });
    await helpers.updateAccount({ id: excludedAccount.id, payload: { excludeFromStats: true }, raw: true });

    const [oldTransaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, time: '2020-01-01T12:00:00.000Z' }),
      raw: true,
    });
    const [excludedTransaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: excludedAccount.id, time: '2021-01-01T12:00:00.000Z' }),
      raw: true,
    });
    const [recentTransaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id }),
      raw: true,
    });

    const firstPage = await helpers.getTransactions({ limit: 2, offset: 0, order: SORT_DIRECTIONS.asc, raw: true });
    const secondPage = await helpers.getTransactions({ limit: 2, offset: 2, order: SORT_DIRECTIONS.asc, raw: true });

    expect(firstPage.map(({ id }) => id)).toEqual([oldTransaction.id, excludedTransaction.id]);
    expect(secondPage.map(({ id }) => id)).toEqual([recentTransaction.id]);
  });

  it('can restrict the same full history to one account', async () => {
    const account = await helpers.createAccount({ raw: true });
    const otherAccount = await helpers.createAccount({ raw: true });
    const [transaction] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, time: '2020-01-01T12:00:00.000Z' }),
      raw: true,
    });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: otherAccount.id, time: '2021-01-01T12:00:00.000Z' }),
      raw: true,
    });

    const result = await helpers.getTransactions({ accountIds: [account.id], raw: true });

    expect(result.map(({ id }) => id)).toEqual([transaction.id]);
  });
});
