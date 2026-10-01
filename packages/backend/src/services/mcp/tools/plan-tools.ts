import { PLAN_STATUSES } from '@bt/shared/types';
import { currencyCode, dateBound, decimalMoney, recordId, uniqueRecordIds } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as plansService from '@services/plans/plans.service';
import { z } from 'zod';

import { assertMcpMutationAllowed, getUserId, jsonContent } from './helpers';

const planId = recordId().describe('Plan ID');
const periodStart = dateBound().describe('Plan period start date in YYYY-MM-DD format');
const mutationFields = {
  expectedRevision: z.number().int().nonnegative().describe('Revision returned by the latest plan view'),
  requestId: z.uuid().describe('Unique idempotency key for this allocation mutation'),
};

const listPlansInputSchema = {
  statuses: z
    .array(z.enum([PLAN_STATUSES.active, PLAN_STATUSES.archived]))
    .min(1)
    .optional()
    .describe('Statuses to include. Defaults to active plans.'),
};

export function registerGetPlans(server: McpServer) {
  server.registerTool(
    'get_plans',
    {
      description:
        "List the user's spending plans, including active or archived plans. Use get_plan_view for category balances, assignments, targets, and ready-to-assign money.",
      inputSchema: listPlansInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_plans', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.listPlans({ userId, statuses: args.statuses }) });
    },
  );
}

const createPlanInputSchema = {
  name: z.string().min(1).max(200).describe('Plan name'),
  baseCurrencyCode: currencyCode().describe('Plan currency; must match the user base currency'),
  periodStartDay: z.number().int().min(1).max(31).optional().describe('Calendar day that starts each plan period'),
  includeHistoricalTransactions: z
    .boolean()
    .optional()
    .describe('Include transactions from before the plan was created'),
  templateId: z.string().optional().describe('Optional built-in plan template ID'),
  categoryIds: uniqueRecordIds({ max: 1000 }).optional().describe('Categories to include in the plan'),
  accountIds: uniqueRecordIds({ max: 1000 }).optional().describe('Accounts whose money funds the plan'),
  isDefault: z.boolean().optional().describe('Make this the user default plan'),
};

export function registerCreatePlan(server: McpServer) {
  server.registerTool(
    'create_plan',
    {
      description:
        'Create a spending plan with selected accounts and categories. Amounts in plan views are decimal values; requires finance:write scope.',
      inputSchema: createPlanInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'create_plan', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.createPlan({ userId, ...args }) });
    },
  );
}

const getPlanInputSchema = { planId };

export function registerGetPlan(server: McpServer) {
  server.registerTool(
    'get_plan',
    {
      description: 'Retrieve a plan and its sharing permissions. Use get_plan_view for period calculations.',
      inputSchema: getPlanInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_plan', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.getPlan({ userId, planId: args.planId }) });
    },
  );
}

const getPlanViewInputSchema = {
  planId,
  periodStart,
};

export function registerGetPlanView(server: McpServer) {
  server.registerTool(
    'get_plan_view',
    {
      description:
        'Get a plan period view with decimal ready-to-assign money, category assignments/activity/available balances, targets, upcoming obligations, revision, and undo state.',
      inputSchema: getPlanViewInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_plan_view', clientId: extra.authInfo?.clientId });

      return jsonContent({
        data: await plansService.getPlanView({ userId, planId: args.planId, periodStart: args.periodStart }),
      });
    },
  );
}

const updatePlanInputSchema = {
  planId,
  name: z.string().min(1).max(200).optional().describe('New plan name'),
  periodStartDay: z.number().int().min(1).max(31).optional().describe('New period start day'),
  isDefault: z.boolean().optional().describe('Whether this is the default plan'),
};

export function registerUpdatePlan(server: McpServer) {
  server.registerTool(
    'update_plan',
    {
      description: 'Update a plan name, period start day, or default status. Requires finance:write scope.',
      inputSchema: updatePlanInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'update_plan', clientId: extra.authInfo?.clientId });

      const { planId: id, ...fields } = args;
      return jsonContent({ data: await plansService.updatePlan({ userId, planId: id, ...fields }) });
    },
  );
}

const archivePlanInputSchema = {
  planId,
  archived: z.boolean().describe('True to archive, false to restore'),
};

export function registerArchivePlan(server: McpServer) {
  server.registerTool(
    'archive_plan',
    {
      description: 'Archive or restore a spending plan. Requires finance:write scope.',
      inputSchema: archivePlanInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'archive_plan', clientId: extra.authInfo?.clientId });

      return jsonContent({
        data: await plansService.setPlanArchived({ userId, planId: args.planId, archived: args.archived }),
      });
    },
  );
}

export function registerDeletePlan(server: McpServer) {
  server.registerTool(
    'delete_plan',
    {
      description: 'Permanently delete a spending plan and its allocation data. Requires finance:delete scope.',
      inputSchema: getPlanInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_plan', clientId: extra.authInfo?.clientId });

      await plansService.deletePlan({ userId, planId: args.planId });
      return jsonContent({ data: null });
    },
  );
}

const addPlanCategoryInputSchema = {
  planId,
  categoryId: recordId().describe('Category ID to add to the plan'),
};

export function registerAddPlanCategory(server: McpServer) {
  server.registerTool(
    'add_plan_category',
    {
      description: 'Add an eligible spending category to a plan. Requires finance:write scope.',
      inputSchema: addPlanCategoryInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'add_plan_category', clientId: extra.authInfo?.clientId });

      return jsonContent({
        data: await plansService.addPlanCategory({ userId, planId: args.planId, categoryId: args.categoryId }),
      });
    },
  );
}

const planCategoryTargetInputSchema = {
  planId,
  categoryId: recordId().describe('Plan category ID'),
  amount: decimalMoney().describe('Positive target amount in the plan currency'),
  dueDate: dateBound().describe('Target due date in YYYY-MM-DD format'),
};

export function registerSetPlanCategoryTarget(server: McpServer) {
  server.registerTool(
    'set_plan_category_target',
    {
      description: 'Create or replace a category target amount and due date. Requires finance:write scope.',
      inputSchema: planCategoryTargetInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'set_plan_category_target', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.setPlanCategoryTarget({ userId, ...args }) });
    },
  );
}

const deletePlanCategoryTargetInputSchema = {
  planId,
  categoryId: recordId().describe('Plan category ID'),
};

export function registerDeletePlanCategoryTarget(server: McpServer) {
  server.registerTool(
    'delete_plan_category_target',
    {
      description: 'Remove a category target from a plan. Requires finance:write scope.',
      inputSchema: deletePlanCategoryTargetInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'delete_plan_category_target', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.deletePlanCategoryTarget({ userId, ...args }) });
    },
  );
}

const assignPlanCategoryInputSchema = {
  planId,
  periodStart,
  categoryId: recordId().describe('Category ID'),
  assigned: decimalMoney().describe('New assigned amount as a decimal'),
  ...mutationFields,
};

export function registerAssignPlanCategory(server: McpServer) {
  server.registerTool(
    'assign_plan_category',
    {
      description:
        'Set one category assignment for a plan period. Use the revision from get_plan_view and a fresh requestId; requires finance:write scope.',
      inputSchema: assignPlanCategoryInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'assign_plan_category', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.assignPlanCategory({ userId, ...args }) });
    },
  );
}

const bulkAssignPlanCategoriesInputSchema = {
  planId,
  periodStart,
  assignments: z
    .array(z.object({ categoryId: recordId(), assigned: decimalMoney() }))
    .min(1)
    .max(1000)
    .describe('Category assignments to replace in this mutation'),
  ...mutationFields,
};

export function registerBulkAssignPlanCategories(server: McpServer) {
  server.registerTool(
    'bulk_assign_plan_categories',
    {
      description:
        'Set multiple category assignments atomically for a plan period. Use the revision from get_plan_view; requires finance:write scope.',
      inputSchema: bulkAssignPlanCategoriesInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'bulk_assign_plan_categories', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.bulkAssignPlanCategories({ userId, ...args }) });
    },
  );
}

const movePlanMoneyInputSchema = {
  planId,
  periodStart,
  sourceCategoryId: recordId().describe('Category to move available money from'),
  destinationCategoryId: recordId().describe('Category to move available money to'),
  amount: decimalMoney().describe('Positive amount to move'),
  ...mutationFields,
};

export function registerMovePlanMoney(server: McpServer) {
  server.registerTool(
    'move_plan_money',
    {
      description:
        'Move available money between two categories in a plan period. Use the revision from get_plan_view; requires finance:write scope.',
      inputSchema: movePlanMoneyInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'move_plan_money', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.movePlanMoney({ userId, ...args }) });
    },
  );
}

const planPeriodMutationInputSchema = {
  planId,
  periodStart,
  ...mutationFields,
};

export function registerPreviewPlanAutoAssign(server: McpServer) {
  server.registerTool(
    'preview_plan_auto_assign',
    {
      description:
        'Preview automatic plan allocation for a period. Returns proposed decimal assignments, resulting ready-to-assign amount, and whether the caller can apply them.',
      inputSchema: { planId, periodStart },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'preview_plan_auto_assign', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.previewAutoAssign({ userId, ...args }) });
    },
  );
}

export function registerAutoAssignPlan(server: McpServer) {
  server.registerTool(
    'auto_assign_plan',
    {
      description:
        'Apply automatic plan allocation for a period using the current revision. Requires finance:write scope.',
      inputSchema: planPeriodMutationInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'auto_assign_plan', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.autoAssignPlan({ userId, ...args }) });
    },
  );
}

const undoPlanAllocationInputSchema = {
  planId,
  periodStart,
  eventId: recordId().describe('Allocation event ID from get_plan_view.undo'),
  ...mutationFields,
};

export function registerUndoPlanAllocation(server: McpServer) {
  server.registerTool(
    'undo_plan_allocation',
    {
      description:
        'Undo the latest eligible plan allocation event for a period. Use the eventId and revision from get_plan_view; requires finance:write scope.',
      inputSchema: undoPlanAllocationInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'undo_plan_allocation', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await plansService.undoPlanAllocation({ userId, ...args }) });
    },
  );
}
