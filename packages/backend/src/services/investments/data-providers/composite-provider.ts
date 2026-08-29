import { API_ERROR_CODES } from '@bt/shared/types';
import { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { ServiceUnavailableError } from '@js/errors';
import { logger } from '@js/utils';
import { isAxiosError } from 'axios';

import { AlphaVantageDataProvider } from './alphavantage-provider';
import {
  BaseSecurityDataProvider,
  BulkPriceData,
  BulkPriceFetchOptions,
  HistoricalPriceOptions,
  PriceData,
  ProviderSymbol,
  SearchOptions,
  SecurityPriceFetchInput,
} from './base-provider';
import { CoinGeckoDataProvider } from './coingecko-provider';
import { FmpDataProvider } from './fmp-provider';
import { KrakenDataProvider } from './kraken-provider';
import { PolygonDataProvider } from './polygon-provider';
import {
  getHistoricalPriceProviderPreference,
  getLatestPriceProviderPreference,
  getSearchProviderPreference,
} from './utils';
import { YahooDataProvider } from './yahoo-provider';

interface CompositeProviderOptions {
  fmpApiKey?: string;
  polygonApiKey?: string;
  alphaVantageApiKey?: string;
  coingeckoApiKey?: string;
  /** Defaults to true; Kraken's public market catalog needs no API key. */
  krakenEnabled?: boolean;
  /** Defaults to true (Yahoo requires no API key). Set to false to explicitly disable. */
  yahooEnabled?: boolean;
  /** Defaults to true. Test-only escape hatch for the legacy single-provider suite. */
  searchAllProviders?: boolean;
}

export class CompositeDataProvider extends BaseSecurityDataProvider {
  readonly providerName = SECURITY_PROVIDER.composite;

  private providers: Map<SECURITY_PROVIDER, BaseSecurityDataProvider> = new Map();
  private readonly searchAllProviders: boolean;

  constructor(options: CompositeProviderOptions) {
    super();
    this.searchAllProviders = options.searchAllProviders !== false;

    // Initialize available providers
    if (options.fmpApiKey) {
      this.providers.set(SECURITY_PROVIDER.fmp, new FmpDataProvider(options.fmpApiKey));
    }

    if (options.polygonApiKey) {
      this.providers.set(SECURITY_PROVIDER.polygon, new PolygonDataProvider(options.polygonApiKey));
    }

    if (options.alphaVantageApiKey) {
      this.providers.set(SECURITY_PROVIDER.alphavantage, new AlphaVantageDataProvider(options.alphaVantageApiKey));
    }

    if (options.coingeckoApiKey) {
      this.providers.set(SECURITY_PROVIDER.coingecko, new CoinGeckoDataProvider({ apiKey: options.coingeckoApiKey }));
    }

    if (options.krakenEnabled !== false) {
      this.providers.set(SECURITY_PROVIDER.kraken, new KrakenDataProvider());
    }

    if (options.yahooEnabled !== false) {
      this.providers.set(SECURITY_PROVIDER.yahoo, new YahooDataProvider());
    }

    logger.info(`Composite provider initialized with: ${Array.from(this.providers.keys()).join(', ')}`);
  }

  /**
   * Routes search requests to every configured catalog. The query string does
   * not tell us whether the user wants a stock or a crypto market, so the
   * composite fans out to both groups in parallel and preserves each result's
   * providerName for provider-grouped UI rendering. A single provider failure
   * does not sink the other catalogs.
   */
  public async searchSecurities(query: string, options?: SearchOptions): Promise<SecuritySearchResult[]> {
    const stocksRequested = !options?.assetClass || options.assetClass === ASSET_CLASS.stocks;
    const cryptoRequested = !options?.assetClass || options.assetClass === ASSET_CLASS.crypto;

    const stockProviderNames = [
      SECURITY_PROVIDER.yahoo,
      SECURITY_PROVIDER.fmp,
      SECURITY_PROVIDER.polygon,
      SECURITY_PROVIDER.alphavantage,
    ].filter((providerName) => this.providers.has(providerName));
    const cryptoProviderNames = [SECURITY_PROVIDER.kraken, SECURITY_PROVIDER.coingecko].filter((providerName) =>
      this.providers.has(providerName),
    );

    if (options?.assetClass === ASSET_CLASS.crypto && cryptoProviderNames.length === 0) {
      throw new ServiceUnavailableError({
        code: API_ERROR_CODES.cryptoProviderNotConfigured,
        message: 'Crypto search is unavailable. Configure Kraken or COINGECKO_API_KEY to enable crypto support.',
      });
    }

    // Existing integration tests exercise the fallback chain in isolation.
    // Production defaults to the provider-preserving fan-out below; keeping
    // this branch explicit makes that test mode deterministic without changing
    // the user-facing default.
    if (!this.searchAllProviders) {
      const preference = getSearchProviderPreference();
      const cryptoProvider =
        this.providers.get(SECURITY_PROVIDER.coingecko) ?? this.providers.get(SECURITY_PROVIDER.kraken);

      const stockSearch = stocksRequested
        ? this.executeWithFallback(
            preference.primary,
            preference.fallbacks,
            (provider) => provider.searchSecurities(query, options),
            `search for "${query}"`,
          ).catch((error) => {
            logger.error({ message: `Stock search failed for "${query}"`, error: error as Error });
            return [] as SecuritySearchResult[];
          })
        : Promise.resolve<SecuritySearchResult[]>([]);

      const cryptoSearch =
        cryptoRequested && cryptoProvider
          ? cryptoProvider.searchSecurities(query, options).catch((error) => {
              logger.error({ message: `Crypto search failed for "${query}"`, error: error as Error });
              return [] as SecuritySearchResult[];
            })
          : Promise.resolve<SecuritySearchResult[]>([]);

      const [rawStockResults, cryptoResults] = await Promise.all([stockSearch, cryptoSearch]);
      return [...rawStockResults.filter((result) => result.assetClass !== ASSET_CLASS.crypto), ...cryptoResults];
    }

    const providerNames = [
      ...(stocksRequested ? stockProviderNames : []),
      ...(cryptoRequested ? cryptoProviderNames : []),
    ];
    const searches = providerNames.map(async (providerName) => {
      const provider = this.providers.get(providerName)!;
      try {
        return await provider.searchSecurities(query, options);
      } catch (error) {
        logger.info(
          `Security search failed for ${providerName}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return [] as SecuritySearchResult[];
      }
    });

    const results = await Promise.all(searches);
    const seenProviderSymbols = new Set<string>();

    return results.flatMap((providerResults, index) => {
      const providerName = providerNames[index]!;
      const isStockProvider = stockProviderNames.includes(providerName);

      return providerResults
        .filter((result) => !isStockProvider || result.assetClass !== ASSET_CLASS.crypto)
        .filter((result) => {
          const key = `${result.providerName}:${result.providerSymbol}`;
          if (seenProviderSymbols.has(key)) return false;
          seenProviderSymbols.add(key);
          return true;
        });
    });
  }

  /**
   * Routes provider-bound prices to their catalog source. Unbound securities
   * retain the existing asset-class and region-based fallback rules.
   */
  public async getLatestPrice(providerSymbol: ProviderSymbol, options?: HistoricalPriceOptions): Promise<PriceData> {
    const providerName = options?.providerName;
    if (providerName && providerName !== SECURITY_PROVIDER.composite && this.providers.has(providerName)) {
      return this.providers.get(providerName)!.getLatestPrice(providerSymbol);
    }

    const preference = getLatestPriceProviderPreference(providerSymbol, options?.assetClass);

    return this.executeWithFallback(
      preference.primary,
      preference.fallbacks,
      (provider) => provider.getLatestPrice(providerSymbol),
      `latest price for ${providerSymbol}`,
    );
  }

  /**
   * Routes historical price requests using assetClass when provided. For
   * crypto, only CoinGecko is queried; for stocks the existing region-based
   * fallback chain still applies.
   */
  public async getHistoricalPrices(
    providerSymbol: ProviderSymbol,
    options?: HistoricalPriceOptions,
  ): Promise<PriceData[]> {
    const providerName = options?.providerName;
    const preference =
      providerName && providerName !== SECURITY_PROVIDER.composite && this.providers.has(providerName)
        ? { primary: providerName, fallbacks: [] }
        : getHistoricalPriceProviderPreference(providerSymbol, options?.assetClass);

    const result = await this.executeWithFallback(
      preference.primary,
      preference.fallbacks,
      async (provider): Promise<PriceData[]> => {
        const prices = await provider.getHistoricalPrices(providerSymbol, options);
        // Add the actual provider information to each price data point
        return prices.map((price) => ({
          ...price,
          providerName: provider.providerName,
        }));
      },
      `historical prices for ${providerSymbol}`,
    );

    return result;
  }

  /**
   * Routes bulk price fetching to the best provider for each symbol.
   * Phase 1: Fetch from primary providers. Phase 2: Retry failed symbols with fallbacks.
   */
  public async fetchPricesForSecurities(
    securities: SecurityPriceFetchInput[],
    forDate: Date,
    options?: BulkPriceFetchOptions,
  ): Promise<Map<string, BulkPriceData[]>> {
    const securitiesByProvider = this.groupSecuritiesByProvider(securities);

    const allResults = new Map<string, BulkPriceData[]>();
    const failedSecurities: SecurityPriceFetchInput[] = [];

    // Phase 1: Fetch from primary providers concurrently
    const fetchPromises = Array.from(securitiesByProvider.entries()).map(async ([providerName, securityList]) => {
      const provider = this.providers.get(providerName);
      if (!provider) {
        logger.info(`Provider ${providerName} not available, skipping ${securityList.length} symbols`);
        return { fetched: new Map<string, BulkPriceData[]>(), failed: securityList };
      }

      try {
        logger.info(`Fetching prices for ${securityList.length} symbols from ${providerName}`);
        const res = await provider.fetchPricesForSecurities(securityList, forDate, options);
        const failed = securityList.filter((s) => !res.has(s.securityId));
        return { fetched: res, failed };
      } catch (error) {
        logger.error({ message: `Provider ${providerName} failed for bulk fetch:`, error: error as Error });
        return { fetched: new Map<string, BulkPriceData[]>(), failed: securityList };
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const { fetched, failed } of results) {
      for (const [id, price] of fetched) allResults.set(id, price);
      failedSecurities.push(...failed);
    }

    // Phase 2: Retry failed symbols with fallback providers
    if (failedSecurities.length > 0) {
      logger.info(
        `${failedSecurities.length} symbols failed primary provider, attempting fallbacks: ${failedSecurities.map((s) => s.symbol).join(', ')}`,
      );

      // Do not log the securities that stay absent from `allResults`. The only
      // caller (daily-sync) groups them by market status, logs them, and updates
      // `pricingLastSyncedAt`. A second record here sends the same data to
      // Sentry two times.
      for (const security of failedSecurities) {
        const preference =
          security.providerName && this.providers.has(security.providerName)
            ? { primary: security.providerName, fallbacks: [] }
            : getHistoricalPriceProviderPreference(security.symbol, security.assetClass);
        // Skip the primary (already failed) and try only fallback providers
        const fallbackNames = preference.fallbacks.filter((f) => f !== preference.primary);

        for (const fallbackName of fallbackNames) {
          const fallbackProvider = this.providers.get(fallbackName);
          if (!fallbackProvider) continue;

          try {
            const prices = await fallbackProvider.fetchPricesForSecurities([security], forDate, options);
            const price = prices.get(security.securityId);
            if (price && price.length > 0) {
              allResults.set(security.securityId, price);
              logger.info(`Fallback ${fallbackName} succeeded for ${security.symbol}`);
              break;
            }
          } catch (error) {
            const status = isAxiosError(error) ? error.response?.status : undefined;
            // 404 = provider doesn't carry this symbol; 429 = rate-limited after retries.
            // Both are normal "try the next fallback" cases – keep them out of Sentry.
            const isExpected = status === 404 || status === 429;
            if (isExpected) {
              logger.info(`Fallback ${fallbackName} skipped ${security.symbol} (HTTP ${status})`);
            } else {
              logger.warn('Provider fallback failed unexpectedly', {
                provider: fallbackName,
                symbol: security.symbol,
                httpStatus: status,
                errorName: error instanceof Error ? error.constructor.name : typeof error,
                errorMessage: error instanceof Error ? error.message || '(empty)' : String(error),
              });
            }
          }
        }
      }
    }

    logger.info(
      `Composite provider fetched ${allResults.size}/${securities.length} prices from ${securitiesByProvider.size} providers`,
    );
    return allResults;
  }

  /**
   * Groups securities by their preferred provider for bulk operations
   */
  private groupSecuritiesByProvider(
    securities: SecurityPriceFetchInput[],
  ): Map<SECURITY_PROVIDER, SecurityPriceFetchInput[]> {
    const groups = new Map<SECURITY_PROVIDER, SecurityPriceFetchInput[]>();

    securities.forEach((security) => {
      const preference =
        security.assetClass === ASSET_CLASS.crypto &&
        security.providerName &&
        security.providerName !== SECURITY_PROVIDER.composite &&
        this.providers.has(security.providerName)
          ? { primary: security.providerName, fallbacks: [] }
          : getHistoricalPriceProviderPreference(security.symbol, security.assetClass);
      const providerName = this.findAvailableProvider(preference.primary, preference.fallbacks);

      if (providerName) {
        const list = groups.get(providerName);
        if (list) {
          list.push(security);
        } else {
          groups.set(providerName, [security]);
        }
      } else {
        logger.warn(`No available provider for symbol: ${security.symbol}`);
      }
    });

    return groups;
  }

  /**
   * Executes an operation with fallback logic
   */
  private async executeWithFallback<T>(
    primaryProvider: SECURITY_PROVIDER,
    fallbacks: SECURITY_PROVIDER[],
    operation: (provider: BaseSecurityDataProvider) => Promise<T>,
    operationName: string,
  ): Promise<T> {
    const providers = [primaryProvider, ...fallbacks];

    for (const providerName of providers) {
      const provider = this.providers.get(providerName);

      if (!provider) {
        logger.info(`Provider ${providerName} not available for ${operationName}`);
        continue;
      }

      try {
        logger.info(`Attempting ${operationName} with ${providerName}`);
        const result = await operation(provider);
        logger.info(`Successfully completed ${operationName} with ${providerName}`);
        return result;
      } catch (error) {
        // Exhausted the chain – rethrow without logging. The caller owns the
        // user-facing outcome and logs it once (search swallows to [] and logs;
        // historical/bulk consumers log in their own `.catch`). Logging here too
        // would double-report every genuine total failure in Sentry.
        if (providerName === providers[providers.length - 1]) {
          throw error;
        }

        // A non-final provider failing is the expected, designed-for case – a
        // fallback chain exists precisely so the next provider can take over.
        // Breadcrumb at info (never Sentry); move on.
        logger.info(
          `Provider ${providerName} failed for ${operationName}, trying next: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    throw new Error(`All providers failed for ${operationName}`);
  }

  /**
   * Finds the first available provider from a preference list
   */
  private findAvailableProvider(primary: SECURITY_PROVIDER, fallbacks: SECURITY_PROVIDER[]): SECURITY_PROVIDER | null {
    const candidates = [primary, ...fallbacks];

    for (const candidate of candidates) {
      if (this.providers.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Get status of all configured providers
   */
  public getProviderStatus(): Record<string, boolean> {
    return {
      [SECURITY_PROVIDER.yahoo]: this.providers.has(SECURITY_PROVIDER.yahoo),
      [SECURITY_PROVIDER.fmp]: this.providers.has(SECURITY_PROVIDER.fmp),
      [SECURITY_PROVIDER.polygon]: this.providers.has(SECURITY_PROVIDER.polygon),
      [SECURITY_PROVIDER.alphavantage]: this.providers.has(SECURITY_PROVIDER.alphavantage),
      [SECURITY_PROVIDER.coingecko]: this.providers.has(SECURITY_PROVIDER.coingecko),
      [SECURITY_PROVIDER.kraken]: this.providers.has(SECURITY_PROVIDER.kraken),
    };
  }
}
