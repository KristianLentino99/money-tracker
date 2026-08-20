import { ASSET_CLASS, SECURITY_PROVIDER, type SecuritySearchResultFormatted } from '@bt/shared/types/investments';
import { describe, expect, it } from 'vitest';

import { groupSecuritySearchResults } from './group-security-search-results';

const result = (overrides: Partial<SecuritySearchResultFormatted>): SecuritySearchResultFormatted => ({
  symbol: 'AAPL',
  providerSymbol: 'AAPL',
  name: 'Apple Inc.',
  assetClass: ASSET_CLASS.stocks,
  providerName: SECURITY_PROVIDER.yahoo,
  currencyCode: 'USD',
  ...overrides,
});

describe('groupSecuritySearchResults', () => {
  it('preserves cross-provider duplicates and removes same-provider duplicates', () => {
    const groups = groupSecuritySearchResults({
      results: [
        result({ providerName: SECURITY_PROVIDER.coingecko, providerSymbol: 'apple' }),
        result({ providerName: SECURITY_PROVIDER.yahoo }),
        result({ providerName: SECURITY_PROVIDER.yahoo }),
        result({ providerName: SECURITY_PROVIDER.kraken, providerSymbol: 'XXBTZUSD', symbol: 'BTC-USD' }),
      ],
    });

    expect(groups.map((group) => group.provider)).toEqual([
      SECURITY_PROVIDER.yahoo,
      SECURITY_PROVIDER.kraken,
      SECURITY_PROVIDER.coingecko,
    ]);
    expect(groups.find((group) => group.provider === SECURITY_PROVIDER.yahoo)?.results).toHaveLength(1);
    expect(groups.find((group) => group.provider === SECURITY_PROVIDER.coingecko)?.results).toHaveLength(1);
  });
});
