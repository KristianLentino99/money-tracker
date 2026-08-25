import * as Transactions from '@models/transactions.model';
import { getAccessibleAccountIdsForUser } from '@services/sharing/auth/get-accessible-account-ids.service';

type FindWithFiltersParams = Parameters<typeof Transactions.findWithFilters>[0];

/** The page size the list endpoint falls back to when the client asks for no specific one. */
const DEFAULT_PAGE_SIZE = 20;

/** This service resolves the caller's visible rows, translates the HTTP pagination vocabulary,
 * and maps the endpoint's forecast and balance-adjustment query params to transaction policies. */
type GetTransactionsParams = Omit<
  FindWithFiltersParams,
  'isRaw' | 'access' | 'planned' | 'completeness' | 'balanceAdjustments'
> & {
  userId: number;
  from?: number;
  limit?: number;
  /** Absent = real rows + the caller's own plans; `true` = only the caller's plans; `false` = real rows only. */
  isForecastOnly?: boolean;
  excludeBalanceAdjustments?: boolean;
};

/**
 * User-facing list of transactions visible to the caller.
 *
 * The caller can see rows on owned accounts and accounts shared with them through
 * accepted shares. Creator id is intentionally not filtered on: a transaction
 * created by the account owner remains visible to a shared-account recipient.
 */
export const getTransactions = async (params: GetTransactionsParams) => {
  const { userId, accountIds, from, limit, isForecastOnly, excludeBalanceAdjustments, ...rest } = params;
  const accessibleAccounts = await getAccessibleAccountIdsForUser({ userId });

  let scopedAccountIds: string[];
  if (accountIds && accountIds.length > 0) {
    const accessibleSet = new Set(accessibleAccounts);
    scopedAccountIds = accountIds.filter((id) => accessibleSet.has(id));
    if (scopedAccountIds.length === 0) return [];
  } else {
    if (!accessibleAccounts.length) return [];
    scopedAccountIds = accessibleAccounts;
  }

  // Nested includes must use model instances; raw mode flattens their arrays.
  const isRaw = !rest.includeSplits && !rest.includeTags && !rest.includeGroups;

  return Transactions.findWithFilters({
    ...rest,
    accountIds: scopedAccountIds,
    planned: isForecastOnly === undefined ? { visibleTo: userId } : isForecastOnly ? 'only' : 'exclude',
    access: isForecastOnly === true ? { creator: userId } : 'pre-scoped',
    completeness: Number.isFinite(limit ?? DEFAULT_PAGE_SIZE)
      ? { page: { offset: from ?? 0, limit: limit ?? DEFAULT_PAGE_SIZE } }
      : 'all',
    balanceAdjustments: excludeBalanceAdjustments ? 'exclude' : 'include',
    isRaw,
  });
};
