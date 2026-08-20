import { AI_FEATURE } from '@bt/shared/types';
import { MANUAL_PORTFOLIO_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import ManualPortfolioTransactions from '@models/investments/manual-portfolio-transaction.model';
import ManualPortfolioValuations from '@models/investments/manual-portfolio-valuation.model';
import {
  AI_MAX_OUTPUT_TOKENS,
  AI_OUTPUT_TRUNCATED_MESSAGE,
  aiCallGuards,
  createAIClient,
  describeMissingAiConfiguration,
  hitOutputCeiling,
} from '@services/ai';
import { type AIExtractionError, resolveAiExtractionFailure } from '@services/import-export/core/ai-extraction-failure';
import { extractTextFromFile, validateFileBuffer } from '@services/import-export/statement-parser';
import { generateText } from 'ai';
import { parse } from 'csv-parse/sync';

import {
  createManualPortfolioTransaction,
  createManualPortfolioValuation,
  getManualPortfolioOverview,
} from './manual-values.service';

export type ManualImportRecord = {
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
};

const categoryAliases: Record<string, MANUAL_PORTFOLIO_TRANSACTION_CATEGORY> = {
  contribution: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
  contributo: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
  contributions: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
  deposit: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
  versamento: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
  withdrawal: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.withdrawal,
  withdrawals: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.withdrawal,
  prelievo: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.withdrawal,
  fee: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.fee,
  fees: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.fee,
  commissione: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.fee,
  commissioni: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.fee,
  tax: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.tax,
  taxes: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.tax,
  tassa: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.tax,
  tasse: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.tax,
  income: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.other_income,
  otherincome: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.other_income,
  other_income: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.other_income,
  interesse: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.other_income,
  interessi: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.other_income,
  interest: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.other_income,
  distribution: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.distribution,
  distributions: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.distribution,
  dividendo: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.distribution,
  dividendi: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.distribution,
  dividend: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.distribution,
};

const compact = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');

const normaliseCategory = (raw: unknown): MANUAL_PORTFOLIO_TRANSACTION_CATEGORY | null => {
  if (typeof raw !== 'string') return null;
  const key = compact(raw);
  return categoryAliases[key] ?? categoryAliases[key.replace(/_/g, '')] ?? null;
};

const normaliseNumber = (raw: unknown) => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw)
    .trim()
    .replace(/[^0-9,.-]/g, '');
  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');
  const normalised = comma > dot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  const positive = normalised.replace(/^-/, '');
  return /^\d+(\.\d+)?$/.test(positive) ? positive : null;
};

const normaliseCurrency = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toUpperCase();
  if (value === '€' || value === 'EUR') return 'EUR';
  if (value === '$' || value === 'USD') return 'USD';
  if (value === '£' || value === 'GBP') return 'GBP';
  return /^[A-Z]{3}$/.test(value) ? value : null;
};

const isValidDate = (date: string) => {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === date;
};

const localDate = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().split(/[T ]/)[0] ?? '';
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const eu = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const date = iso
    ? `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`
    : eu
      ? `${eu[3]}-${eu[2]!.padStart(2, '0')}-${eu[1]!.padStart(2, '0')}`
      : null;
  return date && isValidDate(date) ? date : null;
};

const warningsFor = ({
  kind,
  date,
  amount,
  category,
}: {
  kind: ManualImportRecord['kind'];
  date: string | null;
  amount: string | null;
  category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY | null;
}) =>
  [
    !date && 'Date is required.',
    !amount && 'Amount/value is required.',
    kind === 'transaction' && !category && 'Choose a transaction category.',
  ].filter(Boolean) as string[];

async function markRecords({
  portfolioId,
  currencyCode,
  records,
}: {
  portfolioId: string;
  currencyCode: string;
  records: ManualImportRecord[];
}) {
  const [transactions, valuations] = await Promise.all([
    ManualPortfolioTransactions.findAll({ where: { portfolioId } }),
    ManualPortfolioValuations.findAll({ where: { portfolioId } }),
  ]);
  const seen = new Set<string>();

  return records.map((record) => {
    const duplicateKey =
      record.kind === 'valuation' ? `v:${record.date}` : `t:${record.date}:${record.amount}:${record.category}`;
    const duplicate =
      (record.kind === 'valuation' && valuations.some((row) => row.date === record.date)) ||
      (record.kind === 'transaction' &&
        transactions.some(
          (row) =>
            row.date === record.date && row.amount.toString() === record.amount && row.category === record.category,
        ));
    const alreadyImported = seen.has(duplicateKey);
    const currencyMismatch = Boolean(record.currencyCode && record.currencyCode !== currencyCode);
    const warnings = [...record.warnings];
    if (currencyMismatch)
      warnings.push(`Currency ${record.currencyCode} does not match the portfolio currency ${currencyCode}.`);
    if (duplicate || alreadyImported) warnings.push('Possible duplicate of an existing or imported record.');
    seen.add(duplicateKey);
    return {
      ...record,
      currencyMismatch,
      possibleDuplicate: duplicate || alreadyImported,
      warnings,
    };
  });
}

function parseCsvDelimiter(csv: string): string {
  const firstLine = csv.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t'];
  return candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0] ?? ',';
}

/** Deterministic, free CSV fallback. Raw input is never persisted. */
export async function extractManualCsv({
  userId,
  portfolioId,
  csv,
}: {
  userId: number;
  portfolioId: string;
  csv: string;
}) {
  const overview = await getManualPortfolioOverview({ userId, portfolioId });
  const rows = parse(csv, {
    columns: true,
    delimiter: parseCsvDelimiter(csv),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const records = rows.map((row, index): ManualImportRecord => {
    const fields = Object.fromEntries(Object.entries(row).map(([key, value]) => [compact(key), value]));
    const type = String(fields.type ?? fields.kind ?? fields.event ?? fields.operation ?? '').toLowerCase();
    const rawCategory = fields.category ?? fields.categoria ?? fields.type ?? fields.kind ?? fields.tipo ?? '';
    const explicitCategory = normaliseCategory(rawCategory);
    const isValuation =
      /valuation|snapshot|balance|saldo|valore|value/.test(type) ||
      ((fields.value !== undefined || fields.valore !== undefined) && !explicitCategory);
    const date = localDate(fields.date ?? fields.data ?? '');
    const amount = normaliseNumber(
      isValuation
        ? (fields.value ?? fields.valore ?? fields.amount ?? fields.importo ?? '')
        : (fields.amount ?? fields.importo ?? fields.value ?? fields.valore ?? ''),
    );
    const category = isValuation ? null : explicitCategory;
    const currencyCode = normaliseCurrency(
      fields.currency ?? fields.currencycode ?? fields.currency_code ?? fields.valute ?? fields.valuta,
    );
    return {
      tempId: `csv-${index}`,
      kind: isValuation ? 'valuation' : 'transaction',
      date,
      amount,
      category,
      currencyCode,
      note: fields.note ?? fields.description ?? fields.descrizione ?? null,
      confidence: 1,
      sourceContext: `CSV row ${index + 2}`,
      warnings: warningsFor({ kind: isValuation ? 'valuation' : 'transaction', date, amount, category }),
      possibleDuplicate: false,
    };
  });

  return {
    records: await markRecords({ portfolioId, currencyCode: overview.currencyCode, records }),
    warnings: ['Review every row before importing. CSV import is local and free.'],
  };
}

const MANUAL_IMPORT_SYSTEM_PROMPT = `You extract manual portfolio records from pension-fund statements.
Output ONLY a JSON array. Do not include markdown or explanations.
Each object must use these fields: kind, date, amount, category, currencyCode, note, confidence, sourceContext.
kind is exactly "transaction" or "valuation". A valuation is a dated reported portfolio value/snapshot/balance.
Transactions use exactly one category: contribution, withdrawal, fee, tax, other_income, distribution.
date must be YYYY-MM-DD. amount is a positive decimal string. currencyCode is a three-letter ISO code when present.
Use absolute positive amounts even when the source shows a minus sign; infer withdrawal/fee/tax from the source label.
Support Italian and European date/number formats, including comma decimals and dot thousands separators.
Never invent missing required fields: use null and let the user review it. confidence is a number from 0 to 1.
sourceContext is a short excerpt or source label that helps the user verify the row.
Extract both transactions and valuation snapshots, and preserve every distinct record.`;

const MANUAL_IMPORT_PROMPT = (text: string) =>
  `Extract all manual portfolio transactions and valuation snapshots from this source:\n\n---\n${text}\n---`;

function parseAiJson(response: string): unknown[] {
  let value = response.trim();
  if (value.startsWith('```')) value = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(value);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { records?: unknown[] }).records)) {
    return (parsed as { records: unknown[] }).records;
  }
  return [];
}

function normaliseAiRecords(rawRecords: unknown[]): ManualImportRecord[] {
  return rawRecords.map((raw, index) => {
    const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const kind = /valuation|snapshot|balance|value|saldo|valore/i.test(String(row.kind ?? row.type ?? ''))
      ? 'valuation'
      : 'transaction';
    const date = localDate(row.date ?? row.data);
    const amount = normaliseNumber(row.amount ?? row.value ?? row.valore ?? row.importo);
    const category = kind === 'transaction' ? normaliseCategory(row.category ?? row.tipo ?? row.type) : null;
    const confidenceRaw = Number(row.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? confidenceRaw > 1
        ? Math.min(100, Math.max(0, confidenceRaw)) / 100
        : Math.min(1, Math.max(0, confidenceRaw))
      : 0.5;
    return {
      tempId: `ai-${index}`,
      kind,
      date,
      amount,
      category,
      currencyCode: normaliseCurrency(row.currencyCode ?? row.currency ?? row.valuta),
      note: typeof row.note === 'string' ? row.note : null,
      confidence,
      sourceContext: typeof row.sourceContext === 'string' ? row.sourceContext : null,
      warnings: warningsFor({ kind, date, amount, category }),
      possibleDuplicate: false,
    };
  });
}

async function extractManualTextWithAI({ userId, text }: { userId: number; text: string }) {
  const aiClient = await createAIClient({ userId, feature: AI_FEATURE.investmentTransactionsParsing });
  if (!aiClient) {
    return {
      success: false as const,
      error: { code: 'NO_AI_CONFIGURED', message: await describeMissingAiConfiguration({ userId }) },
    } satisfies { success: false; error: AIExtractionError };
  }

  try {
    const { abortSignal, maxRetries } = aiCallGuards({ provider: aiClient.provider });
    const {
      text: responseText,
      usage,
      finishReason,
    } = await generateText({
      model: aiClient.model,
      system: MANUAL_IMPORT_SYSTEM_PROMPT,
      prompt: MANUAL_IMPORT_PROMPT(text),
      abortSignal,
      maxRetries,
      maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
    });
    if (hitOutputCeiling({ finishReason, usage })) {
      return { success: false as const, error: { code: 'OUTPUT_TRUNCATED', message: AI_OUTPUT_TRUNCATED_MESSAGE } };
    }
    const records = normaliseAiRecords(parseAiJson(responseText));
    if (records.length === 0) {
      return { success: false as const, error: { code: 'NO_TRANSACTIONS_FOUND', message: 'No manual records found.' } };
    }
    return {
      success: true as const,
      records,
      tokenCount: { input: usage?.inputTokens ?? 0, output: usage?.outputTokens ?? 0 },
    };
  } catch (error) {
    const failure = await resolveAiExtractionFailure({
      userId,
      aiClient,
      error,
      logPrefix: '[Manual portfolio parser]',
    });
    return { success: false as const, error: failure.error };
  }
}

export async function extractManualAi({
  userId,
  portfolioId,
  text,
  fileBase64,
}: {
  userId: number;
  portfolioId: string;
  text?: string;
  fileBase64?: string;
}) {
  let sourceText = text?.trim() ?? '';
  let fileType: string | undefined;
  if (fileBase64) {
    const validation = validateFileBuffer({ buffer: Buffer.from(fileBase64, 'base64') });
    if (!validation.valid || !validation.fileBuffer || !validation.fileType) {
      throw new ValidationError({ message: validation.error?.message ?? 'Invalid import file.' });
    }
    const extracted = await extractTextFromFile({ buffer: validation.fileBuffer, fileType: validation.fileType });
    if (!extracted.success || !extracted.text) {
      throw new ValidationError({ message: extracted.error ?? 'Could not extract text from the import file.' });
    }
    sourceText = extracted.text;
    fileType = validation.fileType;
  }
  if (!sourceText) throw new ValidationError({ message: 'Paste text or upload a PDF, CSV, or TXT file.' });

  const overview = await getManualPortfolioOverview({ userId, portfolioId });
  const result = await extractManualTextWithAI({ userId, text: sourceText });
  if (!result.success) {
    logger.info('[Manual portfolio parser] AI extraction returned failure', { userId, code: result.error.code });
    throw new ValidationError({ message: result.error.message });
  }
  return {
    records: await markRecords({ portfolioId, currencyCode: overview.currencyCode, records: result.records }),
    warnings: [
      'Review every extracted record before importing. The source content is discarded after extraction.',
      ...(fileType ? [`AI extracted text from ${fileType.toUpperCase()}.`] : []),
    ],
    tokenCount: result.tokenCount,
  };
}

export async function executeManualImport({
  userId,
  portfolioId,
  records,
  skipTempIds,
}: {
  userId: number;
  portfolioId: string;
  records: ManualImportRecord[];
  skipTempIds: string[];
}) {
  const overview = await getManualPortfolioOverview({ userId, portfolioId });
  const confirmed = records.filter((record) => !skipTempIds.includes(record.tempId));
  for (const record of confirmed) {
    if (!record.date || !record.amount || (record.kind === 'transaction' && !record.category)) {
      throw new ValidationError({
        message: 'Every imported record needs a date and amount/value; transactions also need a category.',
      });
    }
    if (record.currencyCode && record.currencyCode !== overview.currencyCode && !record.currencyMismatch) {
      throw new ValidationError({
        message: `Currency ${record.currencyCode} does not match ${overview.currencyCode}.`,
      });
    }
    if (record.currencyMismatch) {
      throw new ValidationError({
        message: `Resolve the currency mismatch for ${record.sourceContext ?? record.tempId}, or skip it.`,
      });
    }
    const duplicate =
      record.kind === 'valuation'
        ? await ManualPortfolioValuations.findOne({ where: { portfolioId, date: record.date } })
        : await ManualPortfolioTransactions.findOne({
            where: { portfolioId, date: record.date, amount: record.amount, category: record.category },
          });
    if (duplicate && !record.possibleDuplicate) {
      throw new ValidationError({
        message: `Possible duplicate ${record.sourceContext ?? record.tempId}; explicitly keep or skip it.`,
      });
    }
    if (record.kind === 'valuation') {
      await createManualPortfolioValuation({
        userId,
        portfolioId,
        value: record.amount,
        date: record.date,
        note: record.note,
        source: 'import',
      });
    } else {
      await createManualPortfolioTransaction({
        userId,
        portfolioId,
        amount: record.amount,
        date: record.date,
        category: record.category!,
        note: record.note,
        source: 'import',
      });
    }
  }
  return { imported: confirmed.length, skipped: records.length - confirmed.length };
}
