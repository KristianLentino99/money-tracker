import { MANUAL_PORTFOLIO_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import {
  executeManualImport,
  extractManualAi,
  extractManualCsv,
  type ManualImportRecord,
} from '@services/investments/portfolios/manual-values-import.service';
import { z } from 'zod';

const params = z.object({ id: recordId() });
const record = z.object({
  tempId: z.string().min(1),
  kind: z.enum(['transaction', 'valuation']),
  date: z.string().nullable(),
  amount: z.string().nullable(),
  category: z.nativeEnum(MANUAL_PORTFOLIO_TRANSACTION_CATEGORY).nullable().optional(),
  currencyCode: z.string().length(3).nullable().optional(),
  currencyMismatch: z.boolean().optional(),
  note: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  sourceContext: z.string().nullable().optional(),
  warnings: z.array(z.string()),
  possibleDuplicate: z.boolean(),
}) satisfies z.ZodType<ManualImportRecord>;

const extractBody = z.discriminatedUnion('source', [
  z.object({ source: z.literal('csv'), csv: z.string().min(1) }),
  z
    .object({ source: z.literal('ai'), text: z.string().optional(), fileBase64: z.string().optional() })
    .refine((body) => Boolean(body.text?.trim() || body.fileBase64), 'Paste text or upload a file.'),
]);

export const extractManualImportController = createController(
  z.object({ params, body: extractBody }),
  async ({ user, params: route, body }) => ({
    data:
      body.source === 'csv'
        ? await extractManualCsv({ userId: user.id, portfolioId: route.id, csv: body.csv })
        : await extractManualAi({
            userId: user.id,
            portfolioId: route.id,
            text: body.text,
            fileBase64: body.fileBase64,
          }),
  }),
);

export const executeManualImportController = createController(
  z.object({ params, body: z.object({ records: z.array(record).min(1), skipTempIds: z.array(z.string()) }) }),
  async ({ user, params: route, body }) => ({
    data: await executeManualImport({ userId: user.id, portfolioId: route.id, ...body }),
  }),
);
