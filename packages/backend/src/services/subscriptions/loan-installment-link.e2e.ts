import {
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_PERIOD_STATUSES,
  SUBSCRIPTION_TYPES,
  TRANSACTION_TYPES,
  TRANSACTION_TRANSFER_NATURE,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addMonths, format } from 'date-fns';

const nextMonth = () => format(addMonths(new Date(), 1), 'yyyy-MM-dd');

async function createLoan() {
  return helpers.createLoan({
    payload: helpers.buildCreateLoanPayload({
      initialBalance: 1_000,
      originalPrincipal: 1_000,
      // Keep this behavior test same-currency: the installment is booked in
      // the user's base currency and the assertion is about loan linking,
      // not foreign-exchange conversion.
      currencyCode: global.BASE_CURRENCY_CODE,
      plannedPayment: 300,
      minPayment: 300,
    }),
    raw: true,
  });
}

async function createInstallment({ type = SUBSCRIPTION_TYPES.installment } = {}) {
  const sourceAccount = await helpers.createAccount({ raw: true });
  const subscription = await helpers.createSubscription({
    name: 'Loan installment',
    type,
    transactionType: TRANSACTION_TYPES.expense,
    expectedAmount: 300,
    expectedCurrencyCode: global.BASE_CURRENCY.code,
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    startDate: nextMonth(),
    dueDate: nextMonth(),
    maxOccurrences: 3,
    accountId: sourceAccount.id,
    categoryId: global.DEFAULT_CATEGORY_ID,
    raw: true,
  });

  return { sourceAccount, subscription };
}

describe('Loan-owned installment recurring payments', () => {
  it('returns an empty owned collection for a new loan', async () => {
    const loan = await createLoan();

    const detail = await helpers.getLoanById({ id: loan.id, raw: true });

    expect(detail.loanInstallments).toEqual([]);
  });

  it('links an installment and converts its future real payment into a loan payment', async () => {
    const loan = await createLoan();
    const { subscription } = await createInstallment();

    const linked = await helpers.linkInstallmentToLoan({
      id: subscription.id,
      loanAccountId: loan.id,
      raw: true,
    });

    expect(linked.linked).toBe(true);

    const subscriptionDetail = await helpers.getSubscriptionById({ id: subscription.id, raw: true });
    expect(subscriptionDetail.loanAccountId).toBe(loan.id);
    expect(subscriptionDetail.loan?.id).toBe(loan.id);

    const period = subscriptionDetail.periods.find((item) => item.status === SUBSCRIPTION_PERIOD_STATUSES.upcoming);
    if (!period) throw new Error('Expected an upcoming installment period');

    await helpers.markSubscriptionPeriodPaid({
      id: subscription.id,
      periodId: period.id,
      createTransaction: true,
      raw: true,
    });

    const loanDetail = await helpers.getLoanById({ id: loan.id, raw: true });
    expect(loanDetail.currentBalance).toBe(-700);
    expect(loanDetail.loanInstallments).toHaveLength(1);

    const transactions = await helpers.getTransactions({ raw: true });
    expect(transactions.filter((transaction) => transaction.accountId === loan.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transactionType: TRANSACTION_TYPES.income,
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
        }),
      ]),
    );

    const unlinked = await helpers.unlinkInstallmentFromLoan({ id: subscription.id, raw: true });
    expect(unlinked.unlinked).toBe(true);

    const afterUnlink = await helpers.getSubscriptionById({ id: subscription.id, raw: true });
    expect(afterUnlink.loanAccountId).toBeNull();
  });

  it('rejects a recurring subscription that is not an installment', async () => {
    const loan = await createLoan();
    const { subscription } = await createInstallment({ type: SUBSCRIPTION_TYPES.bill });

    const response = await helpers.linkInstallmentToLoan({
      id: subscription.id,
      loanAccountId: loan.id,
    });

    expect(response.statusCode).toBe(422);
  });
});
