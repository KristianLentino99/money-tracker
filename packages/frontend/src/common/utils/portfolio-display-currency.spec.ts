import { describe, expect, it } from 'vitest';

import { resolvePortfolioDisplayCurrencyCode } from './portfolio-display-currency';

describe('resolvePortfolioDisplayCurrencyCode', () => {
  it('resolves the base-currency selector value for manual portfolios', () => {
    expect(
      resolvePortfolioDisplayCurrencyCode({
        isManualTracking: true,
        displayCurrencyCode: null,
        baseCurrencyCode: 'EUR',
      }),
    ).toBe('EUR');
  });

  it('keeps an explicitly selected currency for manual portfolios', () => {
    expect(
      resolvePortfolioDisplayCurrencyCode({
        isManualTracking: true,
        displayCurrencyCode: 'USD',
        baseCurrencyCode: 'EUR',
      }),
    ).toBe('USD');
  });

  it('keeps the existing nullable display currency for regular portfolios', () => {
    expect(
      resolvePortfolioDisplayCurrencyCode({
        isManualTracking: false,
        displayCurrencyCode: null,
        baseCurrencyCode: 'EUR',
      }),
    ).toBeNull();
  });
});
