import { api } from '@/api/_api';
import {
  PORTFOLIO_TYPE,
  PortfolioBalanceModel,
  PortfolioModel,
  PortfolioTransferModel,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY,
  ManualPortfolioJsonExport,
  ManualPortfolioOverviewModel,
} from '@bt/shared/types/investments';
import type { PortfolioAnnualizedReturnModel } from '@bt/shared/types/investments/portfolio-annualized-return.model';
import type { PortfolioSummaryModel } from '@bt/shared/types/investments/portfolio-summary.model';

interface CreatePortfolioRequest {
  name: string;
  portfolioType?: PORTFOLIO_TYPE;
  description?: string;
  /** Currency for displaying portfolio summary/stats. Null/omitted = user's base currency. */
  displayCurrencyCode?: string | null;
  isEnabled?: boolean;
  isManualTracking?: boolean;
}

export const createPortfolio = async (params: CreatePortfolioRequest): Promise<PortfolioModel> => {
  const result = await api.post('/investments/portfolios', params);
  return result;
};

export const getPortfolios = async (): Promise<PortfolioModel[]> => {
  const result = await api.get('/investments/portfolios');
  return result.data;
};

export const getDeletedPortfolios = async (): Promise<PortfolioModel[]> => {
  const result = await api.get('/investments/portfolios', { onlyDeleted: true });
  return result.data;
};

export const restorePortfolio = async ({ portfolioId }: { portfolioId: string }): Promise<PortfolioModel> => {
  return api.post(`/investments/portfolios/${portfolioId}/restore`);
};

export const getPortfolio = async ({ portfolioId }: { portfolioId: string }): Promise<PortfolioModel> => {
  const result = await api.get(`/investments/portfolios/${portfolioId}`);
  return result;
};

type UpdatePortfolioParams = {
  portfolioId: string;
} & Partial<Omit<CreatePortfolioRequest, 'portfolioType'> & { portfolioType: PORTFOLIO_TYPE }>;

export const updatePortfolio = async ({ portfolioId, ...params }: UpdatePortfolioParams): Promise<PortfolioModel> => {
  const result = await api.put(`/investments/portfolios/${portfolioId}`, params);
  return result;
};

export const deletePortfolio = async ({
  portfolioId,
  force,
}: {
  portfolioId: string;
  force?: boolean;
}): Promise<void> => {
  return api.delete(`/investments/portfolios/${portfolioId}`, { data: { force } });
};

interface CreatePortfolioTransferRequest {
  toPortfolioId: string;
  currencyCode: string;
  amount: string;
  date: string;
  description?: string;
}

type CreatePortfolioTransferParams = { fromPortfolioId: string } & CreatePortfolioTransferRequest;

export const createPortfolioTransfer = async ({
  fromPortfolioId,
  ...params
}: CreatePortfolioTransferParams): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${fromPortfolioId}/transfer`, params);
  return result;
};

interface AccountToPortfolioTransferRequest {
  accountId: string;
  amount: string;
  date: string;
  description?: string;
}

type AccountToPortfolioTransferParams = { portfolioId: string } & AccountToPortfolioTransferRequest;

export const accountToPortfolioTransfer = async ({
  portfolioId,
  ...params
}: AccountToPortfolioTransferParams): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${portfolioId}/transfer/from-account`, params);
  return result;
};

interface PortfolioToAccountTransferRequest {
  accountId: string;
  amount: string;
  currencyCode: string;
  date: string;
  description?: string;
}

type PortfolioToAccountTransferParams = { portfolioId: string } & PortfolioToAccountTransferRequest;

export const portfolioToAccountTransfer = async ({
  portfolioId,
  ...params
}: PortfolioToAccountTransferParams): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${portfolioId}/transfer/to-account`, params);
  return result;
};

interface ExchangeCurrencyRequest {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  fromAmount: string;
  toAmount: string;
  date: string;
  description?: string;
}

type ExchangeCurrencyParams = { portfolioId: string } & ExchangeCurrencyRequest;

export const exchangeCurrency = async ({
  portfolioId,
  ...params
}: ExchangeCurrencyParams): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${portfolioId}/exchange-currency`, params);
  return result;
};

export const getPortfolioBalances = async ({
  portfolioId,
}: {
  portfolioId: string;
}): Promise<PortfolioBalanceModel[]> => {
  const result = await api.get(`/investments/portfolios/${portfolioId}/balance`);
  return result;
};

export const getPortfolioTransfers = async ({
  portfolioId,
}: {
  portfolioId: string;
}): Promise<PortfolioTransferModel[]> => {
  const result = await api.get(`/investments/portfolios/${portfolioId}/transfers`);
  return result.data;
};

interface DirectCashTransactionRequest {
  type: 'deposit' | 'withdrawal';
  amount: string;
  currencyCode: string;
  date: string;
  description?: string | null;
  isAdjustment?: boolean;
}

type DirectCashTransactionParams = { portfolioId: string } & DirectCashTransactionRequest;

export const createDirectCashTransaction = async ({
  portfolioId,
  ...params
}: DirectCashTransactionParams): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${portfolioId}/cash-transaction`, params);
  return result;
};

export const setTransferAdjustment = async ({
  portfolioId,
  transferId,
  isAdjustment,
}: {
  portfolioId: string;
  transferId: string;
  isAdjustment: boolean;
}): Promise<PortfolioTransferModel> => {
  const result = await api.patch(`/investments/portfolios/${portfolioId}/transfers/${transferId}/adjustment`, {
    isAdjustment,
  });
  return result;
};

export const deletePortfolioTransfer = async ({
  portfolioId,
  transferId,
  deleteLinkedTransaction,
}: {
  portfolioId: string;
  transferId: string;
  deleteLinkedTransaction?: boolean;
}): Promise<void> => {
  const query: Record<string, string> = {};
  if (deleteLinkedTransaction !== undefined) {
    query.deleteLinkedTransaction = String(deleteLinkedTransaction);
  }
  return api.delete(`/investments/portfolios/${portfolioId}/transfers/${transferId}`, { query });
};

export const linkTransactionToPortfolio = async ({
  transactionId,
  portfolioId,
}: {
  transactionId: string;
  portfolioId: string;
}): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/transactions/${transactionId}/link-to-portfolio`, { portfolioId });
  return result;
};

export const unlinkTransactionFromPortfolio = async ({ transactionId }: { transactionId: string }): Promise<void> => {
  return api.post(`/transactions/${transactionId}/unlink-from-portfolio`);
};

interface TransactionPortfolioLinkResponse {
  transferId: string;
  portfolioId: string;
  portfolioName: string;
  /** True when the linked portfolio is currently in the trash. */
  isPortfolioDeleted: boolean;
  transferType: 'deposit' | 'withdrawal';
  amount: string;
  currencyCode: string;
  date: string;
}

export const getTransactionPortfolioLink = async ({
  transactionId,
}: {
  transactionId: string;
}): Promise<TransactionPortfolioLinkResponse> => {
  const result = await api.get(`/transactions/${transactionId}/portfolio-link`);
  return result;
};

export const getPortfolioSummary = async ({
  portfolioId,
  date,
}: {
  portfolioId: string;
  date?: string;
}): Promise<PortfolioSummaryModel> => {
  const params = date ? { date } : {};
  const result = await api.get(`/investments/portfolios/${portfolioId}/summary`, params);
  return result;
};

export const getPortfoliosAnnualizedReturns = async (): Promise<PortfolioAnnualizedReturnModel[]> => {
  const result = await api.get('/investments/portfolios/annualized-returns');
  return result;
};

export const getManualPortfolioValues = async ({
  portfolioId,
}: {
  portfolioId: string;
}): Promise<ManualPortfolioOverviewModel> => api.get(`/investments/portfolios/${portfolioId}/manual-values`);
export const createManualPortfolioTransaction = async ({
  portfolioId,
  ...params
}: {
  portfolioId: string;
  category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY;
  amount: string | number;
  date: string;
  note?: string | null;
  source?: string | null;
}): Promise<void> => api.post(`/investments/portfolios/${portfolioId}/manual-transactions`, params);
export const createManualPortfolioValuation = async ({
  portfolioId,
  ...params
}: {
  portfolioId: string;
  value: string | number;
  date: string;
  note?: string | null;
  source?: string | null;
}): Promise<void> => api.post(`/investments/portfolios/${portfolioId}/manual-valuations`, params);
export const updateManualPortfolioTransaction = async ({
  portfolioId,
  recordId,
  ...params
}: {
  portfolioId: string;
  recordId: string;
  category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY;
  amount: string | number;
  date: string;
  note?: string | null;
  source?: string | null;
}): Promise<void> => api.put(`/investments/portfolios/${portfolioId}/manual-transactions/${recordId}`, params);
export const deleteManualPortfolioTransaction = async ({
  portfolioId,
  recordId,
}: {
  portfolioId: string;
  recordId: string;
}): Promise<void> => api.delete(`/investments/portfolios/${portfolioId}/manual-transactions/${recordId}`);
export const updateManualPortfolioValuation = async ({
  portfolioId,
  valuationId,
  ...params
}: {
  portfolioId: string;
  valuationId: string;
  value: string | number;
  date: string;
  note?: string | null;
  source?: string | null;
}): Promise<void> => api.put(`/investments/portfolios/${portfolioId}/manual-valuations/${valuationId}`, params);
export const deleteManualPortfolioValuation = async ({
  portfolioId,
  valuationId,
}: {
  portfolioId: string;
  valuationId: string;
}): Promise<void> => api.delete(`/investments/portfolios/${portfolioId}/manual-valuations/${valuationId}`);

export interface ManualPortfolioImportRecord {
  tempId: string;
  kind: 'transaction' | 'valuation';
  date: string | null;
  amount: string | null;
  category?: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY | null;
  currencyCode?: string | null;
  currencyMismatch?: boolean;
  note?: string | null;
  confidence: number;
  sourceContext?: string | null;
  warnings: string[];
  possibleDuplicate: boolean;
}

export interface ManualPortfolioImportResult {
  records: ManualPortfolioImportRecord[];
  warnings: string[];
  tokenCount?: { input: number; output: number };
}

export const extractManualPortfolioImport = async ({
  portfolioId,
  ...payload
}:
  | {
      portfolioId: string;
      source: 'ai';
      text?: string;
      fileBase64?: string;
    }
  | {
      portfolioId: string;
      source: 'csv';
      csv: string;
    }): Promise<ManualPortfolioImportResult> =>
  api.post(`/investments/portfolios/${portfolioId}/manual-import/extract`, payload);

export const executeManualPortfolioImport = async ({
  portfolioId,
  records,
  skipTempIds,
}: {
  portfolioId: string;
  records: ManualPortfolioImportRecord[];
  skipTempIds: string[];
}): Promise<{ imported: number; skipped: number }> =>
  api.post(`/investments/portfolios/${portfolioId}/manual-import/execute`, {
    records,
    skipTempIds,
  });

export const importManualPortfolioJson = async ({
  portfolioId,
  payload,
}: {
  portfolioId: string;
  payload: ManualPortfolioJsonExport;
}): Promise<{ imported: number; skipped: number }> =>
  api.post(`/investments/portfolios/${portfolioId}/manual-json/import`, payload);
