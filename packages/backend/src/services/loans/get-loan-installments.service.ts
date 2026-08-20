import { SUBSCRIPTION_PERIOD_STATUSES, SUBSCRIPTION_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { centsToApiDecimalOrNull } from '@common/types/money';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';

export const getLoanInstallments = async ({ userId, accountId }: { userId: number; accountId: string }) => {
  const subscriptions = await Subscriptions.findAll({
    where: {
      userId,
      loanAccountId: accountId,
      type: SUBSCRIPTION_TYPES.installment,
      transactionType: TRANSACTION_TYPES.expense,
    },
    attributes: [
      'id',
      'name',
      'expectedAmount',
      'expectedCurrencyCode',
      'frequency',
      'startDate',
      'dueDate',
      'maxOccurrences',
      'isActive',
      'completedAt',
    ],
    include: [{ model: SubscriptionPeriods, as: 'periods', attributes: ['status'] }],
    order: [['createdAt', 'DESC']],
  });

  return subscriptions.map((subscription) => ({
    id: subscription.id,
    name: subscription.name,
    expectedAmount: centsToApiDecimalOrNull(subscription.expectedAmount),
    expectedCurrencyCode: subscription.expectedCurrencyCode,
    frequency: subscription.frequency,
    startDate: subscription.startDate,
    dueDate: subscription.dueDate,
    maxOccurrences: subscription.maxOccurrences,
    paidPeriodsCount: (subscription.periods ?? []).filter(
      (period) => period.status === SUBSCRIPTION_PERIOD_STATUSES.paid,
    ).length,
    isActive: subscription.isActive,
    completedAt: subscription.completedAt?.toISOString() ?? null,
  }));
};
