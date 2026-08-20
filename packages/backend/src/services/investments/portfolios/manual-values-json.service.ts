import {
  MANUAL_PORTFOLIO_JSON_FORMAT,
  MANUAL_PORTFOLIO_JSON_VERSION,
  ManualPortfolioJsonExport,
} from '@bt/shared/types/investments';
import { ValidationError } from '@js/errors';
import ManualPortfolioTransactions from '@models/investments/manual-portfolio-transaction.model';
import ManualPortfolioValuations from '@models/investments/manual-portfolio-valuation.model';
import { withTransaction } from '@services/common/with-transaction';
import Big from 'big.js';

import { getManualPortfolioOverview } from './manual-values.service';

const transactionKey = (record: ManualPortfolioJsonExport['transactions'][number]) =>
  `${record.date}|${record.amount}|${record.category}`;

export const importManualPortfolioJson = withTransaction(
  async ({
    userId,
    portfolioId,
    payload,
  }: {
    userId: number;
    portfolioId: string;
    payload: ManualPortfolioJsonExport;
  }) => {
    const overview = await getManualPortfolioOverview({ userId, portfolioId });
    if (payload.format !== MANUAL_PORTFOLIO_JSON_FORMAT || payload.version !== MANUAL_PORTFOLIO_JSON_VERSION) {
      throw new ValidationError({ message: 'Unsupported manual portfolio JSON format.' });
    }
    if (payload.currencyCode !== overview.currencyCode) {
      throw new ValidationError({
        message: `Currency ${payload.currencyCode} does not match this portfolio (${overview.currencyCode}).`,
      });
    }

    const [existingTransactions, existingValuations] = await Promise.all([
      ManualPortfolioTransactions.findAll({ where: { portfolioId } }),
      ManualPortfolioValuations.findAll({ where: { portfolioId } }),
    ]);
    const transactionKeys = new Set(
      existingTransactions.map((record) => `${record.date}|${record.amount.toString()}|${record.category}`),
    );
    const valuationValues = new Map(existingValuations.map((record) => [record.date, record.value.toString()]));
    let imported = 0;
    let skipped = 0;

    for (const record of payload.valuations) {
      const existingValue = valuationValues.get(record.date);
      if (existingValue !== undefined) {
        if (!new Big(existingValue).eq(record.value)) {
          throw new ValidationError({
            message: `A valuation already exists for ${record.date} with a different value.`,
          });
        }
        skipped += 1;
        continue;
      }
      await ManualPortfolioValuations.create({
        portfolioId,
        value: record.value,
        date: record.date,
        note: record.note,
        source: record.source,
      });
      valuationValues.set(record.date, record.value);
      imported += 1;
    }

    for (const record of payload.transactions) {
      const key = transactionKey(record);
      if (transactionKeys.has(key)) {
        skipped += 1;
        continue;
      }
      await ManualPortfolioTransactions.create({
        portfolioId,
        category: record.category,
        amount: record.amount,
        date: record.date,
        note: record.note,
        source: record.source,
      });
      transactionKeys.add(key);
      imported += 1;
    }

    await getManualPortfolioOverview({ userId, portfolioId });
    return { imported, skipped };
  },
);
