export interface PlanEngineAccount {
  id: string;
  balanceCents: number;
  isCreditCard: boolean;
}

export interface PlanEngineCategory {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  parentId: string | null;
  groupName: string | null;
}

export interface PlanEngineAssignment {
  categoryId: string;
  periodStart: string;
  assignedCents: number;
}

export interface PlanEngineTransaction {
  categoryId: string | null;
  periodStart: string;
  amountCents: number;
}

export interface PlanEngineUpcomingObligation {
  categoryId: string;
  periodStart: string;
  amountCents: number;
}

interface PlanEngineInput {
  periodStart: string;
  periodStartDay: number;
  accounts: PlanEngineAccount[];
  categories: PlanEngineCategory[];
  assignments: PlanEngineAssignment[];
  transactions: PlanEngineTransaction[];
  upcomingObligations: PlanEngineUpcomingObligation[];
}

interface PlanEngineCategoryResult extends PlanEngineCategory {
  assignedCents: number;
  activityCents: number;
  availableCents: number;
  upcomingObligationCents: number;
  underfundedByCents: number;
  status: 'none' | 'funded' | 'underfunded' | 'overspent';
}

interface PlanEngineResult {
  readyToAssignCents: number;
  categories: PlanEngineCategoryResult[];
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const assignedFor = ({
  assignments,
  categoryId,
  periodStart,
}: {
  assignments: PlanEngineAssignment[];
  categoryId: string;
  periodStart: string;
}) =>
  sum(
    assignments
      .filter((assignment) => assignment.categoryId === categoryId && assignment.periodStart === periodStart)
      .map((assignment) => assignment.assignedCents),
  );

const activityFor = ({
  transactions,
  categoryId,
  periodStart,
}: {
  transactions: PlanEngineTransaction[];
  categoryId: string;
  periodStart: string;
}) =>
  sum(
    transactions
      .filter((transaction) => transaction.categoryId === categoryId && transaction.periodStart === periodStart)
      .map((transaction) => transaction.amountCents),
  );

const periodsThroughSelected = ({
  periodStart,
  assignments,
  transactions,
}: {
  periodStart: string;
  assignments: PlanEngineAssignment[];
  transactions: PlanEngineTransaction[];
}) =>
  [
    ...new Set([
      ...assignments.map((assignment) => assignment.periodStart),
      ...transactions.map((transaction) => transaction.periodStart),
      periodStart,
    ]),
  ]
    .filter((start) => start <= periodStart)
    .sort();

export const calculatePlanView = ({
  periodStart,
  periodStartDay: _periodStartDay,
  accounts,
  categories,
  assignments,
  transactions,
  upcomingObligations,
}: PlanEngineInput): PlanEngineResult => {
  void _periodStartDay;
  const periods = periodsThroughSelected({ periodStart, assignments, transactions });
  const availableByCategory = new Map<string, number>();
  let priorCashOverspending = 0;

  for (const currentPeriod of periods) {
    for (const category of categories) {
      const previousAvailable = availableByCategory.get(category.id) ?? 0;
      const assignedCents = assignedFor({ assignments, categoryId: category.id, periodStart: currentPeriod });
      const activityCents = activityFor({ transactions, categoryId: category.id, periodStart: currentPeriod });
      const availableCents = Math.max(0, previousAvailable) + assignedCents + activityCents;

      if (currentPeriod < periodStart && availableCents < 0) {
        priorCashOverspending += -availableCents;
      }
      availableByCategory.set(category.id, availableCents);
    }
  }

  const spendableCashCents = sum(
    accounts.filter((account) => !account.isCreditCard).map((account) => account.balanceCents),
  );
  const assignedThroughSelected = sum(
    assignments
      .filter((assignment) => assignment.periodStart <= periodStart)
      .map((assignment) => assignment.assignedCents),
  );
  const readyToAssignCents = spendableCashCents - assignedThroughSelected - priorCashOverspending;

  const categoryResults = categories.map((category) => {
    const assignedCents = assignedFor({ assignments, categoryId: category.id, periodStart });
    const activityCents = activityFor({ transactions, categoryId: category.id, periodStart });
    const availableCents = availableByCategory.get(category.id) ?? 0;
    const upcomingObligationCents = sum(
      upcomingObligations
        .filter((obligation) => obligation.categoryId === category.id && obligation.periodStart === periodStart)
        .map((obligation) => obligation.amountCents),
    );
    const underfundedByCents = Math.max(0, upcomingObligationCents - availableCents);
    const status: PlanEngineCategoryResult['status'] =
      availableCents < 0
        ? 'overspent'
        : upcomingObligationCents === 0
          ? 'none'
          : underfundedByCents > 0
            ? 'underfunded'
            : 'funded';

    return {
      ...category,
      assignedCents,
      activityCents,
      availableCents,
      upcomingObligationCents,
      underfundedByCents,
      status,
    };
  });

  return { readyToAssignCents, categories: categoryResults };
};
