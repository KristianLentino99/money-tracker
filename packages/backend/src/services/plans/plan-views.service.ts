import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_STATUSES,
  SHARE_PERMISSIONS,
  TRANSACTION_TYPES,
  RecordId,
  endpointsTypes,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import Categories from '@models/categories.model';
import PlanAccountMemberships from '@models/plan-account-memberships.model';
import PlanAllocationEvents from '@models/plan-allocation-events.model';
import PlanAssignments from '@models/plan-assignments.model';
import PlanCategoryMemberships from '@models/plan-category-memberships.model';
import PlanPeriods from '@models/plan-periods.model';
import Plans from '@models/plan.model';
import TransactionSplits from '@models/transaction-splits.model';
import { findTransactions } from '@models/transactions-query';
import Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

import { isIncomeCategory } from './plan-category-rules';
import {
  calculatePlanView,
  PlanEngineAccount,
  PlanEngineAssignment,
  PlanEngineCategory,
  PlanEngineTransaction,
  PlanEngineUpcomingObligation,
} from './plan-engine';
import { isPeriodStart, nextPeriodStart, periodEnd, periodStartForDate, previousPeriodStart } from './plan-periods';

const signedTransactionCents = ({ transaction }: { transaction: Transactions }): number => {
  const cents = transaction.refAmount.toCents();
  return transaction.transactionType === TRANSACTION_TYPES.income ? cents : -cents;
};

const signedSplitCents = ({ transaction, split }: { transaction: Transactions; split: TransactionSplits }): number => {
  const cents = split.amount.toCents();
  return transaction.transactionType === TRANSACTION_TYPES.income ? cents : -cents;
};

const toDecimal = ({ cents }: { cents: number }) => Money.fromCents(cents).toNumber();

export interface PlanViewAccess {
  isOwner: boolean;
  effectivePermission: string;
}

export const buildPlanView = async ({
  plan,
  periodStart,
  access,
}: {
  plan: Plans;
  periodStart: string;
  access: PlanViewAccess;
}): Promise<endpointsTypes.PlanViewResponse> => {
  const categoryMemberships = await PlanCategoryMemberships.findAll({
    where: { planId: plan.id, active: true, categoryId: { [Op.not]: null } },
    include: [{ model: Categories, as: 'category' }],
  });
  const accountMemberships = await PlanAccountMemberships.findAll({
    where: { planId: plan.id, active: true, accountId: { [Op.not]: null } },
    include: [{ association: 'account' }],
  });
  const categoryAncestry = await Categories.findAll({
    where: { userId: plan.ownerUserId },
    attributes: ['id', 'parentId', 'key'],
  });

  const categories: PlanEngineCategory[] = categoryMemberships
    .filter((membership) => membership.category)
    .filter((membership) => !isIncomeCategory({ categoryId: membership.category!.id, categories: categoryAncestry }))
    .map((membership) => {
      const category = membership.category!;
      return {
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        parentId: category.parentId,
        groupName: null,
      };
    });
  const categoryIds = categories.map((category) => category.id);
  const accountIds = accountMemberships.map((membership) => membership.accountId).filter(Boolean) as string[];

  const accounts: PlanEngineAccount[] = accountMemberships
    .filter((membership) => membership.account && membership.account.status === ACCOUNT_STATUSES.active)
    .map((membership) => ({
      id: membership.account!.id,
      balanceCents: membership.account!.refCurrentBalance.toCents(),
      isCreditCard: membership.account!.accountCategory === ACCOUNT_CATEGORIES.creditCard,
    }));

  const assignments = await PlanAssignments.findAll({ where: { planId: plan.id } });
  const assignmentRows: PlanEngineAssignment[] = assignments
    .filter((assignment) => categoryIds.includes(assignment.categoryIdentity as RecordId))
    .map((assignment) => ({
      categoryId: assignment.categoryIdentity,
      periodStart: assignment.periodStart,
      assignedCents: assignment.assignedCents.toCents(),
    }));

  const transactions = accountIds.length
    ? await findTransactions({
        planned: 'exclude',
        access: 'unscoped-internal',
        balanceAdjustments: 'include',
        completeness: 'all',
        where: { accountId: accountIds, isForecastOnly: false },
        include: [{ model: TransactionSplits, as: 'splits', required: false }],
      })
    : [];
  const transactionRows: PlanEngineTransaction[] = [];
  const upcomingRows: PlanEngineUpcomingObligation[] = [];
  const upcomingByCategory = new Map<string, { amountCents: number; dueDate: string; count: number }>();
  const planCreatedAt = plan.createdAt.getTime();

  for (const transaction of transactions) {
    if (!plan.includeHistoricalTransactions && new Date(transaction.time).getTime() < planCreatedAt) continue;
    const txPeriodStart = periodStartForDate({ date: transaction.time, day: plan.periodStartDay });
    if (transaction.splits?.length) {
      for (const split of transaction.splits) {
        if (categoryIds.includes(split.categoryId)) {
          transactionRows.push({
            categoryId: split.categoryId,
            periodStart: txPeriodStart,
            amountCents: signedSplitCents({ transaction, split }),
          });
        }
      }
    } else if (transaction.categoryId && categoryIds.includes(transaction.categoryId)) {
      transactionRows.push({
        categoryId: transaction.categoryId,
        periodStart: txPeriodStart,
        amountCents: signedTransactionCents({ transaction }),
      });
    }
  }

  const forecastTransactions = accountIds.length
    ? await findTransactions({
        planned: 'only',
        access: 'unscoped-internal',
        balanceAdjustments: 'include',
        completeness: 'all',
        where: {
          accountId: accountIds,
          isForecastOnly: true,
          categoryId: categoryIds,
          time: { [Op.lte]: new Date(`${periodEnd({ periodStart, day: plan.periodStartDay })}T23:59:59.999Z`) },
        },
      })
    : [];
  for (const transaction of forecastTransactions) {
    if (!transaction.categoryId) continue;
    const forecastPeriodStart = periodStartForDate({ date: transaction.time, day: plan.periodStartDay });
    const amountCents = Math.abs(signedTransactionCents({ transaction }));
    upcomingRows.push({ categoryId: transaction.categoryId, periodStart: forecastPeriodStart, amountCents });
    if (forecastPeriodStart === periodStart) {
      const current = upcomingByCategory.get(transaction.categoryId);
      const dueDate = transaction.time.toISOString().slice(0, 10);
      upcomingByCategory.set(transaction.categoryId, {
        amountCents: (current?.amountCents ?? 0) + amountCents,
        dueDate: current?.dueDate && current.dueDate < dueDate ? current.dueDate : dueDate,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  const engine = calculatePlanView({
    periodStart,
    periodStartDay: plan.periodStartDay,
    accounts,
    categories,
    assignments: assignmentRows,
    transactions: transactionRows,
    upcomingObligations: upcomingRows,
  });

  const categoryByParent = new Map<string, typeof engine.categories>();
  for (const category of engine.categories) {
    const key = category.parentId ?? '__root__';
    const group = categoryByParent.get(key) ?? [];
    group.push(category);
    categoryByParent.set(key, group);
  }
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const groups = [...categoryByParent.entries()].map(([groupId, groupCategories]) => ({
    id: groupId === '__root__' ? null : (groupId as RecordId),
    name: groupId === '__root__' ? 'Categories' : (categoryMap.get(groupId)?.name ?? 'Categories'),
    categories: groupCategories.map((category) => {
      const upcoming = upcomingByCategory.get(category.id);
      return {
        id: category.id as RecordId,
        name: category.name,
        color: category.color,
        icon: category.icon,
        parentId: category.parentId as RecordId | null,
        assigned: toDecimal({ cents: category.assignedCents }),
        activity: toDecimal({ cents: category.activityCents }),
        available: toDecimal({ cents: category.availableCents }),
        status: category.status,
        upcomingObligation: upcoming ? toDecimal({ cents: upcoming.amountCents }) : null,
        underfundedBy: category.underfundedByCents > 0 ? toDecimal({ cents: category.underfundedByCents }) : null,
      };
    }),
  }));

  const currentPeriod = isPeriodStart({ periodStart, day: plan.periodStartDay });
  const latestUndo = await PlanAllocationEvents.findOne({
    where: { planId: plan.id, periodStart, action: { [Op.ne]: 'undo' } },
    order: [['createdAt', 'DESC']],
  });
  const undo = latestUndo
    ? {
        eventId: latestUndo.id,
        action: latestUndo.action,
        canUndo: latestUndo.resultRevision === (await getRevision({ planId: plan.id, periodStart })),
      }
    : null;

  const readyToAssign = toDecimal({ cents: engine.readyToAssignCents });
  return {
    plan: {
      id: plan.id,
      ownerUserId: plan.ownerUserId,
      name: plan.name,
      visibility: plan.visibility,
      status: plan.status,
      isDefault: plan.isDefault,
      baseCurrencyCode: plan.baseCurrencyCode,
      periodStartDay: plan.periodStartDay,
      includeHistoricalTransactions: plan.includeHistoricalTransactions,
      archivedAt: plan.archivedAt,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      canAllocate:
        access.effectivePermission === SHARE_PERMISSIONS.write ||
        access.effectivePermission === SHARE_PERMISSIONS.manage,
      canManage: access.isOwner,
      canArchive: access.isOwner,
      canShare: access.isOwner,
    },
    period: {
      start: periodStart,
      end: periodEnd({ periodStart, day: plan.periodStartDay }),
      isCurrent: currentPeriod,
      previousStart: previousPeriodStart({ periodStart, day: plan.periodStartDay }),
      nextStart: nextPeriodStart({ periodStart, day: plan.periodStartDay }),
      revision: await getRevision({ planId: plan.id, periodStart }),
    },
    readyToAssign,
    readyToAssignState:
      engine.readyToAssignCents > 0 ? 'positive' : engine.readyToAssignCents < 0 ? 'negative' : 'zero',
    readyToAssignDeficit: engine.readyToAssignCents < 0 ? toDecimal({ cents: -engine.readyToAssignCents }) : null,
    groups,
    upcomingObligations: [...upcomingByCategory.entries()].map(([categoryId, value]) => ({
      categoryId: categoryId as RecordId,
      amount: toDecimal({ cents: value.amountCents }),
      dueDate: value.dueDate,
      count: value.count,
    })),
    undo,
  };
};

const getRevision = async ({ planId, periodStart }: { planId: string; periodStart: string }): Promise<number> => {
  const period = await PlanPeriods.findOne({ where: { planId, periodStart }, attributes: ['revision'], raw: true });
  return (period as { revision?: number } | null)?.revision ?? 0;
};
