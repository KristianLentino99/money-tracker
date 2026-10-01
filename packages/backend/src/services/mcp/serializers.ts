/**
 * MCP-specific slimming over the REST serializer output.
 *
 * The REST serializers (`serializeAccounts`, `serializeTransactions`) carry
 * fields the frontend needs — ACL/share context, UI hints, audit timestamps,
 * near-always-zero fee fields. For an AI client over MCP those are wasted context
 * tokens. These helpers take the already-serialized, already-decimal output and keep only the
 * fields an assistant reasons about. The shared serializers stay untouched.
 */
import { INVESTMENT_DECIMAL_SCALE } from '@common/types/money';
import type Accounts from '@models/accounts.model';
import type Categories from '@models/categories.model';
import type PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import type SubscriptionTransactions from '@models/subscription-transactions.model';
import type Subscriptions from '@models/subscriptions.model';
import type { TransactionsAttributes } from '@models/transactions.model';
import type { AccountApiResponse } from '@root/serializers/accounts.serializer';
import type { TransactionApiResponse } from '@root/serializers/transactions.serializer';

export function slimAccountsForMcp(accounts: AccountApiResponse[]) {
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    accountCategory: a.accountCategory,
    currencyCode: a.currencyCode,
    currentBalance: a.currentBalance,
    refCurrentBalance: a.refCurrentBalance,
    creditLimit: a.creditLimit,
    refCreditLimit: a.refCreditLimit,
    status: a.status,
    excludeFromStats: a.excludeFromStats,
  }));
}

export function slimPortfolioTransferForMcp(transfer: PortfolioTransfers) {
  const QUANTITY_DECIMAL_SCALE = 18;
  return {
    id: transfer.id,
    date: transfer.date,
    amount: transfer.amount.toDecimalString(INVESTMENT_DECIMAL_SCALE),
    refAmount: transfer.refAmount.toDecimalString(INVESTMENT_DECIMAL_SCALE),
    currencyCode: transfer.currencyCode,
    description: transfer.description,
    isAdjustment: transfer.isAdjustment,
    affectsCash: transfer.affectsCash,
    transactionId: transfer.transactionId,
    fromAccountId: transfer.fromAccountId,
    toAccountId: transfer.toAccountId,
    fromPortfolioId: transfer.fromPortfolioId,
    toPortfolioId: transfer.toPortfolioId,
    ...(transfer.investmentTransactions && {
      investmentTransactions: transfer.investmentTransactions.map((purchase) => ({
        id: purchase.id,
        securityId: purchase.securityId,
        category: purchase.category,
        date: purchase.date,
        name: purchase.name,
        quantity: purchase.quantity.toDecimalString(QUANTITY_DECIMAL_SCALE),
        price: purchase.price.toDecimalString(INVESTMENT_DECIMAL_SCALE),
        amount: purchase.amount.toDecimalString(INVESTMENT_DECIMAL_SCALE),
        fees: purchase.fees.toDecimalString(INVESTMENT_DECIMAL_SCALE),
        currencyCode: purchase.currencyCode,
        settlementCurrencyCode: purchase.settlementCurrencyCode,
        settlementAmount: purchase.settlementAmount.toDecimalString(INVESTMENT_DECIMAL_SCALE),
        settlementFees: purchase.settlementFees.toDecimalString(INVESTMENT_DECIMAL_SCALE),
        settlementRate: purchase.settlementRate,
        ...(purchase.security && {
          security: {
            id: purchase.security.id,
            symbol: purchase.security.symbol,
            name: purchase.security.name,
            providerName: purchase.security.providerName,
            providerSymbol: purchase.security.providerSymbol,
            priceSourceSymbol: purchase.security.priceSourceSymbol,
            currencyCode: purchase.security.currencyCode,
          },
        }),
      })),
    }),
    ...(transfer.fromPortfolio && {
      fromPortfolio: { id: transfer.fromPortfolio.id, name: transfer.fromPortfolio.name },
    }),
    ...(transfer.toPortfolio && { toPortfolio: { id: transfer.toPortfolio.id, name: transfer.toPortfolio.name } }),
    ...(transfer.fromAccount && { fromAccount: { id: transfer.fromAccount.id, name: transfer.fromAccount.name } }),
    ...(transfer.toAccount && { toAccount: { id: transfer.toAccount.id, name: transfer.toAccount.name } }),
    ...(transfer.toCurrencyCode && {
      toCurrencyCode: transfer.toCurrencyCode,
      toAmount: transfer.toAmount?.toDecimalString(INVESTMENT_DECIMAL_SCALE) ?? null,
    }),
  };
}

export function slimTransactionsForMcp(txs: TransactionApiResponse[]) {
  return txs.map((tx) => ({
    id: tx.id,
    time: tx.time,
    amount: tx.amount,
    refAmount: tx.refAmount,
    currencyCode: tx.currencyCode,
    note: tx.note,
    transactionType: tx.transactionType,
    transferNature: tx.transferNature,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    isForecastOnly: tx.isForecastOnly,
    ...(tx.tags && { tags: tx.tags.map((t) => ({ id: t.id, name: t.name })) }),
    ...(tx.splits && {
      splits: tx.splits.map((s) => ({ categoryId: s.categoryId, amount: s.amount, note: s.note })),
    }),
    ...(tx.transactionGroups && { transactionGroups: tx.transactionGroups }),
  }));
}

/**
 * Shape of a `getSubscriptionById` result, narrowed to the fields the MCP slimmer
 * reads. Scalar fields are picked straight from the models so the types track the
 * schema; only the values the service transforms are overridden — `expectedAmount`
 * /`amount`/`refAmount` (Money → decimal number), the trimmed `account`/`category`
 * associations, and the computed `nextExpectedDate`. The service returns a loosely
 * typed `toJSON()` blob, so the tool casts into this before slimming.
 */
export type SubscriptionDetailForMcp = Pick<
  Subscriptions,
  | 'id'
  | 'name'
  | 'type'
  | 'frequency'
  | 'startDate'
  | 'endDate'
  | 'dueDate'
  | 'loanAccountId'
  | 'maxOccurrences'
  | 'completedAt'
  | 'isActive'
  | 'notes'
  | 'expectedCurrencyCode'
  | 'transactionType'
> & {
  expectedAmount: number | null;
  tagIds?: string[];
  nextExpectedDate: Date | string | null;
  account?: Pick<Accounts, 'id' | 'name' | 'currencyCode'> | null;
  loan?: Pick<Accounts, 'id' | 'name' | 'currencyCode'> | null;
  category?: Pick<Categories, 'id' | 'name'> | null;
  transactions?: Array<
    Pick<
      TransactionsAttributes,
      'id' | 'time' | 'currencyCode' | 'note' | 'transactionType' | 'categoryId' | 'accountId'
    > & {
      amount: number;
      refAmount: number;
      SubscriptionTransactions?: Pick<SubscriptionTransactions, 'matchSource' | 'matchedAt'> | null;
    }
  > | null;
  periods?: Array<{
    id: string;
    dueDate: string;
    status: string;
    paidAt: Date | null;
    transactionId: string | null;
    transactionAutoCreated: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> | null;
};

export function slimSubscriptionDetailForMcp(sub: SubscriptionDetailForMcp) {
  return {
    id: sub.id,
    name: sub.name,
    type: sub.type,
    transactionType: sub.transactionType,
    expectedAmount: sub.expectedAmount,
    expectedCurrencyCode: sub.expectedCurrencyCode,
    tagIds: sub.tagIds ?? [],
    frequency: sub.frequency,
    startDate: sub.startDate,
    endDate: sub.endDate,
    dueDate: sub.dueDate,
    loanAccountId: sub.loanAccountId ?? sub.loan?.id ?? null,
    loan: sub.loan ?? null,
    maxOccurrences: sub.maxOccurrences,
    completedAt: sub.completedAt,
    isActive: sub.isActive,
    notes: sub.notes,
    nextExpectedDate: sub.nextExpectedDate,
    paidPeriodsCount: (sub.periods ?? []).filter((period) => period.status === 'paid').length,
    account: sub.account ?? null,
    category: sub.category ? { id: sub.category.id, name: sub.category.name } : null,
    // Embedded transactions arrive as full Transaction models; keep only what
    // confirms the link, plus the junction's match source/date.
    transactions: (sub.transactions ?? []).map((tx) => ({
      id: tx.id,
      time: tx.time,
      amount: tx.amount,
      refAmount: tx.refAmount,
      currencyCode: tx.currencyCode,
      note: tx.note,
      transactionType: tx.transactionType,
      categoryId: tx.categoryId,
      accountId: tx.accountId,
      matchSource: tx.SubscriptionTransactions?.matchSource ?? null,
      matchedAt: tx.SubscriptionTransactions?.matchedAt ?? null,
    })),
    periods: (sub.periods ?? []).map((period) => ({
      id: period.id,
      dueDate: period.dueDate,
      status: period.status,
      paidAt: period.paidAt,
      transactionId: period.transactionId,
      transactionAutoCreated: period.transactionAutoCreated,
      notes: period.notes,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
    })),
  };
}
