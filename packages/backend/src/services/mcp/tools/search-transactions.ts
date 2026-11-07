import { SORT_DIRECTIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { Money } from '@common/types/money';
import { serializeTransactions } from '@root/serializers/transactions.serializer';
import { getTransactions } from '@services/transactions/get-transactions';
import { z } from 'zod';

import { defineTool } from '../define-tool';
import { presentTransactions } from './transaction-output';

export const searchTransactionsTool = defineTool({
  name: 'search_transactions',
  toolset: 'core',
  access: 'read',
  description:
    'Search regular ledger transactions across all accessible accounts, including individual multi-account payment legs. Returns transaction amount (original + base currency), category, account, payee (payeeId and payee { id, name }), note, date, type, and tags. Filter by payee with payeeIds (get_payees resolves a name to an id) and by forecast state with isForecastOnly. Default: last 30 days, 50 items per page; future plans need a later endDate. Set allTime=true for all history; explicit dates still apply. Follow nextOffset while hasMore=true to retrieve every matching transaction. Investment trades use get_investment_transactions.',
  input: {
    startDate: z.string().optional().describe('Start date (ISO 8601). Default: 30 days ago'),
    endDate: z
      .string()
      .optional()
      .describe(
        'End date (ISO 8601). Default: now, which hides planned (future-dated) transactions. Set it to a future date to see upcoming plans',
      ),
    accountIds: z
      .array(recordId())
      .optional()
      .describe('Filter by account IDs. Omit to search all accessible accounts.'),
    categoryIds: z.array(recordId()).optional().describe('Filter by category IDs'),
    tagIds: z.array(recordId()).optional().describe('Filter by tag IDs'),
    payeeIds: z
      .array(recordId())
      .optional()
      .describe('Filter by payee (merchant) IDs. Use get_payees to resolve a merchant name to its id'),
    transactionType: z
      .enum([TRANSACTION_TYPES.income, TRANSACTION_TYPES.expense])
      .optional()
      .describe('Filter by transaction type'),
    amountMin: z.number().optional().describe('Minimum amount (decimal, in original currency)'),
    amountMax: z.number().optional().describe('Maximum amount (decimal, in original currency)'),
    search: z.string().optional().describe('Search in transaction notes'),
    limit: z.number().int().positive().optional().describe('Max results per page (default: 50, capped at 500)'),
    offset: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Pagination offset (default: 0). Follow nextOffset until hasMore is false.'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort order by date (default: desc)'),
    excludeTransfers: z.boolean().optional().describe('Exclude transfer transactions'),
    excludeRefunds: z.boolean().optional().describe('Exclude refund transactions'),
    isForecastOnly: z
      .boolean()
      .optional()
      .describe(
        'true: only your planned transactions (upcoming, not yet confirmed); false: only real ones. Omit for real ones plus your plans. Plans are dated in the future, so also set endDate beyond them',
      ),
    excludeBalanceAdjustments: z.boolean().optional().describe('Exclude balance adjustment entries'),
    allTime: z
      .boolean()
      .optional()
      .describe('Search all history without implicit date defaults. Explicit startDate/endDate still apply.'),
  },
  run: async ({ userId, args }) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const limit = Math.min(args.limit ?? 50, 500);
    const offset = args.offset ?? 0;

    const startDate = args.startDate ?? (args.allTime ? undefined : thirtyDaysAgo.toISOString());
    const endDate = args.endDate ?? (args.allTime ? undefined : now.toISOString());

    const filterParams = {
      userId,
      startDate,
      endDate,
      accountIds: args.accountIds,
      categoryIds: args.categoryIds,
      tagIds: args.tagIds,
      payeeIds: args.payeeIds,
      isForecastOnly: args.isForecastOnly,
      excludeBalanceAdjustments: args.excludeBalanceAdjustments,
      collapsePayments: false,
      transactionType: args.transactionType as TRANSACTION_TYPES | undefined,
      amountGte: args.amountMin !== undefined ? Money.fromDecimal(args.amountMin) : undefined,
      amountLte: args.amountMax !== undefined ? Money.fromDecimal(args.amountMax) : undefined,
      noteSearch: args.search ? [args.search] : undefined,
      limit: limit + 1,
      from: offset,
      order: args.order === 'asc' ? SORT_DIRECTIONS.asc : SORT_DIRECTIONS.desc,
      excludeTransfer: args.excludeTransfers,
      excludeRefunds: args.excludeRefunds,
    };

    const transactions = await getTransactions(filterParams);

    const hasMore = transactions.length > limit;
    const serialized = await presentTransactions({
      userId,
      transactions: serializeTransactions(transactions.slice(0, limit)),
    });

    return {
      transactions: serialized,
      count: serialized.length,
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + serialized.length : null,
    };
  },
});
