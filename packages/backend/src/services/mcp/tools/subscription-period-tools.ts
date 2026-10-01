import { dateBound, recordId } from '@common/lib/zod/custom-types';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { slimTransactionsForMcp } from '@services/mcp/serializers';
import { getSubscriptionPayPreview } from '@services/subscriptions/get-pay-preview';
import { getPeriods } from '@services/subscriptions/get-periods';
import { linkInstallmentToLoan, unlinkInstallmentFromLoan } from '@services/subscriptions/link-installment-to-loan';
import { markPeriodPaid } from '@services/subscriptions/mark-period-paid';
import { revertPeriod } from '@services/subscriptions/revert-period';
import { skipPeriod } from '@services/subscriptions/skip-period';
import { suggestHistoricalMatches } from '@services/subscriptions/suggest-historical-matches';
import { unlinkTransaction } from '@services/subscriptions/unlink-transaction';
import { z } from 'zod';

import { assertMcpMutationAllowed, getUserId, jsonContent } from './helpers';

const subscriptionId = recordId().describe('Subscription ID');
const periodId = recordId().describe('Subscription period ID');

const getPeriodsInputSchema = {
  subscriptionId,
  limit: z.number().int().positive().max(50).optional().describe('Maximum periods to return; defaults to 6'),
  offset: z.number().int().nonnegative().optional().describe('Number of periods to skip'),
};

export function registerGetSubscriptionPeriods(server: McpServer) {
  server.registerTool(
    'get_subscription_periods',
    {
      description:
        'List generated periods for a subscription or installment, including due date, status, paid date, linked transaction, notes, and total count.',
      inputSchema: getPeriodsInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_subscription_periods', clientId: extra.authInfo?.clientId });

      const result = await getPeriods({
        userId,
        subscriptionId: args.subscriptionId,
        limit: args.limit,
        offset: args.offset,
      });
      return jsonContent({ data: result });
    },
  );
}

export function registerGetSubscriptionPayPreview(server: McpServer) {
  server.registerTool(
    'get_subscription_pay_preview',
    {
      description:
        'Preview the decimal amount and currency that paying a subscription period would book, including cross-currency conversion when an account is linked.',
      inputSchema: { subscriptionId },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_subscription_pay_preview', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await getSubscriptionPayPreview({ userId, subscriptionId: args.subscriptionId }) });
    },
  );
}

const paySubscriptionPeriodInputSchema = {
  subscriptionId,
  periodId,
  transactionId: recordId().nullable().optional().describe('Existing transaction to link to this period'),
  notes: z.string().max(5000).nullable().optional().describe('Payment notes'),
  createTransaction: z.boolean().optional().describe('Create the expense transaction from the subscription'),
  amount: z.number().positive().optional().describe('Decimal amount for a created transaction'),
  time: z
    .union([dateBound(), dateBound({ precision: 'datetime', offset: true })])
    .transform((value) => new Date(value))
    .optional()
    .describe('ISO payment date/time for a created transaction'),
  accountId: recordId().nullable().optional().describe('Account for a created transaction'),
  confirmOverpay: z.boolean().optional().describe('Confirm a loan installment payment that settles beyond zero'),
};

export function registerPaySubscriptionPeriod(server: McpServer) {
  server.registerTool(
    'pay_subscription_period',
    {
      description:
        'Mark a subscription period paid by linking an existing transaction or creating a new expense. Loan-linked installments require a real transaction and may require confirmOverpay=true. Requires finance:write scope.',
      inputSchema: paySubscriptionPeriodInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'pay_subscription_period', clientId: extra.authInfo?.clientId });

      if (args.createTransaction && args.transactionId != null) {
        throw new Error('createTransaction and transactionId cannot be used together');
      }

      const period = await markPeriodPaid({
        userId,
        subscriptionId: args.subscriptionId,
        periodId: args.periodId,
        transactionId: args.transactionId,
        notes: args.notes,
        createTransaction: args.createTransaction,
        amount: args.amount,
        time: args.time,
        accountId: args.accountId,
        confirmOverpay: args.confirmOverpay,
      });
      return jsonContent({ data: period });
    },
  );
}

const subscriptionPeriodActionInputSchema = {
  subscriptionId,
  periodId,
};

export function registerSkipSubscriptionPeriod(server: McpServer) {
  server.registerTool(
    'skip_subscription_period',
    {
      description: 'Skip an upcoming subscription period without creating a transaction. Requires finance:write scope.',
      inputSchema: subscriptionPeriodActionInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'skip_subscription_period', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await skipPeriod({ userId, ...args }) });
    },
  );
}

export function registerUnlinkSubscriptionPeriodTransaction(server: McpServer) {
  server.registerTool(
    'unlink_subscription_period_transaction',
    {
      description:
        'Detach the transaction from a subscription period while keeping the transaction in the ledger. Requires finance:write scope.',
      inputSchema: subscriptionPeriodActionInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'unlink_subscription_period_transaction', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await unlinkTransaction({ userId, ...args }) });
    },
  );
}

export function registerRevertSubscriptionPeriod(server: McpServer) {
  server.registerTool(
    'revert_subscription_period',
    {
      description:
        'Reopen a paid or skipped subscription period. Auto-created payment transactions are removed; user-linked transactions are kept. Requires finance:write scope.',
      inputSchema: subscriptionPeriodActionInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'revert_subscription_period', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await revertPeriod({ userId, ...args }) });
    },
  );
}

export function registerSuggestSubscriptionMatches(server: McpServer) {
  server.registerTool(
    'suggest_subscription_matches',
    {
      description:
        "Suggest up to 100 recent real transactions matching a subscription's matching rules and excluding already linked transactions.",
      inputSchema: { subscriptionId },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'suggest_subscription_matches', clientId: extra.authInfo?.clientId });

      const suggestions = await suggestHistoricalMatches({ userId, subscriptionId: args.subscriptionId });
      return jsonContent({ data: slimTransactionsForMcp(suggestions) });
    },
  );
}

const linkInstallmentToLoanInputSchema = {
  subscriptionId,
  loanAccountId: recordId().describe('Loan account ID'),
};

export function registerLinkInstallmentToLoan(server: McpServer) {
  server.registerTool(
    'link_installment_to_loan',
    {
      description:
        'Link an expense installment subscription to an active loan account. The loan must still have an outstanding balance. Requires finance:write scope.',
      inputSchema: linkInstallmentToLoanInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'link_installment_to_loan', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await linkInstallmentToLoan({ userId, ...args }) });
    },
  );
}

export function registerUnlinkInstallmentFromLoan(server: McpServer) {
  server.registerTool(
    'unlink_installment_from_loan',
    {
      description: 'Remove the loan association from an installment subscription. Requires finance:write scope.',
      inputSchema: { subscriptionId },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'unlink_installment_from_loan', clientId: extra.authInfo?.clientId });

      return jsonContent({ data: await unlinkInstallmentFromLoan({ userId, subscriptionId: args.subscriptionId }) });
    },
  );
}
