import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_STATUSES,
  PLAN_ALLOCATION_ACTIONS,
  PLAN_STATUSES,
  PLAN_VISIBILITIES,
  RecordId,
  SHARE_PERMISSIONS,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import Categories from '@models/categories.model';
import PlanAccountMemberships from '@models/plan-account-memberships.model';
import PlanAllocationEvents from '@models/plan-allocation-events.model';
import PlanAssignments from '@models/plan-assignments.model';
import PlanCategoryMemberships from '@models/plan-category-memberships.model';
import PlanPeriods from '@models/plan-periods.model';
import Plans from '@models/plan.model';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import { getBaseCurrency } from '@models/users-currencies.model';
import { withTransaction } from '@services/common/with-transaction';
import { canUserAccessResource } from '@services/sharing/auth/can-user-access-resource.service';
import { createHash } from 'node:crypto';
import { Op, UniqueConstraintError } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';

import { isIncomeCategory } from './plan-category-rules';
import { isPeriodStart } from './plan-periods';
import { isPlanTemplateId } from './plan-templates';
import { buildPlanView, PlanViewAccess } from './plan-views.service';

const planNotFound = () => new NotFoundError({ message: t({ key: 'plans.notFound' }) });
const fingerprint = ({ value }: { value: unknown }): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const authorizePlan = async ({
  userId,
  planId,
  requiredPermission,
}: {
  userId: number;
  planId: string;
  requiredPermission: 'read' | 'write';
}) => {
  const access = await canUserAccessResource({
    userId,
    resourceType: 'plan',
    resourceId: planId,
    requiredPermission,
  });
  if (!access.granted) throw planNotFound();
  const plan = await Plans.findOne({
    where: { id: planId, status: { [Op.in]: [PLAN_STATUSES.active, PLAN_STATUSES.archived] } },
  });
  if (!plan) throw planNotFound();
  return { plan, access };
};

const getOwnerPlan = async ({ userId, planId }: { userId: number; planId: string }) => {
  const plan = await Plans.findOne({ where: { id: planId, ownerUserId: userId } });
  if (!plan) throw planNotFound();
  return plan;
};

const ensureBaseCurrency = async ({ userId, currencyCode }: { userId: number; currencyCode: string }) => {
  const baseCurrency = await getBaseCurrency({ userId });
  if (!baseCurrency || baseCurrency.currencyCode !== currencyCode) {
    throw new ValidationError({
      message: t({ key: 'plans.baseCurrencyMustMatchUserBase' }),
      details: { currencyCode: baseCurrency?.currencyCode ?? null },
    });
  }
};

const getMembershipCategories = async ({ userId, categoryIds }: { userId: number; categoryIds?: string[] }) => {
  const allCategories = await Categories.findAll({
    where: { userId },
    order: [
      ['parentId', 'ASC'],
      ['name', 'ASC'],
    ],
  });
  const categories =
    categoryIds === undefined ? allCategories : allCategories.filter((category) => categoryIds.includes(category.id));
  if (categoryIds && categories.length !== categoryIds.length) {
    throw new ValidationError({ message: t({ key: 'plans.categoriesNotFound' }) });
  }
  if (categoryIds?.some((categoryId) => isIncomeCategory({ categoryId, categories: allCategories }))) {
    throw new ValidationError({ message: t({ key: 'plans.categoriesNotAllowedInSpendingPlan' }) });
  }
  return categoryIds === undefined
    ? categories.filter((category) => !isIncomeCategory({ categoryId: category.id, categories: allCategories }))
    : categories;
};

const getMembershipAccounts = async ({ userId, accountIds }: { userId: number; accountIds?: string[] }) => {
  const accounts = await Accounts.findAll({
    where: {
      userId,
      status: ACCOUNT_STATUSES.active,
      accountCategory: {
        [Op.in]: [
          ACCOUNT_CATEGORIES.general,
          ACCOUNT_CATEGORIES.cash,
          ACCOUNT_CATEGORIES.currentAccount,
          ACCOUNT_CATEGORIES.creditCard,
          ACCOUNT_CATEGORIES.saving,
          ACCOUNT_CATEGORIES.bonus,
          ACCOUNT_CATEGORIES.insurance,
          ACCOUNT_CATEGORIES.overdraft,
          ACCOUNT_CATEGORIES.crypto,
        ],
      },
      ...(accountIds ? { id: accountIds } : {}),
    },
    order: [['name', 'ASC']],
  });
  if (accountIds && accounts.length !== accountIds.length) {
    throw new ValidationError({ message: t({ key: 'plans.accountsNotFound' }) });
  }
  return accounts;
};

export const listPlans = async ({ userId, statuses }: { userId: number; statuses?: string[] }) => {
  const statusFilter = statuses ?? [PLAN_STATUSES.active];
  const [ownedPlans, sharedRows] = await Promise.all([
    Plans.findAll({
      where: { ownerUserId: userId, status: statusFilter },
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'ASC'],
      ],
    }),
    ResourceShares.findAll({
      where: { sharedWithUserId: userId, resourceType: 'plan', acceptedAt: { [Op.not]: null } },
      attributes: ['resourceId'],
    }),
  ]);
  const sharedIds = sharedRows.map((row) => row.resourceId).filter((id) => !ownedPlans.some((plan) => plan.id === id));
  if (!sharedIds.length) return ownedPlans;
  const sharedPlans = await Plans.findAll({
    where: { id: sharedIds, status: statusFilter },
    order: [['createdAt', 'ASC']],
  });
  return [...ownedPlans, ...sharedPlans];
};

export const createPlan = withTransaction(
  async ({
    userId,
    name,
    baseCurrencyCode,
    periodStartDay = 1,
    includeHistoricalTransactions = false,
    templateId,
    categoryIds,
    accountIds,
    isDefault = false,
  }: {
    userId: number;
    name: string;
    baseCurrencyCode: string;
    periodStartDay?: number;
    includeHistoricalTransactions?: boolean;
    templateId?: string;
    categoryIds?: string[];
    accountIds?: string[];
    isDefault?: boolean;
  }) => {
    if (templateId && !isPlanTemplateId(templateId)) {
      throw new ValidationError({ message: t({ key: 'plans.templateNotFound' }) });
    }
    if (periodStartDay < 1 || periodStartDay > 31) {
      throw new ValidationError({ message: t({ key: 'plans.invalidPeriodStartDay' }) });
    }
    await ensureBaseCurrency({ userId, currencyCode: baseCurrencyCode });
    const categories = await getMembershipCategories({ userId, categoryIds });
    const accounts = await getMembershipAccounts({ userId, accountIds });

    try {
      if (isDefault) {
        await Plans.update({ isDefault: false }, { where: { ownerUserId: userId, status: PLAN_STATUSES.active } });
      }
      const plan = await Plans.create({
        id: uuidv7(),
        ownerUserId: userId,
        name: name.trim(),
        visibility: PLAN_VISIBILITIES.private,
        status: PLAN_STATUSES.active,
        isDefault,
        baseCurrencyCode,
        periodStartDay,
        includeHistoricalTransactions,
        archivedAt: null,
      });

      await PlanCategoryMemberships.bulkCreate(
        categories.map((category) => ({
          id: uuidv7(),
          planId: plan.id,
          categoryId: category.id,
          active: true,
          detachedAt: null,
          categoryNameSnapshot: category.name,
          categoryGroupNameSnapshot: null,
        })),
      );
      await PlanAccountMemberships.bulkCreate(
        accounts.map((account) => ({
          id: uuidv7(),
          planId: plan.id,
          accountId: account.id,
          active: true,
          detachedAt: null,
          accountNameSnapshot: account.name,
          currencyCodeSnapshot: account.currencyCode,
        })),
      );
      return plan;
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictError({ message: t({ key: 'plans.membershipConflict' }) });
      }
      throw error;
    }
  },
);

export const addPlanCategory = withTransaction(
  async ({ userId, planId, categoryId }: { userId: number; planId: string; categoryId: RecordId }) => {
    const plan = await getOwnerPlan({ userId, planId });
    if (plan.status === PLAN_STATUSES.archived) {
      throw new ValidationError({ message: t({ key: 'plans.archivedCannotEdit' }) });
    }

    const category = await Categories.findOne({ where: { id: categoryId, userId } });
    if (!category) throw new ValidationError({ message: t({ key: 'plans.categoriesNotFound' }) });
    const allCategories = await Categories.findAll({ where: { userId }, attributes: ['id', 'parentId', 'key'] });
    if (isIncomeCategory({ categoryId, categories: allCategories })) {
      throw new ValidationError({ message: t({ key: 'plans.categoriesNotAllowedInSpendingPlan' }) });
    }

    if (category.parentId) {
      const parentMembership = await PlanCategoryMemberships.findOne({
        where: { planId, categoryId: category.parentId, active: true },
      });
      if (!parentMembership) {
        throw new ValidationError({ message: t({ key: 'plans.categoryNotInPlan' }) });
      }
    }

    const existing = await PlanCategoryMemberships.findOne({ where: { planId, categoryId } });
    if (existing?.active) throw new ConflictError({ message: t({ key: 'plans.membershipConflict' }) });

    try {
      if (existing) {
        await existing.update({
          active: true,
          detachedAt: null,
          categoryNameSnapshot: category.name,
          categoryGroupNameSnapshot: null,
        });
      } else {
        await PlanCategoryMemberships.create({
          id: uuidv7(),
          planId,
          categoryId: category.id,
          active: true,
          detachedAt: null,
          categoryNameSnapshot: category.name,
          categoryGroupNameSnapshot: null,
        });
      }
      return plan;
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictError({ message: t({ key: 'plans.membershipConflict' }) });
      }
      throw error;
    }
  },
);

export const getPlan = async ({ userId, planId }: { userId: number; planId: string }) => {
  const { plan, access } = await authorizePlan({ userId, planId, requiredPermission: 'read' });
  return { plan, access };
};

export const getPlanView = async ({
  userId,
  planId,
  periodStart,
}: {
  userId: number;
  planId: string;
  periodStart: string;
}) => {
  const { plan, access } = await authorizePlan({ userId, planId, requiredPermission: 'read' });
  if (!isPeriodStart({ periodStart, day: plan.periodStartDay })) {
    throw new ValidationError({ message: t({ key: 'plans.invalidPeriodStart' }) });
  }
  const viewAccess: PlanViewAccess = {
    isOwner: access.isOwner,
    effectivePermission: access.effectivePermission,
  };
  return buildPlanView({ plan, periodStart, access: viewAccess });
};

export const updatePlan = withTransaction(
  async ({
    userId,
    planId,
    name,
    periodStartDay,
    isDefault,
  }: {
    userId: number;
    planId: string;
    name?: string;
    periodStartDay?: number;
    isDefault?: boolean;
  }) => {
    const plan = await getOwnerPlan({ userId, planId });
    if (plan.status === PLAN_STATUSES.archived)
      throw new ValidationError({ message: t({ key: 'plans.archivedCannotEdit' }) });
    if (periodStartDay !== undefined && (periodStartDay < 1 || periodStartDay > 31)) {
      throw new ValidationError({ message: t({ key: 'plans.invalidPeriodStartDay' }) });
    }
    if (isDefault) {
      await Plans.update({ isDefault: false }, { where: { ownerUserId: userId, status: PLAN_STATUSES.active } });
    }
    await plan.update({
      name: name?.trim() ?? plan.name,
      periodStartDay: periodStartDay ?? plan.periodStartDay,
      isDefault: isDefault ?? plan.isDefault,
    });
    return plan;
  },
);

export const setPlanArchived = withTransaction(
  async ({ userId, planId, archived }: { userId: number; planId: string; archived: boolean }) => {
    const plan = await getOwnerPlan({ userId, planId });
    if (!archived && plan.status === PLAN_STATUSES.active) return plan;
    try {
      await plan.update({
        status: archived ? PLAN_STATUSES.archived : PLAN_STATUSES.active,
        archivedAt: archived ? new Date() : null,
        isDefault: archived ? false : plan.isDefault,
      });
      await PlanCategoryMemberships.update(
        { active: !archived, detachedAt: archived ? new Date() : null },
        { where: { planId } },
      );
      await PlanAccountMemberships.update(
        { active: !archived, detachedAt: archived ? new Date() : null },
        { where: { planId } },
      );
      return plan;
    } catch (error) {
      if (error instanceof UniqueConstraintError)
        throw new ConflictError({ message: t({ key: 'plans.membershipConflict' }) });
      throw error;
    }
  },
);

export const deletePlan = withTransaction(async ({ userId, planId }: { userId: number; planId: string }) => {
  const plan = await getOwnerPlan({ userId, planId });
  if (plan.isDefault) throw new ValidationError({ message: t({ key: 'plans.defaultCannotDelete' }) });
  await ResourceShares.destroy({ where: { resourceType: 'plan', resourceId: planId } });
  await ShareInvitations.destroy({ where: { resourceType: 'plan', resourceId: planId } });
  await plan.destroy();
});

type AllocationMutation = {
  userId: number;
  planId: string;
  periodStart: string;
  expectedRevision: number;
  requestId: string;
  action: (typeof PLAN_ALLOCATION_ACTIONS)[keyof typeof PLAN_ALLOCATION_ACTIONS];
  payload: unknown;
  mutate: ({ before }: { before: Record<string, number> }) => Promise<void>;
};

const getPeriod = async ({ planId, periodStart }: { planId: string; periodStart: string }) => {
  const [period] = await PlanPeriods.findOrCreate({
    where: { planId, periodStart },
    defaults: { id: uuidv7(), planId, periodStart, revision: 0 },
  });
  return period;
};

const getAssignmentSnapshot = async ({ planId, periodStart }: { planId: string; periodStart: string }) => {
  const assignments = await PlanAssignments.findAll({ where: { planId, periodStart } });
  return Object.fromEntries(
    assignments.map((assignment) => [assignment.categoryIdentity, assignment.assignedCents.toCents()]),
  );
};

const restoreAssignmentSnapshot = async ({
  planId,
  periodStart,
  snapshot,
}: {
  planId: string;
  periodStart: string;
  snapshot: Record<string, number>;
}) => {
  await PlanAssignments.destroy({ where: { planId, periodStart } });
  const categoryIds = Object.keys(snapshot);
  const categories = categoryIds.length ? await Categories.findAll({ where: { id: categoryIds } }) : [];
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const rows = Object.entries(snapshot)
    .filter(([, assignedCents]) => assignedCents !== 0)
    .map(([categoryIdentity, assignedCents]) => ({
      id: uuidv7(),
      planId,
      periodStart,
      categoryIdentity,
      categoryId: names.has(categoryIdentity as RecordId) ? (categoryIdentity as RecordId) : null,
      categoryNameSnapshot: names.get(categoryIdentity as RecordId) ?? 'Deleted category',
      assignedCents: Money.fromCents(assignedCents),
    }));
  if (rows.length) await PlanAssignments.bulkCreate(rows);
};

const performAllocationMutation = withTransaction(async (mutation: AllocationMutation) => {
  const { userId, planId, periodStart, expectedRevision, requestId, action, payload, mutate } = mutation;
  const { plan, access } = await authorizePlan({ userId, planId, requiredPermission: 'write' });
  if (plan.status === PLAN_STATUSES.archived)
    throw new ValidationError({ message: t({ key: 'plans.archivedCannotEdit' }) });
  if (!isPeriodStart({ periodStart, day: plan.periodStartDay })) {
    throw new ValidationError({ message: t({ key: 'plans.invalidPeriodStart' }) });
  }
  const payloadFingerprint = fingerprint({ value: payload });
  const existingEvent = await PlanAllocationEvents.findOne({ where: { planId, actorUserId: userId, requestId } });
  if (existingEvent) {
    if (existingEvent.payloadFingerprint !== payloadFingerprint) {
      throw new ConflictError({ message: t({ key: 'plans.requestIdReuse' }) });
    }
    return {
      view: await buildPlanView({ plan, periodStart, access }),
      mutation: {
        requestId,
        action: existingEvent.action,
        eventId: existingEvent.id,
        revision: existingEvent.resultRevision,
        recomputedFromPeriodStart: periodStart,
        recomputedThroughPeriodStart: periodStart,
      },
    };
  }

  const period = await getPeriod({ planId, periodStart });
  if (period.revision !== expectedRevision) {
    throw new ConflictError({
      message: t({ key: 'plans.revisionConflict' }),
      details: { currentRevision: period.revision, periodStart },
    });
  }
  const before = await getAssignmentSnapshot({ planId, periodStart });
  await mutate({ before });
  const after = await getAssignmentSnapshot({ planId, periodStart });
  const resultRevision = period.revision + 1;
  await period.update({ revision: resultRevision });
  const event = await PlanAllocationEvents.create({
    id: uuidv7(),
    planId,
    periodStart,
    actorUserId: userId,
    action,
    requestId,
    payloadFingerprint,
    before,
    after,
    expectedRevision,
    resultRevision,
    createdAt: new Date(),
  });
  const view = await buildPlanView({ plan, periodStart, access });
  return {
    view,
    mutation: {
      requestId,
      action,
      eventId: event.id,
      revision: resultRevision,
      recomputedFromPeriodStart: periodStart,
      recomputedThroughPeriodStart: periodStart,
    },
  };
});

const ensureCategoryInPlan = async ({ planId, categoryId }: { planId: string; categoryId: string }) => {
  const membership = await PlanCategoryMemberships.findOne({ where: { planId, categoryId, active: true } });
  if (!membership) throw new ValidationError({ message: t({ key: 'plans.categoryNotInPlan' }) });
  const category = await Categories.findByPk(categoryId, { attributes: ['id', 'parentId', 'key'] });
  if (category) {
    const categories = await Categories.findAll({
      where: { userId: category.userId },
      attributes: ['id', 'parentId', 'key'],
    });
    if (isIncomeCategory({ categoryId, categories })) {
      throw new ValidationError({ message: t({ key: 'plans.categoriesNotAllowedInSpendingPlan' }) });
    }
  }
  return membership;
};

const setAssignment = async ({
  planId,
  periodStart,
  categoryId,
  assigned,
  allowNegative = false,
}: {
  planId: string;
  periodStart: string;
  categoryId: string;
  assigned: Money;
  allowNegative?: boolean;
}) => {
  const membership = await ensureCategoryInPlan({ planId, categoryId });
  const assignedCents = assigned.toCents();
  if (!allowNegative && assignedCents < 0)
    throw new ValidationError({ message: t({ key: 'plans.assignmentMustBeNonNegative' }) });
  const existing = await PlanAssignments.findOne({ where: { planId, periodStart, categoryIdentity: categoryId } });
  if (assignedCents === 0) {
    if (existing) await existing.destroy();
    return;
  }
  if (existing) {
    await existing.update({ assignedCents: assigned });
  } else {
    await PlanAssignments.create({
      id: uuidv7(),
      planId,
      periodStart,
      categoryIdentity: categoryId,
      categoryId,
      categoryNameSnapshot: membership.categoryNameSnapshot,
      assignedCents: assigned,
    });
  }
};

export const assignPlanCategory = ({
  userId,
  planId,
  periodStart,
  categoryId,
  assigned,
  expectedRevision,
  requestId,
}: {
  userId: number;
  planId: string;
  periodStart: string;
  categoryId: string;
  assigned: Money;
  expectedRevision: number;
  requestId: string;
}) =>
  performAllocationMutation({
    userId,
    planId,
    periodStart,
    expectedRevision,
    requestId,
    action: PLAN_ALLOCATION_ACTIONS.assignment,
    payload: { categoryId, assigned: assigned.toString() },
    mutate: async () => setAssignment({ planId, periodStart, categoryId, assigned }),
  });

export const movePlanMoney = ({
  userId,
  planId,
  periodStart,
  sourceCategoryId,
  destinationCategoryId,
  amount,
  expectedRevision,
  requestId,
}: {
  userId: number;
  planId: string;
  periodStart: string;
  sourceCategoryId: string;
  destinationCategoryId: string;
  amount: Money;
  expectedRevision: number;
  requestId: string;
}) =>
  performAllocationMutation({
    userId,
    planId,
    periodStart,
    expectedRevision,
    requestId,
    action: PLAN_ALLOCATION_ACTIONS.move,
    payload: { sourceCategoryId, destinationCategoryId, amount: amount.toString() },
    mutate: async () => {
      if (sourceCategoryId === destinationCategoryId)
        throw new ValidationError({ message: t({ key: 'plans.moveSameCategory' }) });
      await ensureCategoryInPlan({ planId, categoryId: sourceCategoryId });
      await ensureCategoryInPlan({ planId, categoryId: destinationCategoryId });
      if (!amount.isPositive()) throw new ValidationError({ message: t({ key: 'plans.moveAmountMustBePositive' }) });
      const plan = await Plans.findByPk(planId);
      if (!plan) throw planNotFound();
      const view = await buildPlanView({
        plan,
        periodStart,
        access: { isOwner: true, effectivePermission: SHARE_PERMISSIONS.manage },
      });
      const source = view.groups
        .flatMap((group) => group.categories)
        .find((category) => category.id === sourceCategoryId);
      if (!source || source.available < amount.toNumber()) {
        throw new ConflictError({ message: t({ key: 'plans.insufficientAvailable' }) });
      }
      const sourceAssigned = Money.fromDecimal(source.assigned);
      const destination = view.groups
        .flatMap((group) => group.categories)
        .find((category) => category.id === destinationCategoryId);
      if (!destination) throw new ValidationError({ message: t({ key: 'plans.categoryNotInPlan' }) });
      await setAssignment({
        planId,
        periodStart,
        categoryId: sourceCategoryId,
        assigned: sourceAssigned.subtract(amount),
        allowNegative: true,
      });
      await setAssignment({
        planId,
        periodStart,
        categoryId: destinationCategoryId,
        assigned: Money.fromDecimal(destination.assigned).add(amount),
      });
    },
  });

export const bulkAssignPlanCategories = ({
  userId,
  planId,
  periodStart,
  assignments,
  expectedRevision,
  requestId,
}: {
  userId: number;
  planId: string;
  periodStart: string;
  assignments: Array<{ categoryId: string; assigned: Money }>;
  expectedRevision: number;
  requestId: string;
}) =>
  performAllocationMutation({
    userId,
    planId,
    periodStart,
    expectedRevision,
    requestId,
    action: PLAN_ALLOCATION_ACTIONS.bulkAssignment,
    payload: {
      assignments: assignments.map(({ categoryId, assigned }) => ({ categoryId, assigned: assigned.toString() })),
    },
    mutate: async () => {
      for (const assignment of assignments) {
        await setAssignment({ planId, periodStart, categoryId: assignment.categoryId, assigned: assignment.assigned });
      }
    },
  });

const calculateAutoAssignChanges = async ({ planId, periodStart }: { planId: string; periodStart: string }) => {
  const plan = await Plans.findByPk(planId);
  if (!plan) throw planNotFound();
  const view = await buildPlanView({
    plan,
    periodStart,
    access: { isOwner: true, effectivePermission: SHARE_PERMISSIONS.manage },
  });
  const previousStart = view.period.previousStart;
  const previousAssignments = previousStart
    ? await PlanAssignments.findAll({ where: { planId, periodStart: previousStart } })
    : [];
  const previousByCategory = new Map(
    previousAssignments.map((assignment) => [assignment.categoryIdentity, assignment.assignedCents.toCents()]),
  );
  let remaining: number = Money.fromDecimal(view.readyToAssign).toCents();
  const changes: Array<{ categoryId: string; currentAssignedCents: number; proposedAssignedCents: number }> = [];

  for (const category of view.groups.flatMap((group) => group.categories)) {
    const currentAssignedCents = Money.fromDecimal(category.assigned).toCents();
    const previousAssignedCents = previousByCategory.get(category.id) ?? 0;
    const amount = Math.min(Math.max(0, previousAssignedCents - currentAssignedCents), Math.max(0, remaining));
    if (amount > 0) {
      changes.push({
        categoryId: category.id,
        currentAssignedCents,
        proposedAssignedCents: currentAssignedCents + amount,
      });
      remaining -= amount;
    }
  }

  return { plan, view, changes, readyToAssignAfterCents: remaining };
};

export const previewAutoAssign = async ({
  userId,
  planId,
  periodStart,
}: {
  userId: number;
  planId: string;
  periodStart: string;
}) => {
  const { plan, access } = await authorizePlan({ userId, planId, requiredPermission: 'read' });
  if (!isPeriodStart({ periodStart, day: plan.periodStartDay })) {
    throw new ValidationError({ message: t({ key: 'plans.invalidPeriodStart' }) });
  }
  const result = await calculateAutoAssignChanges({ planId, periodStart });
  return {
    revision: result.view.period.revision,
    changes: result.changes.map((change) => ({
      categoryId: change.categoryId,
      currentAssigned: Money.fromCents(change.currentAssignedCents).toNumber(),
      proposedAssigned: Money.fromCents(change.proposedAssignedCents).toNumber(),
    })),
    readyToAssignAfter: Money.fromCents(result.readyToAssignAfterCents).toNumber(),
    canApply:
      access.effectivePermission === SHARE_PERMISSIONS.write || access.effectivePermission === SHARE_PERMISSIONS.manage,
  };
};

export const autoAssignPlan = ({
  userId,
  planId,
  periodStart,
  expectedRevision,
  requestId,
}: {
  userId: number;
  planId: string;
  periodStart: string;
  expectedRevision: number;
  requestId: string;
}) =>
  performAllocationMutation({
    userId,
    planId,
    periodStart,
    expectedRevision,
    requestId,
    action: PLAN_ALLOCATION_ACTIONS.autoAssign,
    payload: { expectedRevision },
    mutate: async () => {
      const result = await calculateAutoAssignChanges({ planId, periodStart });
      for (const change of result.changes) {
        await setAssignment({
          planId,
          periodStart,
          categoryId: change.categoryId,
          assigned: Money.fromCents(change.proposedAssignedCents),
        });
      }
    },
  });

export const undoPlanAllocation = ({
  userId,
  planId,
  periodStart,
  eventId,
  expectedRevision,
  requestId,
}: {
  userId: number;
  planId: string;
  periodStart: string;
  eventId: string;
  expectedRevision: number;
  requestId: string;
}) =>
  performAllocationMutation({
    userId,
    planId,
    periodStart,
    expectedRevision,
    requestId,
    action: PLAN_ALLOCATION_ACTIONS.undo,
    payload: { eventId },
    mutate: async () => {
      const event = await PlanAllocationEvents.findOne({ where: { id: eventId, planId, periodStart } });
      if (!event || event.action === PLAN_ALLOCATION_ACTIONS.undo || event.resultRevision !== expectedRevision) {
        throw new ConflictError({ message: t({ key: 'plans.undoUnavailable' }) });
      }
      await restoreAssignmentSnapshot({ planId, periodStart, snapshot: event.before });
    },
  });
