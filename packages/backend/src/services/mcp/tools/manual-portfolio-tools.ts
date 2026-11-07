import {
  MANUAL_PORTFOLIO_JSON_FORMAT,
  MANUAL_PORTFOLIO_JSON_VERSION,
  MANUAL_PORTFOLIO_TRANSACTION_CATEGORY,
} from '@bt/shared/types/investments';
import { currencyCode, dateString, decimalString, recordId } from '@common/lib/zod/custom-types';
import {
  executeManualImport,
  extractManualAi,
  extractManualCsv,
  type ManualImportRecord,
} from '@services/investments/portfolios/manual-values-import.service';
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

import { defineTool } from '../define-tool';
import { requireScope } from './helpers';

const note = z.string().max(2000).nullable().optional();
const source = z.string().max(64).nullable().optional();
const positiveAmount = decimalString().refine((value) => Number(value) > 0, 'Amount must be greater than zero');
const nonNegativeValue = decimalString().refine((value) => Number(value) >= 0, 'Value must be zero or greater');
const transactionSchema = z.object({
  category: z.nativeEnum(MANUAL_PORTFOLIO_TRANSACTION_CATEGORY),
  amount: positiveAmount.describe(
    'Positive decimal string in the portfolio currency; category determines cash direction',
  ),
  date: dateString(),
  note,
  source,
});
const valuationSchema = z.object({ value: nonNegativeValue, date: dateString(), note, source });
const portfolioSchema = { portfolioId: recordId().describe('Manual portfolio ID from get_portfolios') };
const transactionInputSchema = {
  ...portfolioSchema,
  action: z.enum(['create', 'update', 'delete']).describe('Operation; confirm with the user before deleting'),
  recordId: recordId().optional().describe('Required for update/delete, from get_manual_portfolio'),
  transaction: transactionSchema
    .optional()
    .describe('Required complete transaction body for create/update; omit for delete'),
};
const valuationInputSchema = {
  ...portfolioSchema,
  action: z.enum(['create', 'update', 'delete']).describe('Operation; confirm with the user before deleting'),
  valuationId: recordId().optional().describe('Required for update/delete, from get_manual_portfolio'),
  valuation: valuationSchema
    .optional()
    .describe(
      'Required complete end-of-day snapshot for create/update; create replaces any snapshot already on that date',
    ),
};
const exportNote = z.string().max(2000).nullable();
const exportSource = z.string().max(64).nullable();
const jsonPayloadSchema = z.object({
  format: z.literal(MANUAL_PORTFOLIO_JSON_FORMAT),
  version: z.literal(MANUAL_PORTFOLIO_JSON_VERSION),
  portfolioName: z.string().trim().min(1).max(200),
  currencyCode: currencyCode(),
  transactions: z.array(transactionSchema.extend({ note: exportNote, source: exportSource })).max(5000),
  valuations: z.array(valuationSchema.extend({ note: exportNote, source: exportSource })).max(5000),
});
const jsonInputSchema = {
  ...portfolioSchema,
  payload: jsonPayloadSchema.describe(
    'Versioned manual-portfolio JSON export in the same currency as the destination portfolio',
  ),
};
const extractInputSchema = {
  ...portfolioSchema,
  source: z
    .enum(['csv', 'ai'])
    .describe('csv uses deterministic parsing; ai extracts reviewed candidates from text or a file'),
  csv: z.string().min(1).optional().describe('CSV content required for source=csv'),
  text: z.string().optional().describe('Source text for source=ai'),
  fileBase64: z
    .string()
    .optional()
    .describe('Base64 PDF, CSV or TXT for source=ai; file type is validated server-side'),
};
const extractionSourceSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('csv'), csv: z.string().min(1) }),
  z
    .object({ source: z.literal('ai'), text: z.string().optional(), fileBase64: z.string().optional() })
    .refine((args) => Boolean(args.text?.trim() || args.fileBase64), 'Paste text or upload a file.'),
]);
const importRecordSchema = z.object({
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
const executeInputSchema = {
  ...portfolioSchema,
  records: z
    .array(importRecordSchema)
    .min(1)
    .describe('Reviewed extraction records. Correct missing dates/amounts and currency mismatches before execution.'),
  skipTempIds: z
    .array(z.string())
    .describe(
      'Temporary IDs explicitly skipped after review; use possibleDuplicate=true only when a duplicate is deliberately retained',
    ),
};

export const getManualPortfolioTool = defineTool({
  name: 'get_manual_portfolio',
  toolset: 'investments',
  access: 'read',
  description:
    'Get a manually tracked portfolio overview, transaction records, end-of-day valuations and timeline. Values are decimals in the portfolio display currency. Use record and valuation IDs with the manual management tools.',
  input: portfolioSchema,
  run: ({ userId, args }) => getManualPortfolioOverview({ userId, ...args }),
});

export const manageManualPortfolioTransactionTool = defineTool({
  name: 'manage_manual_portfolio_transaction',
  toolset: 'investments',
  access: 'write',
  conditionalDelete: 'when action is delete',
  description:
    'Create, fully update or delete a manual portfolio cash-flow record: contribution, withdrawal, fee, tax, distribution or other income. Amounts are positive decimal strings; category supplies direction. Updates require recordId plus complete transaction body; confirm deletion with the user.',
  input: transactionInputSchema,
  run: async ({ userId, args, extra }) => {
    const { portfolioId } = args;
    if (args.action === 'delete') {
      requireScope({ extra, scope: 'finance:delete' });
      await deleteManualPortfolioTransaction({
        userId,
        portfolioId,
        recordId: portfolioSchema.portfolioId.parse(args.recordId),
      });
      return { success: true };
    }
    const transaction = transactionSchema.parse(args.transaction);

    return args.action === 'create'
      ? createManualPortfolioTransaction({ userId, portfolioId, ...transaction })
      : updateManualPortfolioTransaction({
          userId,
          portfolioId,
          recordId: portfolioSchema.portfolioId.parse(args.recordId),
          ...transaction,
        });
  },
});

export const manageManualPortfolioValuationTool = defineTool({
  name: 'manage_manual_portfolio_valuation',
  toolset: 'investments',
  access: 'write',
  conditionalDelete: 'when action is delete',
  description:
    'Create/replace an end-of-day manual valuation, fully update a valuation by ID, or delete it. value is a non-negative decimal string in the portfolio currency. Creating at an existing date replaces that snapshot; moving an update to an occupied date also replaces that snapshot. Confirm deletion with the user.',
  input: valuationInputSchema,
  run: async ({ userId, args, extra }) => {
    const { portfolioId } = args;
    if (args.action === 'delete') {
      requireScope({ extra, scope: 'finance:delete' });
      await deleteManualPortfolioValuation({
        userId,
        portfolioId,
        valuationId: portfolioSchema.portfolioId.parse(args.valuationId),
      });
      return { success: true };
    }
    const valuation = valuationSchema.parse(args.valuation);

    return args.action === 'create'
      ? createManualPortfolioValuation({ userId, portfolioId, ...valuation })
      : updateManualPortfolioValuation({
          userId,
          portfolioId,
          valuationId: portfolioSchema.portfolioId.parse(args.valuationId),
          ...valuation,
        });
  },
});

export const importManualPortfolioJsonTool = defineTool({
  name: 'import_manual_portfolio_json',
  toolset: 'investments',
  access: 'write',
  description:
    'Import a versioned manual-portfolio JSON export into an existing manual portfolio. Currency must match. Exact duplicate transactions/valuations are skipped; a valuation on an existing date with a different value is rejected. Review the payload before calling.',
  input: jsonInputSchema,
  run: ({ userId, args }) => importManualPortfolioJson({ userId, ...args }),
});

export const extractManualPortfolioImportTool = defineTool({
  name: 'extract_manual_portfolio_import',
  toolset: 'investments',
  access: 'write',
  description:
    'Preview manual-portfolio import candidates from deterministic CSV parsing or AI text/file extraction. Nothing is imported by this tool. Returns records, warnings, duplicate flags and currency mismatches for review before execute_manual_portfolio_import; AI requires an enabled AI connection.',
  input: extractInputSchema,
  run: ({ userId, args }) => {
    const parsed = extractionSourceSchema.parse(args);

    return parsed.source === 'csv'
      ? extractManualCsv({ userId, portfolioId: args.portfolioId, csv: parsed.csv })
      : extractManualAi({
          userId,
          portfolioId: args.portfolioId,
          text: parsed.text,
          fileBase64: parsed.fileBase64,
        });
  },
});

export const executeManualPortfolioImportTool = defineTool({
  name: 'execute_manual_portfolio_import',
  toolset: 'investments',
  access: 'write',
  description:
    'Import reviewed manual portfolio transactions and end-of-day valuations. Pass the corrected records from extract_manual_portfolio_import plus explicit skipTempIds. Unresolved dates/amounts, currency mismatches and unacknowledged duplicates are rejected by the same service as the web app.',
  input: executeInputSchema,
  run: ({ userId, args }) => executeManualImport({ userId, ...args }),
});
