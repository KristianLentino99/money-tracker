import { MANUAL_PORTFOLIO_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import Big from 'big.js';

export type ManualPerformanceActivity = {
  date: string;
  amount: Big;
  category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY;
};

export type ManualValuationSnapshot = {
  date: string;
  value: Big;
};

type ManualPerformanceInput = {
  opening?: ManualValuationSnapshot;
  current: Big | null;
  activities: ManualPerformanceActivity[];
};

const capitalFlowCategories = new Set([
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.withdrawal,
]);

const totalForCategory = (activities: ManualPerformanceActivity[], category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY) =>
  activities
    .filter((activity) => activity.category === category)
    .reduce((sum, activity) => sum.plus(activity.amount), new Big(0));

export function calculateManualPortfolioPerformance({ opening, current, activities }: ManualPerformanceInput) {
  const hasActivityBeforeOrOnOpening = Boolean(
    opening &&
    activities.some((activity) => activity.date <= opening.date && capitalFlowCategories.has(activity.category)),
  );
  const usesOpeningBaseline = Boolean(opening && !hasActivityBeforeOrOnOpening);
  const baseline = opening && usesOpeningBaseline ? opening.value : new Big(0);
  const performanceActivities = opening
    ? usesOpeningBaseline
      ? activities.filter((activity) => activity.date > opening.date)
      : activities
    : [];
  const contributions = totalForCategory(performanceActivities, MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution);
  const withdrawals = totalForCategory(performanceActivities, MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.withdrawal);
  const gain =
    opening && current
      ? current
          .plus(withdrawals)
          .plus(totalForCategory(performanceActivities, MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.distribution))
          .minus(baseline)
          .minus(contributions)
      : null;

  return {
    baseline,
    gain,
    investedCapital: opening ? baseline.plus(contributions).minus(withdrawals) : null,
    performanceActivities,
    usesOpeningBaseline,
  };
}
