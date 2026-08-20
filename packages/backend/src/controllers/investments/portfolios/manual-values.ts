import {
  MANUAL_PORTFOLIO_JSON_FORMAT,
  MANUAL_PORTFOLIO_JSON_VERSION,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY,
} from '@bt/shared/types/investments';
import { currencyCode, dateString, decimalString, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { importManualPortfolioJson } from '@services/investments/portfolios/manual-values-json.service';
import {
  createManualPortfolioTransaction,
  createManualPortfolioValuation,
  deleteManualPortfolioTransaction,
  deleteManualPortfolioValuation,
  getManualPortfolioOverview,
  updateManualPortfolioTransaction,
  updateManualPortfolioValuation,
} from '@services/investments/portfolios/manual-values.service';
import { z } from 'zod';

const params = z.object({ id: recordId() });
const note = z.string().max(2000).nullable().optional();
const source = z.string().max(64).nullable().optional();
const positiveDecimalString = () =>
  decimalString().refine((value) => Number(value) > 0, 'Amount must be a valid number greater than 0');
const nonNegativeDecimalString = () =>
  decimalString().refine((value) => Number(value) >= 0, 'Value must be zero or greater');
export const manualPortfolioTransactionBodySchema = z.object({
  category: z.nativeEnum(MANUAL_PORTFOLIO_TRANSACTION_CATEGORY),
  amount: positiveDecimalString(),
  date: dateString(),
  note,
  source,
});
export const manualPortfolioValuationBodySchema = z.object({
  value: nonNegativeDecimalString(),
  date: dateString(),
  note,
  source,
});
const manualPortfolioJsonRecordNote = z.string().max(2000).nullable();
const manualPortfolioJsonRecordSource = z.string().max(64).nullable();
export const manualPortfolioJsonBodySchema = z.object({
  format: z.literal(MANUAL_PORTFOLIO_JSON_FORMAT),
  version: z.literal(MANUAL_PORTFOLIO_JSON_VERSION),
  portfolioName: z.string().trim().min(1).max(200),
  currencyCode: currencyCode(),
  transactions: z
    .array(
      z.object({
        category: z.nativeEnum(MANUAL_PORTFOLIO_TRANSACTION_CATEGORY),
        amount: positiveDecimalString(),
        date: dateString(),
        note: manualPortfolioJsonRecordNote,
        source: manualPortfolioJsonRecordSource,
      }),
    )
    .max(5000),
  valuations: z
    .array(
      z.object({
        value: nonNegativeDecimalString(),
        date: dateString(),
        note: manualPortfolioJsonRecordNote,
        source: manualPortfolioJsonRecordSource,
      }),
    )
    .max(5000),
});

export const getManualValuesController = createController(z.object({ params }), async ({ user, params: route }) => ({
  data: await getManualPortfolioOverview({
    userId: user.id,
    portfolioId: route.id,
  }),
}));
export const createManualTransactionController = createController(
  z.object({
    params,
    body: manualPortfolioTransactionBodySchema,
  }),
  async ({ user, params: route, body }) => ({
    data: await createManualPortfolioTransaction({
      userId: user.id,
      portfolioId: route.id,
      ...body,
    }),
  }),
);
export const createManualValuationController = createController(
  z.object({
    params,
    body: manualPortfolioValuationBodySchema,
  }),
  async ({ user, params: route, body }) => ({
    data: await createManualPortfolioValuation({
      userId: user.id,
      portfolioId: route.id,
      ...body,
    }),
  }),
);

export const deleteManualTransactionController = createController(
  z.object({ params: params.extend({ recordId: recordId() }) }),
  async ({ user, params: route }) => {
    await deleteManualPortfolioTransaction({
      userId: user.id,
      portfolioId: route.id,
      recordId: route.recordId,
    });
    return { data: { id: route.recordId } };
  },
);

export const deleteManualValuationController = createController(
  z.object({ params: params.extend({ valuationId: recordId() }) }),
  async ({ user, params: route }) => {
    await deleteManualPortfolioValuation({
      userId: user.id,
      portfolioId: route.id,
      valuationId: route.valuationId,
    });
    return { data: { id: route.valuationId } };
  },
);

export const updateManualTransactionController = createController(
  z.object({
    params: params.extend({ recordId: recordId() }),
    body: manualPortfolioTransactionBodySchema,
  }),
  async ({ user, params: route, body }) => ({
    data: await updateManualPortfolioTransaction({
      userId: user.id,
      portfolioId: route.id,
      recordId: route.recordId,
      ...body,
    }),
  }),
);

export const updateManualValuationController = createController(
  z.object({
    params: params.extend({ valuationId: recordId() }),
    body: manualPortfolioValuationBodySchema,
  }),
  async ({ user, params: route, body }) => ({
    data: await updateManualPortfolioValuation({
      userId: user.id,
      portfolioId: route.id,
      valuationId: route.valuationId,
      ...body,
    }),
  }),
);

export const importManualPortfolioJsonController = createController(
  z.object({
    params,
    body: manualPortfolioJsonBodySchema,
  }),
  async ({ user, params: route, body }) => ({
    data: await importManualPortfolioJson({
      userId: user.id,
      portfolioId: route.id,
      payload: body,
    }),
  }),
);
