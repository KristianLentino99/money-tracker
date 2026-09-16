import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import type { SecuritySearchResult } from '@bt/shared/types/investments';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import Categories from '@models/categories.model';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioBalances from '@models/investments/portfolio-balances.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import * as Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { createHolding } from '@services/investments/holdings/create-holding.service';
import { syncHistoricalPrices } from '@services/investments/securities-price/historical-sync.service';
import { addSecurityFromSearch } from '@services/investments/securities/add-from-search.service';
import { createInvestmentTransaction } from '@services/investments/transactions/create.service';
import { deleteInvestmentTransaction } from '@services/investments/transactions/delete.service';
import { Big } from 'big.js';

import { accountToPortfolioTransfer } from './account-to-portfolio-transfer.service';
import { linkTransactionToPortfolio } from './link-transaction-to-portfolio.service';

export interface InvestmentContributionPurchaseParams {
  securityId?: string;
  searchResult?: SecuritySearchResult;
  quantity: string;
  price: string;
  fees: string;
  date: string;
  name?: string;
  settlementCurrencyCode?: string;
  settlementAmount?: string;
  settlementFees?: string;
  settlementRate?: string;
}

export interface CreateInvestmentContributionParams {
  userId: number;
  portfolioId: string;
  accountId: string;
  amount: string;
  date: string;
  categoryId: string;
  description?: string | null;
  purchases: InvestmentContributionPurchaseParams[];
}

export interface CreateInvestmentContributionFromTransactionParams {
  userId: number;
  transactionId: string;
  portfolioId: string;
  categoryId: string;
  purchases: InvestmentContributionPurchaseParams[];
}

export interface UpdateInvestmentContributionParams {
  userId: number;
  portfolioId: string;
  transferId: string;
  purchases: InvestmentContributionPurchaseParams[];
}

interface ContributionResult {
  transfer: PortfolioTransfers;
  newSecurityIds: string[];
}

const loadTransferWithPurchases = async ({ transferId }: { transferId: string }) =>
  PortfolioTransfers.findByPk(transferId, {
    include: [
      { model: Portfolios, as: 'toPortfolio' },
      {
        model: InvestmentTransaction,
        as: 'investmentTransactions',
        include: [{ model: Securities, as: 'security' }],
      },
    ],
  });

const loadAvailableCash = async ({ portfolioId }: { portfolioId: string }) => {
  const balances = await PortfolioBalances.findAll({
    where: { portfolioId },
    attributes: ['currencyCode', 'availableCash'],
  });

  return new Map(balances.map((balance) => [balance.currencyCode, balance.availableCash.toBig()]));
};

const createPurchases = async ({
  userId,
  portfolioId,
  transfer,
  purchases,
  availableCashByCurrency,
}: {
  userId: number;
  portfolioId: string;
  transfer: PortfolioTransfers;
  purchases: InvestmentContributionPurchaseParams[];
  availableCashByCurrency: Map<string, Big>;
}) => {
  const newSecurityIds = new Set<string>();

  for (const purchase of purchases) {
    let securityId = purchase.securityId;

    if (purchase.searchResult) {
      const { security } = await addSecurityFromSearch({
        searchResult: purchase.searchResult,
        skipPriceFetch: true,
      });
      securityId = security.id;
    }

    if (!securityId) {
      throw new ValidationError({ message: t({ key: 'investments.contributionSecurityRequired' }) });
    }

    const holding = await Holdings.findOne({ where: { portfolioId, securityId } });
    if (!holding) {
      await createHolding({ userId, portfolioId, securityId, skipPriceSync: true });
      newSecurityIds.add(securityId);
    }

    const investmentTransaction = await createInvestmentTransaction({
      userId,
      portfolioId,
      securityId,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      date: purchase.date,
      quantity: purchase.quantity,
      price: purchase.price,
      fees: purchase.fees,
      name: purchase.name,
      settlementCurrencyCode: purchase.settlementCurrencyCode,
      settlementAmount: purchase.settlementAmount,
      settlementFees: purchase.settlementFees,
      settlementRate: purchase.settlementRate,
      portfolioTransferId: transfer.id,
    });

    const settlementCurrencyCode = investmentTransaction.settlementCurrencyCode;
    const availableCash = availableCashByCurrency.get(settlementCurrencyCode) ?? new Big(0);
    const remainingCash = availableCash.minus(investmentTransaction.settlementAmount.toBig());

    if (remainingCash.lt(0)) {
      throw new ValidationError({
        message: t({
          key: 'investments.contributionExceedsCash',
          variables: { currencyCode: settlementCurrencyCode },
        }),
      });
    }

    availableCashByCurrency.set(settlementCurrencyCode, remainingCash);
  }

  return [...newSecurityIds];
};

const buildContributionResult = async ({
  transfer,
  newSecurityIds,
}: ContributionResult): Promise<ContributionResult> => {
  const transferWithPurchases = await loadTransferWithPurchases({ transferId: transfer.id });
  if (!transferWithPurchases) {
    throw new Error('Created investment contribution could not be reloaded.');
  }

  return { transfer: transferWithPurchases, newSecurityIds };
};

const createInvestmentContributionImpl = async (
  params: CreateInvestmentContributionParams,
): Promise<ContributionResult> => {
  const { userId, portfolioId, accountId, amount, date, categoryId, description, purchases } = params;

  if (purchases.length === 0) {
    throw new ValidationError({ message: t({ key: 'investments.contributionPurchaseRequired' }) });
  }

  const availableCashByCurrency = await loadAvailableCash({ portfolioId });
  const transfer = await accountToPortfolioTransfer({
    userId,
    accountId,
    portfolioId,
    amount,
    date,
    description,
    categoryId,
  });

  availableCashByCurrency.set(
    transfer.currencyCode,
    (availableCashByCurrency.get(transfer.currencyCode) ?? new Big(0)).plus(new Big(amount)),
  );

  const newSecurityIds = await createPurchases({
    userId,
    portfolioId,
    transfer,
    purchases,
    availableCashByCurrency,
  });

  return buildContributionResult({ transfer, newSecurityIds });
};

const createInvestmentContributionFromTransactionImpl = async ({
  userId,
  transactionId,
  portfolioId,
  categoryId,
  purchases,
}: CreateInvestmentContributionFromTransactionParams): Promise<ContributionResult> => {
  if (purchases.length === 0) {
    throw new ValidationError({ message: t({ key: 'investments.contributionPurchaseRequired' }) });
  }

  const transaction = await findOrThrowNotFound({
    query: Transactions.getTransactionById({ id: transactionId, userId }),
    message: t({ key: 'transactions.notFound' }),
  });

  if (transaction.transactionType !== TRANSACTION_TYPES.expense) {
    throw new ValidationError({ message: t({ key: 'investments.contributionSourceMustBeExpense' }) });
  }

  if (transaction.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer) {
    throw new ValidationError({ message: t({ key: 'investments.transactionAlreadyTransfer' }) });
  }

  await findOrThrowNotFound({
    query: Categories.findOne({ where: { id: categoryId, userId } }),
    message: t({ key: 'categories.notFound' }),
  });

  const availableCashByCurrency = await loadAvailableCash({ portfolioId });
  const transfer = await linkTransactionToPortfolio({
    userId,
    transactionId,
    portfolioId,
  });
  await transaction.update({ categoryId });

  availableCashByCurrency.set(
    transfer.currencyCode,
    (availableCashByCurrency.get(transfer.currencyCode) ?? new Big(0)).plus(transfer.amount.toBig()),
  );

  const newSecurityIds = await createPurchases({
    userId,
    portfolioId,
    transfer,
    purchases,
    availableCashByCurrency,
  });

  return buildContributionResult({ transfer, newSecurityIds });
};

const updateInvestmentContributionImpl = async ({
  userId,
  portfolioId,
  transferId,
  purchases,
}: UpdateInvestmentContributionParams): Promise<ContributionResult> => {
  if (purchases.length === 0) {
    throw new ValidationError({ message: t({ key: 'investments.contributionPurchaseRequired' }) });
  }

  const transfer = await findOrThrowNotFound({
    query: PortfolioTransfers.findOne({
      where: { id: transferId, userId, toPortfolioId: portfolioId },
      include: [
        { model: Portfolios, as: 'toPortfolio' },
        { model: InvestmentTransaction, as: 'investmentTransactions' },
      ],
    }),
    message: t({ key: 'investments.portfolioTransferNotFound' }),
  });

  for (const investmentTransaction of transfer.investmentTransactions ?? []) {
    await deleteInvestmentTransaction({ userId, transactionId: investmentTransaction.id });
  }

  const availableCashByCurrency = await loadAvailableCash({ portfolioId });
  if (transfer.toPortfolio?.isManualTracking) {
    availableCashByCurrency.set(
      transfer.currencyCode,
      (availableCashByCurrency.get(transfer.currencyCode) ?? new Big(0)).plus(transfer.amount.toBig()),
    );
  }

  const newSecurityIds = await createPurchases({
    userId,
    portfolioId,
    transfer,
    purchases,
    availableCashByCurrency,
  });

  return buildContributionResult({ transfer, newSecurityIds });
};

const syncNewSecurities = (securityIds: string[]) => {
  for (const securityId of securityIds) {
    syncHistoricalPrices(securityId).catch((error) => {
      logger.error({
        message: `Background historical price sync failed for securityId: ${securityId}`,
        error: error as Error,
      });
    });
  }
};

/**
 * Creates the account expense, portfolio transfer, holdings, and purchases as one aggregate.
 */
export const createInvestmentContribution = async (params: CreateInvestmentContributionParams) => {
  const result = await withTransaction(createInvestmentContributionImpl)(params);
  syncNewSecurities(result.newSecurityIds);
  return result.transfer;
};

/**
 * Attaches investment purchases to an existing bank transaction without duplicating the bank movement.
 */
export const createInvestmentContributionFromTransaction = async (
  params: CreateInvestmentContributionFromTransactionParams,
) => {
  const result = await withTransaction(createInvestmentContributionFromTransactionImpl)(params);
  syncNewSecurities(result.newSecurityIds);
  return result.transfer;
};

/**
 * Replaces the purchases in an existing contribution while preserving its account transfer.
 */
export const updateInvestmentContribution = async (params: UpdateInvestmentContributionParams) => {
  const result = await withTransaction(updateInvestmentContributionImpl)(params);
  syncNewSecurities(result.newSecurityIds);
  return result.transfer;
};
