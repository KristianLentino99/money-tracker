import { MANUAL_PORTFOLIO_TRANSACTION_CATEGORY, ManualPortfolioOverviewModel } from '@bt/shared/types/investments';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import ManualPortfolioTransactions from '@models/investments/manual-portfolio-transaction.model';
import ManualPortfolioValuations from '@models/investments/manual-portfolio-valuation.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import { withTransaction } from '@services/common/with-transaction';
import Big from 'big.js';
import { Op, UniqueConstraintError } from 'sequelize';

import { calculateManualPortfolioPerformance } from './manual-values-calculation';

type Activity = { date: string; amount: Big; category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY };
const plusCategories = new Set([
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.other_income,
]);
const minusCategories = new Set([
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.withdrawal,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.fee,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.tax,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.distribution,
]);

const amount = (value: { toDecimalString: (scale: number) => string } | string) =>
  new Big(typeof value === 'string' ? value : value.toDecimalString(10));
const asMoney = (value: Big) => value.toFixed(2);

async function portfolioForManual({ userId, portfolioId }: { userId: number; portfolioId: string }) {
  const portfolio = await findOrThrowNotFound({
    query: Portfolios.findOne({ where: { id: portfolioId, userId } }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });
  if (!portfolio.isManualTracking || !portfolio.displayCurrencyCode)
    throw new ValidationError({ message: 'Manual value tracking is not enabled for this portfolio.' });
  return portfolio;
}

async function activities({ portfolioId, fromDate }: { portfolioId: string; fromDate?: string }): Promise<Activity[]> {
  const where = { portfolioId, ...(fromDate ? { date: { [Op.gte]: fromDate } } : {}) };
  const [records, transfers] = await Promise.all([
    ManualPortfolioTransactions.findAll({
      where,
      order: [
        ['date', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    }),
    PortfolioTransfers.findAll({
      where: {
        [Op.or]: [{ toPortfolioId: portfolioId }, { fromPortfolioId: portfolioId }],
        ...(fromDate ? { date: { [Op.gte]: fromDate } } : {}),
      },
      order: [
        ['date', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    }),
  ]);
  return [
    ...records.map((record) => ({ date: record.date, amount: amount(record.amount), category: record.category })),
    ...transfers
      .filter((transfer) => !transfer.isAdjustment)
      .map((transfer) => ({
        date: transfer.date,
        amount: amount(transfer.amount),
        category:
          transfer.toPortfolioId === portfolioId
            ? MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution
            : MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.withdrawal,
      })),
  ];
}

function effect(activity: Activity): Big {
  return plusCategories.has(activity.category)
    ? activity.amount
    : minusCategories.has(activity.category)
      ? activity.amount.times(-1)
      : new Big(0);
}

export const getManualPortfolioOverview = withTransaction(
  async ({ userId, portfolioId }: { userId: number; portfolioId: string }): Promise<ManualPortfolioOverviewModel> => {
    const portfolio = await portfolioForManual({ userId, portfolioId });
    const currencyCode = portfolio.displayCurrencyCode!;
    const valuations = await ManualPortfolioValuations.findAll({
      where: { portfolioId },
      order: [
        ['date', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
    const opening = valuations[0];
    const latest = valuations.at(-1);
    const allActivities = await activities({ portfolioId });
    // Valuations are end-of-day snapshots. Events on that same calendar day
    // are already reflected in the reported figure and must never be added a
    // second time to a derived current value.
    const afterLatest = latest ? allActivities.filter((entry) => entry.date > latest.date) : [];
    const netAfterLatest = latest ? afterLatest.reduce((sum, entry) => sum.plus(effect(entry)), new Big(0)) : null;
    const current = latest ? amount(latest.value).plus(netAfterLatest!) : null;
    if (current?.lt(0))
      throw new ValidationError({ message: 'Manual portfolio activity would make the derived value negative.' });
    const totals = Object.fromEntries(
      Object.values(MANUAL_PORTFOLIO_TRANSACTION_CATEGORY).map((category) => [
        category,
        asMoney(
          allActivities
            .filter((entry) => entry.category === category)
            .reduce((sum, entry) => sum.plus(entry.amount), new Big(0)),
        ),
      ]),
    ) as ManualPortfolioOverviewModel['totals'];
    const performance = calculateManualPortfolioPerformance({
      opening: opening ? { date: opening.date, value: amount(opening.value) } : undefined,
      current,
      activities: allActivities,
    });
    const { baseline, gain, usesOpeningBaseline } = performance;
    const [records, transfers] = await Promise.all([
      ManualPortfolioTransactions.findAll({
        where: { portfolioId },
        order: [
          ['date', 'DESC'],
          ['createdAt', 'DESC'],
        ],
      }),
      PortfolioTransfers.findAll({
        where: { [Op.or]: [{ toPortfolioId: portfolioId }, { fromPortfolioId: portfolioId }] },
        order: [
          ['date', 'DESC'],
          ['createdAt', 'DESC'],
        ],
      }),
    ]);
    const timeline: ManualPortfolioOverviewModel['timeline'] = [
      ...records.map((row) => ({
        id: row.id,
        kind: 'transaction' as const,
        portfolioId: row.portfolioId,
        category: row.category,
        amount: asMoney(amount(row.amount)),
        date: row.date,
        note: row.note,
        source: row.source,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      ...valuations.map((row) => ({
        id: row.id,
        kind: 'valuation' as const,
        portfolioId: row.portfolioId,
        value: asMoney(amount(row.value)),
        date: row.date,
        note: row.note,
        source: row.source,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      ...transfers
        .filter((row) => !row.isAdjustment)
        .map((row) => ({
          id: row.id,
          kind: 'linked-transfer' as const,
          date: row.date,
          amount: asMoney(amount(row.amount)),
          category: row.toPortfolioId === portfolioId ? ('contribution' as const) : ('withdrawal' as const),
          note: row.description,
        })),
    ].sort((a, b) =>
      a.date === b.date ? (a.kind === 'valuation' ? 1 : b.kind === 'valuation' ? -1 : 0) : b.date.localeCompare(a.date),
    );
    const ageDays = latest
      ? Math.floor((Date.now() - new Date(`${latest.date}T00:00:00`).getTime()) / 86_400_000)
      : Infinity;
    return {
      currencyCode,
      openingValue: opening ? asMoney(amount(opening.value)) : null,
      openingDate: opening?.date ?? null,
      lastReportedValue: latest ? asMoney(amount(latest.value)) : null,
      valuationDate: latest?.date ?? null,
      netActivitySinceValuation: netAfterLatest ? asMoney(netAfterLatest) : null,
      currentValue: current ? asMoney(current) : null,
      gain: gain ? asMoney(gain) : null,
      gainPercent:
        gain && amount(totals.contribution).gt(0) ? gain.div(amount(totals.contribution)).times(100).toFixed(2) : null,
      isStale: ageDays > 31,
      totals,
      history: valuations.map((valuation) => {
        const capital = baseline
          .plus(
            allActivities
              .filter(
                (entry) =>
                  (usesOpeningBaseline ? entry.date > opening!.date : entry.date <= valuation.date) &&
                  entry.date <= valuation.date &&
                  entry.category === MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
              )
              .reduce((sum, entry) => sum.plus(entry.amount), new Big(0)),
          )
          .minus(
            allActivities
              .filter(
                (entry) =>
                  (usesOpeningBaseline ? entry.date > opening!.date : entry.date <= valuation.date) &&
                  entry.date <= valuation.date &&
                  entry.category === MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.withdrawal,
              )
              .reduce((sum, entry) => sum.plus(entry.amount), new Big(0)),
          );
        return {
          date: valuation.date,
          reportedValue: asMoney(amount(valuation.value)),
          investedCapital: asMoney(capital),
        };
      }),
      timeline,
    };
  },
);

export const createManualPortfolioTransaction = withTransaction(
  async ({
    userId,
    portfolioId,
    category,
    amount: input,
    date,
    note,
    source,
  }: {
    userId: number;
    portfolioId: string;
    category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY;
    amount: string;
    date: string;
    note?: string | null;
    source?: string | null;
  }) => {
    await portfolioForManual({ userId, portfolioId });
    const record = await ManualPortfolioTransactions.create({
      portfolioId,
      category,
      amount: input,
      date,
      note: note || null,
      source: source || null,
    });
    await getManualPortfolioOverview({ userId, portfolioId });
    return record;
  },
);

export const createManualPortfolioValuation = withTransaction(
  async ({
    userId,
    portfolioId,
    value,
    date,
    note,
    source,
  }: {
    userId: number;
    portfolioId: string;
    value: string;
    date: string;
    note?: string | null;
    source?: string | null;
  }) => {
    await portfolioForManual({ userId, portfolioId });
    let valuation = await ManualPortfolioValuations.findOne({ where: { portfolioId, date } });
    if (valuation) {
      await valuation.update({ value, note: note || null, source: source || null });
    } else {
      try {
        valuation = await ManualPortfolioValuations.create({
          portfolioId,
          value,
          date,
          note: note || null,
          source: source || null,
        });
      } catch (error) {
        // A concurrent request may have inserted the same EOD snapshot. Treat
        // this endpoint as replace semantics instead of leaking a DB constraint.
        if (!(error instanceof UniqueConstraintError)) throw error;
        valuation = await ManualPortfolioValuations.findOne({ where: { portfolioId, date } });
        if (!valuation) throw error;
        await valuation.update({ value, note: note || null, source: source || null });
      }
    }
    await getManualPortfolioOverview({ userId, portfolioId });
    return valuation;
  },
);

export const updateManualPortfolioTransaction = withTransaction(
  async ({
    userId,
    portfolioId,
    recordId,
    ...changes
  }: {
    userId: number;
    portfolioId: string;
    recordId: string;
    category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY;
    amount: string;
    date: string;
    note?: string | null;
    source?: string | null;
  }) => {
    await portfolioForManual({ userId, portfolioId });
    const record = await findOrThrowNotFound({
      query: ManualPortfolioTransactions.findOne({ where: { id: recordId, portfolioId } }),
      message: 'Manual transaction not found.',
    });
    await record.update({ ...changes, note: changes.note || null, source: changes.source || null });
    await getManualPortfolioOverview({ userId, portfolioId });
    return record;
  },
);

export const deleteManualPortfolioTransaction = withTransaction(
  async ({ userId, portfolioId, recordId }: { userId: number; portfolioId: string; recordId: string }) => {
    await portfolioForManual({ userId, portfolioId });
    const record = await findOrThrowNotFound({
      query: ManualPortfolioTransactions.findOne({ where: { id: recordId, portfolioId } }),
      message: 'Manual transaction not found.',
    });
    await record.destroy();
    await getManualPortfolioOverview({ userId, portfolioId });
  },
);

export const updateManualPortfolioValuation = withTransaction(
  async ({
    userId,
    portfolioId,
    valuationId,
    ...changes
  }: {
    userId: number;
    portfolioId: string;
    valuationId: string;
    value: string;
    date: string;
    note?: string | null;
    source?: string | null;
  }) => {
    await portfolioForManual({ userId, portfolioId });
    const valuation = await findOrThrowNotFound({
      query: ManualPortfolioValuations.findOne({ where: { id: valuationId, portfolioId } }),
      message: 'Manual valuation not found.',
    });
    const conflict = await ManualPortfolioValuations.findOne({
      where: { portfolioId, date: changes.date, id: { [Op.ne]: valuationId } },
    });
    if (conflict) await conflict.destroy();
    await valuation.update({ ...changes, note: changes.note || null, source: changes.source || null });
    await getManualPortfolioOverview({ userId, portfolioId });
    return valuation;
  },
);

export const deleteManualPortfolioValuation = withTransaction(
  async ({ userId, portfolioId, valuationId }: { userId: number; portfolioId: string; valuationId: string }) => {
    await portfolioForManual({ userId, portfolioId });
    const valuation = await findOrThrowNotFound({
      query: ManualPortfolioValuations.findOne({ where: { id: valuationId, portfolioId } }),
      message: 'Manual valuation not found.',
    });
    await valuation.destroy();
    await getManualPortfolioOverview({ userId, portfolioId });
  },
);
