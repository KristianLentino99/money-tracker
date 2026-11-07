import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { getSubscriptions } from '@services/subscriptions';
import { z } from 'zod';

import { defineTool } from '../define-tool';

export const getSubscriptionsTool = defineTool({
  name: 'get_subscriptions',
  toolset: 'subscriptions',
  access: 'read',
  description:
    'List all subscriptions and recurring bills for the user. Returns name, frequency, expected amount, linked account/category, active state, and linked transaction count. Use isActive to filter active-only.',
  input: {
    isActive: z.boolean().optional().describe('Filter by active state. Omit to return all subscriptions'),
    type: z
      .enum([SUBSCRIPTION_TYPES.subscription, SUBSCRIPTION_TYPES.bill, SUBSCRIPTION_TYPES.installment])
      .optional()
      .describe('Filter by type: "subscription", "bill", or "installment"'),
  },
  run: async ({ userId, args }) => {
    const result = await getSubscriptions({ userId, isActive: args.isActive, type: args.type });

    // Drop userId, matchingRules (engine config blob), bare account/category FKs
    // (the embedded objects already carry them), audit timestamps and category UI hints.
    return result.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      expectedAmount: s.expectedAmount,
      expectedCurrencyCode: s.expectedCurrencyCode,
      frequency: s.frequency,
      startDate: s.startDate,
      endDate: s.endDate,
      dueDate: s.dueDate,
      loanAccountId: s.loanAccountId ?? s.loan?.id ?? null,
      loan: s.loan ? { id: s.loan.id, name: s.loan.name, currencyCode: s.loan.currencyCode } : null,
      maxOccurrences: s.maxOccurrences,
      completedAt: s.completedAt,
      isActive: s.isActive,
      transactionType: s.transactionType,
      tagIds: s.tagIds,
      notes: s.notes,
      linkedTransactionsCount: s.linkedTransactionsCount,
      paidPeriodsCount: s.paidPeriodsCount,
      currentPeriod: s.currentPeriod,
      nextDueDate: s.nextDueDate,
      account: s.account,
      category: s.category ? { id: s.category.id, name: s.category.name } : null,
    }));
  },
});
