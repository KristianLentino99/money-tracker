import { ACCOUNT_CATEGORIES, ACCOUNT_STATUSES, SUBSCRIPTION_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import LoanDetails from '@models/loan-details.model';
import { withTransaction } from '@services/common/with-transaction';

import { findSubscriptionOrThrow } from './helpers';

const findOwnedActiveLoan = async ({ userId, loanAccountId }: { userId: number; loanAccountId: string }) => {
  const loan = await LoanDetails.findOne({
    where: { accountId: loanAccountId, userId },
    include: [{ model: Accounts, as: 'account' }],
  });

  if (!loan?.account || loan.account.accountCategory !== ACCOUNT_CATEGORIES.loan) {
    throw new NotFoundError({ message: t({ key: 'loans.loanNotFound' }) });
  }

  if (loan.account.status !== ACCOUNT_STATUSES.active || loan.account.currentBalance.toCents() >= 0) {
    throw new ValidationError({ message: t({ key: 'loans.loanNotActive' }) });
  }

  return loan;
};

export const linkInstallmentToLoan = withTransaction(
  async ({
    userId,
    subscriptionId,
    loanAccountId,
  }: {
    userId: number;
    subscriptionId: string;
    loanAccountId: string;
  }) => {
    const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

    if (
      subscription.type !== SUBSCRIPTION_TYPES.installment ||
      subscription.transactionType !== TRANSACTION_TYPES.expense
    ) {
      throw new ValidationError({ message: t({ key: 'loans.loanInstallmentOnly' }) });
    }

    if (subscription.loanAccountId === loanAccountId) {
      return { linked: false, loanAccountId };
    }

    if (subscription.loanAccountId != null) {
      throw new ConflictError({ message: t({ key: 'loans.loanInstallmentAlreadyLinked' }) });
    }

    await findOwnedActiveLoan({ userId, loanAccountId });

    if (subscription.accountId === loanAccountId) {
      throw new ValidationError({ message: t({ key: 'loans.loanInstallmentSourceAccount' }) });
    }

    await subscription.update({ loanAccountId });

    return { linked: true, loanAccountId };
  },
);

export const unlinkInstallmentFromLoan = withTransaction(
  async ({ userId, subscriptionId }: { userId: number; subscriptionId: string }) => {
    const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

    if (subscription.loanAccountId == null) {
      return { unlinked: false };
    }

    await subscription.update({ loanAccountId: null });

    return { unlinked: true };
  },
);
