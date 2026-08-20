import { describe, expect, it } from '@jest/globals';

import {
  manualPortfolioJsonBodySchema,
  manualPortfolioTransactionBodySchema,
  manualPortfolioValuationBodySchema,
} from './manual-values';

describe('manual portfolio request schemas', () => {
  it('accepts numeric JSON values and normalizes them to decimal strings', () => {
    const result = manualPortfolioValuationBodySchema.safeParse({
      date: '2026-08-20',
      value: 14921,
      note: 'Valore al 20 Agosto 2026',
      source: null,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.value).toBe('14921');
  });

  it('accepts numeric transaction amounts and normalizes them to decimal strings', () => {
    const result = manualPortfolioTransactionBodySchema.safeParse({
      date: '2026-08-20',
      amount: 125.5,
      category: 'contribution',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe('125.5');
  });

  it('accepts a versioned manual portfolio JSON export', () => {
    const result = manualPortfolioJsonBodySchema.safeParse({
      format: 'money-tracker.manual-portfolio',
      version: 1,
      portfolioName: 'Pensione',
      currencyCode: 'EUR',
      transactions: [{ date: '2026-04-14', amount: '841.68', category: 'contribution', note: null, source: null }],
      valuations: [{ date: '2026-08-20', value: '14921', note: null, source: null }],
    });

    expect(result.success).toBe(true);
  });
});
