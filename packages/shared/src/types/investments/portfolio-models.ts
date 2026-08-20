import { AccountModel, CurrencyModel, UserModel } from '../db-models';
import { PORTFOLIO_TYPE } from './enums';
import { HoldingModel } from './holding.model';
import { InvestmentTransactionModel } from './investment-transaction.model';

/**
 * How long a soft-deleted (trashed) portfolio is retained before the purge
 * cron hard-deletes it. Shared across backend (cron + service) and frontend
 * (trash UI copy) so the two can never silently drift.
 */
export const PORTFOLIO_TRASH_RETENTION_DAYS = 30;

export interface PortfolioBalanceModel {
  portfolioId: string;
  currencyCode: string;
  availableCash: string;
  totalCash: string;
  refAvailableCash: string;
  refTotalCash: string;
  createdAt: Date;
  updatedAt: Date;

  // Associations
  portfolio?: PortfolioModel;
  currency?: CurrencyModel;
}

export interface PortfolioModel {
  id: string;
  name: string;
  userId: number;
  portfolioType: PORTFOLIO_TYPE;
  description: string | null;
  /** Currency for displaying portfolio summary/stats. Null = user's base currency. */
  displayCurrencyCode: string | null;
  /** When enabled, value is reported by dated manual valuations instead of holdings prices. */
  isManualTracking: boolean;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Non-null when the portfolio is in trash awaiting purge. */
  deletedAt: Date | null;

  // Associations
  user?: UserModel;
  holdings?: HoldingModel[];
  investmentTransactions?: InvestmentTransactionModel[];
  balances?: PortfolioBalanceModel[];
}

export enum MANUAL_PORTFOLIO_TRANSACTION_CATEGORY {
  contribution = 'contribution',
  withdrawal = 'withdrawal',
  fee = 'fee',
  tax = 'tax',
  other_income = 'other_income',
  distribution = 'distribution',
}

export interface ManualPortfolioTransactionModel {
  id: string;
  portfolioId: string;
  category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY;
  amount: string;
  date: string;
  note: string | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManualPortfolioValuationModel {
  id: string;
  portfolioId: string;
  value: string;
  date: string;
  note: string | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MANUAL_PORTFOLIO_JSON_FORMAT = 'money-tracker.manual-portfolio' as const;
export const MANUAL_PORTFOLIO_JSON_VERSION = 1 as const;

export interface ManualPortfolioJsonExport {
  format: typeof MANUAL_PORTFOLIO_JSON_FORMAT;
  version: typeof MANUAL_PORTFOLIO_JSON_VERSION;
  portfolioName: string;
  currencyCode: string;
  transactions: Array<{
    category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY;
    amount: string;
    date: string;
    note: string | null;
    source: string | null;
  }>;
  valuations: Array<{
    value: string;
    date: string;
    note: string | null;
    source: string | null;
  }>;
}

export interface ManualPortfolioOverviewModel {
  currencyCode: string;
  openingValue: string | null;
  openingDate: string | null;
  lastReportedValue: string | null;
  valuationDate: string | null;
  /** Null until the user has supplied an end-of-day valuation. */
  netActivitySinceValuation: string | null;
  currentValue: string | null;
  gain: string | null;
  gainPercent: string | null;
  isStale: boolean;
  /** Dated points for the manual dashboard's value / invested-capital chart. */
  history: Array<{ date: string; reportedValue: string; investedCapital: string }>;
  totals: Record<MANUAL_PORTFOLIO_TRANSACTION_CATEGORY, string>;
  timeline: Array<
    | (ManualPortfolioTransactionModel & { kind: 'transaction' })
    | (ManualPortfolioValuationModel & { kind: 'valuation' })
    | {
        id: string;
        kind: 'linked-transfer';
        date: string;
        amount: string;
        category: 'contribution' | 'withdrawal';
        note: string | null;
      }
  >;
}

export interface PortfolioTransferModel {
  id: string;
  userId: number;
  fromAccountId: string | null;
  toPortfolioId: string | null;
  fromPortfolioId: string | null;
  toAccountId: string | null;
  amount: string;
  refAmount: string;
  currencyCode: string;
  toCurrencyCode: string | null;
  toAmount: string | null;
  refToAmount: string | null;
  transactionId: string | null;
  metaData: Record<string, unknown> | null;
  /**
   * The transfer reconciles recorded cash to reality instead of recording money
   * that crossed the portfolio boundary, so contribution reporting skips it.
   */
  isAdjustment: boolean;
  date: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Associations
  user?: UserModel;
  fromAccount?: AccountModel;
  toAccount?: AccountModel;
  fromPortfolio?: PortfolioModel;
  toPortfolio?: PortfolioModel;
  currency?: CurrencyModel;
  toCurrency?: CurrencyModel;
}
