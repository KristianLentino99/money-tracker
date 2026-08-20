/**
 * Manual portfolios store their denomination in displayCurrencyCode. When the
 * selector is left on the user's base currency it represents that choice with
 * null, so manual tracking must resolve it to the concrete currency code before
 * submitting the portfolio.
 */
export function resolvePortfolioDisplayCurrencyCode({
  isManualTracking,
  displayCurrencyCode,
  baseCurrencyCode,
}: {
  isManualTracking: boolean;
  displayCurrencyCode: string | null;
  baseCurrencyCode?: string | null;
}): string | null {
  if (!isManualTracking) return displayCurrencyCode;
  return displayCurrencyCode ?? baseCurrencyCode ?? null;
}
