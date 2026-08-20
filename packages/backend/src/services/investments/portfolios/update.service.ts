import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Holdings from '@models/investments/holdings.model';
import InvestmentTransactions from '@models/investments/investment-transaction.model';
import ManualPortfolioTransactions from '@models/investments/manual-portfolio-transaction.model';
import ManualPortfolioValuations from '@models/investments/manual-portfolio-valuation.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

interface UpdatePortfolioParams {
  userId: number;
  portfolioId: string;
  name?: string;
  portfolioType?: PORTFOLIO_TYPE;
  description?: string | null;
  displayCurrencyCode?: string | null;
  isEnabled?: boolean;
  isManualTracking?: boolean;
}

const updatePortfolioImpl = async ({
  userId,
  portfolioId,
  name,
  portfolioType,
  description,
  displayCurrencyCode,
  isEnabled,
  isManualTracking,
}: UpdatePortfolioParams) => {
  // Find the portfolio and verify ownership
  const portfolio = await findOrThrowNotFound({
    query: Portfolios.findOne({
      where: { id: portfolioId, userId },
    }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

  // The tracking mode and its locked currency only change before *any* portfolio history exists.
  const trackingConfigurationChanged =
    (isManualTracking !== undefined && isManualTracking !== portfolio.isManualTracking) ||
    (displayCurrencyCode !== undefined && displayCurrencyCode !== portfolio.displayCurrencyCode);
  if (trackingConfigurationChanged) {
    const [holdings, transactions, manualTransactions, valuations, transfers] = await Promise.all([
      Holdings.count({ where: { portfolioId } }),
      InvestmentTransactions.count({ where: { portfolioId } }),
      ManualPortfolioTransactions.count({ where: { portfolioId } }),
      ManualPortfolioValuations.count({ where: { portfolioId } }),
      PortfolioTransfers.count({
        where: { [Op.or]: [{ toPortfolioId: portfolioId }, { fromPortfolioId: portfolioId }] },
      }),
    ]);
    if (holdings + transactions + manualTransactions + valuations + transfers > 0)
      throw new ValidationError({
        message: 'Manual tracking mode and currency are locked once portfolio history exists.',
      });
    const nextManual = isManualTracking ?? portfolio.isManualTracking;
    const nextCurrency = displayCurrencyCode !== undefined ? displayCurrencyCode : portfolio.displayCurrencyCode;
    if (nextManual && !nextCurrency) throw new ValidationError({ message: 'Manual portfolios require a currency.' });
    if (nextCurrency) {
      const userCurrency = await UsersCurrencies.getCurrency({ userId, currencyCode: nextCurrency });
      if (!userCurrency) throw new ValidationError({ message: t({ key: 'currencies.currencyNotConnected' }) });
    }
  }

  // Display currency must be connected to the user, otherwise the summary
  // endpoint could not resolve an exchange rate for it.
  if (displayCurrencyCode != null) {
    const userCurrency = await UsersCurrencies.getCurrency({ userId, currencyCode: displayCurrencyCode });
    if (!userCurrency) {
      throw new ValidationError({ message: t({ key: 'currencies.currencyNotConnected' }) });
    }
  }

  // Update the portfolio with only provided fields
  const updateData: Partial<Portfolios> = {};

  if (name !== undefined) updateData.name = name.trim();
  if (portfolioType !== undefined) updateData.portfolioType = portfolioType;
  if (description !== undefined) updateData.description = description;
  if (displayCurrencyCode !== undefined) updateData.displayCurrencyCode = displayCurrencyCode;
  if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
  if (isManualTracking !== undefined) updateData.isManualTracking = isManualTracking;

  await portfolio.update(updateData);

  return portfolio.reload();
};

export const updatePortfolio = withTransaction(updatePortfolioImpl);
