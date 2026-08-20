# Market-data provider search

Money Tracker now keeps provider-native security listings instead of collapsing every match into one ticker. A search for an ETF or stock can therefore show the Yahoo Finance, Financial Modeling Prep, Polygon, and Alpha Vantage records separately. Crypto searches can show pair-specific Kraken markets alongside CoinGecko assets.

The market-catalog approach follows the useful part of [DcaPal](https://github.com/dcapal/dcapal): discover provider-native markets first, normalize them into an application result, and retain the source identifier needed for later price requests. Kraken's implementation uses its public [tradable asset-pairs endpoint](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs) and [OHLC endpoint](https://docs.kraken.com/api-reference/market-data/get-ohlc-data).

## Provider behavior

| Provider                | Search coverage                                                               | Price routing                             | Credentials             |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- | ----------------------- |
| Yahoo Finance           | Stocks, ETFs, international listings, mixed search results                    | Existing Yahoo quote/chart implementation | None                    |
| Financial Modeling Prep | Stocks and ETFs when `FMP_API_KEY` is set                                     | Existing FMP implementation               | `FMP_API_KEY`           |
| Polygon                 | Stocks and ETFs when `POLYGON_API_KEY` is set                                 | Existing Polygon implementation           | `POLYGON_API_KEY`       |
| Alpha Vantage           | Stocks and ETFs when `ALPHA_VANTAGE_API_KEY` is set                           | Existing Alpha Vantage implementation     | `ALPHA_VANTAGE_API_KEY` |
| Kraken                  | Online crypto markets with supported fiat quotes (`BTC-USD`, `BTC-EUR`, etc.) | Kraken daily OHLC                         | None                    |
| CoinGecko               | Crypto assets and market data                                                 | Existing CoinGecko implementation         | `COINGECKO_API_KEY`     |

Yahoo, FMP, Polygon, and Alpha Vantage are queried in parallel when configured. The backend deduplicates only repeated `(providerName, providerSymbol)` rows; the same logical ETF or stock can intentionally appear once per provider. The frontend then groups the flat API response under provider headings.

Kraken's `AssetPairs` catalog is cached for 24 hours. Only online markets with fiat quote currencies supported by the application are exposed. Kraken's native pair key is stored as `providerSymbol`, while the display symbol is normalized to `BASE-QUOTE`. This prevents `BTC-USD` and `BTC-EUR` from being confused with an abstract `BTC` asset and lets historical/latest price requests return to Kraken.

## Configuration

Add or update these variables in the backend environment file used by the deployment:

```dotenv
# Optional keyed stock/ETF catalogs. Add as many as your provider plans allow.
FMP_API_KEY=your-fmp-key
POLYGON_API_KEY=your-polygon-key
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key

# Keyless providers enabled by default.
YAHOO_FINANCE_ENABLED=true
KRAKEN_SEARCH_ENABLED=true

# Crypto asset catalog and fallback price history.
COINGECKO_API_KEY=your-coingecko-demo-key
```

Restart the backend after changing environment variables. The composite provider is lazy-created, so a restart ensures the new provider set is loaded consistently.

`SECURITY_SEARCH_ALL_PROVIDERS` defaults to `true` and should remain enabled in normal deployments. Setting it to `false` is intended for the existing fallback-focused integration-test mode and restores the old single-provider search behavior.

## Operational notes

- Provider failures are isolated during search: a failing catalog does not hide successful results from the other providers.
- A provider's native symbol is preserved in the security record and through add-to-portfolio. Provider-bound crypto holdings route back to Kraken or CoinGecko for price synchronization; stock/ETF holdings retain the existing Yahoo/region fallback strategy for resilient pricing.
- Kraken has no API key in this integration, but it is still subject to public endpoint availability and rate limits. Bulk Kraken price requests are deliberately delayed between markets.
- Kraken's public OHLC endpoint returns a bounded recent window, so the existing crypto backfill remains limited to one year and should not be treated as an all-time history source.
- Yahoo and the keyed providers may return the same listing with different exchange/currency metadata. Users should choose the provider row whose exchange and currency match the intended holding.
- Provider-grouped duplicates are intentional. Do not deduplicate by ticker alone, especially for international listings and crypto pairs.

## Verification

1. Start the backend with the environment above.
2. Open Add symbols and search for a common ETF such as `VOO` or `VWCE`.
3. Confirm each configured provider appears as a separate heading when it returns a match.
4. Search `BTC` with the Crypto filter and confirm Kraken pairs such as `BTC-USD` or `BTC-EUR` appear under Kraken.
5. Add one Kraken pair and verify its price/history requests use the Kraken provider symbol, not a CoinGecko slug.
