import { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { sleep } from '@common/helpers';
import { logger } from '@js/utils';
import axios, { type AxiosInstance } from 'axios';
import { addDays, subDays } from 'date-fns';

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

const KRAKEN_ASSET_PAIRS_URL = 'https://api.kraken.com/0/public/AssetPairs';
const KRAKEN_OHLC_URL = 'https://api.kraken.com/0/public/OHLC';
const KRAKEN_DAILY_INTERVAL_MINUTES = 1440;
const KRAKEN_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const KRAKEN_SEARCH_LIMIT = 20;
const KRAKEN_REQUEST_DELAY_MS = 150;

// These are the fiat quote currencies exposed by DcaPal's Kraken catalog
// fallback and are also valid three-letter currencies in Money Tracker.
const SUPPORTED_QUOTE_CURRENCIES = new Set(['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'USD']);

const LEGACY_KRAKEN_ASSET_CODES: Record<string, string> = {
  XBT: 'BTC',
  XXBT: 'BTC',
  XDG: 'DOGE',
  XXDG: 'DOGE',
  XETH: 'ETH',
  ZUSD: 'USD',
  ZEUR: 'EUR',
  ZGBP: 'GBP',
  ZJPY: 'JPY',
  ZCAD: 'CAD',
  ZAUD: 'AUD',
};

type KrakenAssetPair = {
  wsname?: string;
  altname?: string;
  base?: string;
  quote?: string;
  status?: string;
};

type KrakenAssetPairsResponse = {
  error?: string[];
  result?: Record<string, KrakenAssetPair>;
};

type KrakenOhlcResponse = {
  error?: string[];
  result?: Record<string, unknown>;
};

type KrakenHttpClient = Pick<AxiosInstance, 'get'>;

type KrakenCatalogEntry = {
  providerSymbol: string;
  altname: string | undefined;
  symbol: string;
  pair: string;
  base: string;
  quote: string;
  name: string;
};

const normalizeAssetCode = (code: string): string => {
  const normalized = code.trim().toUpperCase();
  return LEGACY_KRAKEN_ASSET_CODES[normalized] ?? normalized;
};

const parseMarketPair = ({
  providerSymbol,
  pair,
}: {
  providerSymbol: string;
  pair: KrakenAssetPair;
}): KrakenCatalogEntry | null => {
  const rawPair = pair.wsname ?? [pair.base, pair.quote].filter(Boolean).join('/');
  const [rawBase, rawQuote] = rawPair.split('/');
  if (!rawBase || !rawQuote) return null;

  const base = normalizeAssetCode(rawBase);
  const quote = normalizeAssetCode(rawQuote);
  if (!SUPPORTED_QUOTE_CURRENCIES.has(quote)) return null;

  return {
    providerSymbol,
    altname: pair.altname,
    symbol: `${base}-${quote}`,
    pair: `${base}/${quote}`,
    base,
    quote,
    name: `${base}/${quote} market on Kraken`,
  };
};

const toFiniteNumber = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

const toUnixSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

const normalizeQuery = (query: string): string => query.trim().toUpperCase();
const compactPair = (value: string): string => value.replace(/[\s/_-]/g, '').toUpperCase();

export class KrakenDataProvider extends BaseSecurityDataProvider {
  readonly providerName = SECURITY_PROVIDER.kraken;

  private readonly httpClient: KrakenHttpClient;
  private catalog: KrakenCatalogEntry[] | null = null;
  private catalogFetchedAt = 0;
  private catalogRequest: Promise<KrakenCatalogEntry[]> | null = null;

  constructor({ httpClient = axios }: { httpClient?: KrakenHttpClient } = {}) {
    super();
    this.httpClient = httpClient;
  }

  public async searchSecurities(query: string, _options?: SearchOptions): Promise<SecuritySearchResult[]> {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) return [];

    try {
      const catalog = await this.getCatalog();
      const compactQuery = compactPair(normalizedQuery);

      return catalog
        .filter((entry) => {
          const exact = [entry.symbol, entry.pair, entry.base, entry.providerSymbol, entry.altname ?? ''].some(
            (value) => value.toUpperCase() === normalizedQuery || compactPair(value) === compactQuery,
          );
          const partial = [
            entry.symbol,
            entry.pair,
            entry.base,
            entry.quote,
            entry.name,
            entry.providerSymbol,
            entry.altname ?? '',
          ].some((value) => value.toUpperCase().includes(normalizedQuery));
          return exact || partial;
        })
        .map((entry) => {
          const exact = [entry.symbol, entry.pair, entry.base, entry.providerSymbol, entry.altname ?? ''].some(
            (value) => value.toUpperCase() === normalizedQuery || compactPair(value) === compactQuery,
          );

          return {
            symbol: entry.symbol,
            providerSymbol: entry.providerSymbol,
            name: entry.name,
            assetClass: ASSET_CLASS.crypto,
            providerName: this.providerName,
            exchangeName: 'Kraken',
            exchangeAcronym: 'KRAKEN',
            exchangeMic: undefined,
            currencyCode: entry.quote,
            cryptoCurrencyCode: entry.base,
            cusip: undefined,
            isin: undefined,
            matchType: exact ? ('exact' as const) : ('partial' as const),
          } satisfies SecuritySearchResult;
        })
        .toSorted(
          (a, b) =>
            Number(b.matchType === 'exact') - Number(a.matchType === 'exact') || a.symbol.localeCompare(b.symbol),
        )
        .slice(0, KRAKEN_SEARCH_LIMIT);
    } catch (error) {
      throw this.formatProviderError({ operation: 'Kraken market search failed', error });
    }
  }

  public async getLatestPrice(providerSymbol: ProviderSymbol): Promise<PriceData> {
    try {
      const prices = await this.getHistoricalPrices(providerSymbol, {
        startDate: subDays(new Date(), 3),
        endDate: new Date(),
      });
      const latest = prices.at(-1);
      if (!latest) throw new Error(`No OHLC data found for market: ${providerSymbol}`);
      return latest;
    } catch (error) {
      throw this.formatProviderError({ operation: `Failed to fetch latest Kraken price for ${providerSymbol}`, error });
    }
  }

  public async getHistoricalPrices(
    providerSymbol: ProviderSymbol,
    options?: HistoricalPriceOptions,
  ): Promise<PriceData[]> {
    try {
      const endDate = options?.endDate ?? new Date();
      const startDate = options?.startDate ?? subDays(endDate, 365);
      const response = await this.httpClient.get<KrakenOhlcResponse>(KRAKEN_OHLC_URL, {
        params: {
          pair: providerSymbol,
          interval: KRAKEN_DAILY_INTERVAL_MINUTES,
          since: toUnixSeconds(startDate),
        },
      });

      if (response.data.error && response.data.error.length > 0) {
        throw new Error(response.data.error.join(', '));
      }

      const candles = Object.entries(response.data.result ?? {}).find(
        ([key, value]) => key !== 'last' && Array.isArray(value),
      )?.[1];
      if (!Array.isArray(candles)) return [];

      return candles
        .map((candle): PriceData | null => {
          if (!Array.isArray(candle)) return null;
          const timestamp = toFiniteNumber(candle[0]);
          const priceClose = toFiniteNumber(candle[4]);
          if (timestamp === null || priceClose === null) return null;

          const date = new Date(timestamp * 1000);
          if (date < startDate || date > endDate) return null;
          return {
            providerSymbol,
            date,
            priceClose,
            priceAsOf: date,
            providerName: this.providerName,
          };
        })
        .filter((price): price is PriceData => price !== null)
        .toSorted((a, b) => a.date.getTime() - b.date.getTime());
    } catch (error) {
      throw this.formatProviderError({ operation: `Failed to fetch Kraken history for ${providerSymbol}`, error });
    }
  }

  public async fetchPricesForSecurities(
    securities: SecurityPriceFetchInput[],
    forDate: Date,
    options?: BulkPriceFetchOptions,
  ): Promise<Map<string, BulkPriceData[]>> {
    const result = new Map<string, BulkPriceData[]>();
    const endDate = addDays(forDate, 1);

    for (const security of securities) {
      try {
        if (result.size > 0) await sleep({ ms: KRAKEN_REQUEST_DELAY_MS });
        const prices = await this.getHistoricalPrices(security.providerSymbol, {
          startDate: options?.startDate ?? forDate,
          endDate,
        });
        if (prices.length > 0) {
          result.set(
            security.securityId,
            prices.map((price) => ({ ...price, securityId: security.securityId })),
          );
        }
      } catch (error) {
        logger.info(
          `Failed to fetch Kraken price for ${security.symbol}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  }

  private async getCatalog(): Promise<KrakenCatalogEntry[]> {
    if (this.catalog && Date.now() - this.catalogFetchedAt < KRAKEN_CATALOG_TTL_MS) return this.catalog;
    if (this.catalogRequest) return this.catalogRequest;

    this.catalogRequest = this.fetchCatalog().finally(() => {
      this.catalogRequest = null;
    });
    return this.catalogRequest;
  }

  private async fetchCatalog(): Promise<KrakenCatalogEntry[]> {
    logger.info('Fetching online Kraken market catalog');
    const response = await this.httpClient.get<KrakenAssetPairsResponse>(KRAKEN_ASSET_PAIRS_URL);
    if (response.data.error && response.data.error.length > 0) {
      throw new Error(response.data.error.join(', '));
    }

    const catalog = Object.entries(response.data.result ?? {})
      .filter(([, pair]) => pair.status === 'online')
      .map(([providerSymbol, pair]) => parseMarketPair({ providerSymbol, pair }))
      .filter((entry): entry is KrakenCatalogEntry => entry !== null);

    this.catalog = catalog;
    this.catalogFetchedAt = Date.now();
    logger.info(`Kraken market catalog contains ${catalog.length} supported online pairs`);
    return catalog;
  }
}
