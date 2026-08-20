import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { describe, expect, it, jest } from '@jest/globals';
import type { AxiosInstance } from 'axios';

import { toProviderSymbol } from './base-provider';
import { KrakenDataProvider } from './kraken-provider';

type MockGet = (url: string, config?: unknown) => Promise<{ data: unknown }>;

describe('KrakenDataProvider', () => {
  it('loads online fiat-quoted markets and normalizes legacy asset codes', async () => {
    const get = jest.fn<MockGet>();
    get.mockResolvedValueOnce({
      data: {
        result: {
          XXBTZUSD: { wsname: 'XBT/USD', status: 'online' },
          XETHZEUR: { wsname: 'ETH/EUR', status: 'online' },
          XXBTZUSDT: { wsname: 'XBT/USDT', status: 'online' },
          XXBTZGBP: { wsname: 'XBT/GBP', status: 'cancelled' },
        },
      },
    });

    const provider = new KrakenDataProvider({
      httpClient: { get } as unknown as Pick<AxiosInstance, 'get'>,
    });

    const results = await provider.searchSecurities('BTC');

    expect(results).toEqual([
      expect.objectContaining({
        symbol: 'BTC-USD',
        providerSymbol: 'XXBTZUSD',
        providerName: SECURITY_PROVIDER.kraken,
        assetClass: ASSET_CLASS.crypto,
        currencyCode: 'USD',
        cryptoCurrencyCode: 'BTC',
      }),
    ]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('converts daily OHLC candles into provider-tagged prices', async () => {
    const get = jest.fn<MockGet>();
    get.mockResolvedValueOnce({
      data: {
        result: {
          XXBTZUSD: [[Date.parse('2026-01-02T00:00:00Z') / 1000, '1', '2', '0.5', '123.45', '10', '20', '1']],
          last: 0,
        },
      },
    });

    const provider = new KrakenDataProvider({
      httpClient: { get } as unknown as Pick<AxiosInstance, 'get'>,
    });
    const prices = await provider.getHistoricalPrices(toProviderSymbol('XXBTZUSD'), {
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-01-03T00:00:00Z'),
    });

    expect(prices).toEqual([
      expect.objectContaining({
        providerSymbol: 'XXBTZUSD',
        providerName: SECURITY_PROVIDER.kraken,
        priceClose: 123.45,
        date: new Date('2026-01-02T00:00:00Z'),
      }),
    ]);
    expect(get).toHaveBeenCalledWith(
      'https://api.kraken.com/0/public/OHLC',
      expect.objectContaining({ params: expect.objectContaining({ pair: 'XXBTZUSD', interval: 1440 }) }),
    );
  });
});
