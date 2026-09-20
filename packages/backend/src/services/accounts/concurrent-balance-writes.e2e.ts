import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

const CONCURRENT_ROUNDS = 6;
const CONCURRENT_EXPENSES_PER_ROUND = 8;
const EXPENSE_AMOUNT = 10;
const TRANSACTIONS_PAGE_SIZE = 100;

describe('Concurrent balance writes on one account', () => {
  // `currentBalance = initialBalance + Σ transactions` must hold no matter how a manual balance
  // edit interleaves with transactions being booked on the same account.
  it('keeps currentBalance equal to initialBalance plus the transaction ledger', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 100_000 }),
      raw: true,
    });

    for (let round = 0; round < CONCURRENT_ROUNDS; round++) {
      const expenses = Array.from({ length: CONCURRENT_EXPENSES_PER_ROUND }, () =>
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: EXPENSE_AMOUNT,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        }),
      );
      const balanceEdit = helpers.updateAccount({
        id: account.id,
        payload: { currentBalance: 90_000 - round * 1_000 },
      });

      await Promise.all([...expenses, balanceEdit]);
    }

    const after = await helpers.getAccount({ id: account.id, raw: true });
    const transactions = (await helpers.getTransactions({ limit: TRANSACTIONS_PAGE_SIZE, raw: true }))!.filter(
      (tx) => tx.accountId === account.id,
    );
    // Every booked expense must be visible, otherwise the ledger sum below proves nothing
    expect(transactions).toHaveLength(CONCURRENT_ROUNDS * CONCURRENT_EXPENSES_PER_ROUND);

    const ledger = transactions.reduce((sum, tx) => sum + Number(tx.amount) * -1, 0);

    expect(Number(after.currentBalance)).toBeCloseTo(Number(after.initialBalance) + ledger, 2);
  });
});
