import { dateBound, decimalMoney, recordId, uniqueRecordIds } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import * as plansService from '@services/plans/plans.service';
import { z } from 'zod';

const planIdParams = z.object({ id: recordId() });
const periodParams = z.object({ id: recordId(), periodStart: dateBound() });
const categoryTargetParams = z.object({ id: recordId(), categoryId: recordId() });
const mutationFields = {
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.uuid(),
};

export const listPlans = createController(
  z.object({
    query: z.object({ status: z.string().optional() }).optional().default({}),
  }),
  async ({ user, query }) => {
    const statuses = query.status?.split(',').filter(Boolean);
    const plans = await plansService.listPlans({ userId: user.id, statuses });
    return { data: plans };
  },
);

export const createPlan = createController(
  z.object({
    body: z.object({
      name: z.string().trim().min(1).max(200),
      baseCurrencyCode: z.string().trim().toUpperCase().length(3),
      periodStartDay: z.number().int().min(1).max(31).optional(),
      includeHistoricalTransactions: z.boolean().optional(),
      templateId: z.string().trim().optional(),
      categoryIds: uniqueRecordIds({ max: 1000 }).optional(),
      accountIds: uniqueRecordIds({ max: 1000 }).optional(),
      isDefault: z.boolean().optional(),
    }),
  }),
  async ({ user, body }) => ({
    data: await plansService.createPlan({ userId: user.id, ...body }),
    statusCode: 201,
  }),
);

export const addPlanCategory = createController(
  z.object({ params: planIdParams, body: z.object({ categoryId: recordId() }) }),
  async ({ user, params, body }) => ({
    data: await plansService.addPlanCategory({ userId: user.id, planId: params.id, ...body }),
  }),
);

export const setPlanCategoryTarget = createController(
  z.object({
    params: categoryTargetParams,
    body: z.object({
      amount: decimalMoney().refine((value) => value.toCents() > 0, { message: 'Target amount must be positive' }),
      dueDate: dateBound(),
    }),
  }),
  async ({ user, params, body }) => ({
    data: await plansService.setPlanCategoryTarget({
      userId: user.id,
      planId: params.id,
      categoryId: params.categoryId,
      ...body,
    }),
  }),
);

export const deletePlanCategoryTarget = createController(
  z.object({ params: categoryTargetParams }),
  async ({ user, params }) => ({
    data: await plansService.deletePlanCategoryTarget({
      userId: user.id,
      planId: params.id,
      categoryId: params.categoryId,
    }),
  }),
);

export const getPlan = createController(z.object({ params: planIdParams }), async ({ user, params }) => {
  const { plan } = await plansService.getPlan({ userId: user.id, planId: params.id });
  return { data: plan };
});

export const getPlanView = createController(
  z.object({ params: planIdParams, query: z.object({ periodStart: dateBound() }) }),
  async ({ user, params, query }) => ({
    data: await plansService.getPlanView({ userId: user.id, planId: params.id, periodStart: query.periodStart }),
  }),
);

export const updatePlan = createController(
  z.object({
    params: planIdParams,
    body: z.object({
      name: z.string().trim().min(1).max(200).optional(),
      periodStartDay: z.number().int().min(1).max(31).optional(),
      isDefault: z.boolean().optional(),
    }),
  }),
  async ({ user, params, body }) => ({
    data: await plansService.updatePlan({ userId: user.id, planId: params.id, ...body }),
  }),
);

export const archivePlan = createController(
  z.object({ params: planIdParams, body: z.object({ archived: z.boolean() }) }),
  async ({ user, params, body }) => ({
    data: await plansService.setPlanArchived({ userId: user.id, planId: params.id, archived: body.archived }),
  }),
);

export const deletePlan = createController(z.object({ params: planIdParams }), async ({ user, params }) => {
  await plansService.deletePlan({ userId: user.id, planId: params.id });
  return { data: null };
});

export const assignPlanCategory = createController(
  z.object({
    params: z.object({ id: recordId(), periodStart: dateBound(), categoryId: recordId() }),
    body: z.object({ assigned: decimalMoney(), ...mutationFields }),
  }),
  async ({ user, params, body }) => ({
    data: await plansService.assignPlanCategory({
      userId: user.id,
      planId: params.id,
      periodStart: params.periodStart,
      categoryId: params.categoryId,
      assigned: body.assigned,
      expectedRevision: body.expectedRevision,
      requestId: body.requestId,
    }),
  }),
);

export const movePlanMoney = createController(
  z.object({
    params: periodParams,
    body: z.object({
      sourceCategoryId: recordId(),
      destinationCategoryId: recordId(),
      amount: decimalMoney(),
      ...mutationFields,
    }),
  }),
  async ({ user, params, body }) => ({
    data: await plansService.movePlanMoney({
      userId: user.id,
      planId: params.id,
      periodStart: params.periodStart,
      ...body,
    }),
  }),
);

export const bulkAssignPlanCategories = createController(
  z.object({
    params: periodParams,
    body: z.object({
      assignments: z
        .array(z.object({ categoryId: recordId(), assigned: decimalMoney() }))
        .min(1)
        .max(1000)
        .superRefine((rows, context) => {
          if (new Set(rows.map((row) => row.categoryId)).size !== rows.length) {
            context.addIssue({ code: 'custom', message: t({ key: 'plans.duplicateCategories' }) });
          }
        }),
      ...mutationFields,
    }),
  }),
  async ({ user, params, body }) => ({
    data: await plansService.bulkAssignPlanCategories({
      userId: user.id,
      planId: params.id,
      periodStart: params.periodStart,
      ...body,
    }),
  }),
);

export const previewAutoAssign = createController(z.object({ params: periodParams }), async ({ user, params }) => ({
  data: await plansService.previewAutoAssign({ userId: user.id, planId: params.id, periodStart: params.periodStart }),
}));

export const autoAssign = createController(
  z.object({ params: periodParams, body: z.object(mutationFields) }),
  async ({ user, params, body }) => ({
    data: await plansService.autoAssignPlan({
      userId: user.id,
      planId: params.id,
      periodStart: params.periodStart,
      ...body,
    }),
  }),
);

export const undoPlanAllocation = createController(
  z.object({ params: periodParams, body: z.object({ eventId: recordId(), ...mutationFields }) }),
  async ({ user, params, body }) => ({
    data: await plansService.undoPlanAllocation({
      userId: user.id,
      planId: params.id,
      periodStart: params.periodStart,
      ...body,
    }),
  }),
);
