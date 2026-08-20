import { SECURITY_PROVIDER, type SecuritySearchResultFormatted } from '@bt/shared/types/investments';

const PROVIDER_ORDER: SECURITY_PROVIDER[] = [
  SECURITY_PROVIDER.yahoo,
  SECURITY_PROVIDER.fmp,
  SECURITY_PROVIDER.polygon,
  SECURITY_PROVIDER.alphavantage,
  SECURITY_PROVIDER.kraken,
  SECURITY_PROVIDER.coingecko,
];

export interface SecuritySearchResultGroup {
  provider: SECURITY_PROVIDER;
  results: SecuritySearchResultFormatted[];
}

/**
 * Keeps cross-provider matches visible while removing duplicate rows emitted
 * by one provider. Provider order is stable and makes the UI predictable.
 */
export function groupSecuritySearchResults({
  results,
}: {
  results: SecuritySearchResultFormatted[];
}): SecuritySearchResultGroup[] {
  const groups = new Map<SECURITY_PROVIDER, SecuritySearchResultFormatted[]>();
  const seen = new Set<string>();

  for (const result of results) {
    const key = `${result.providerName}:${result.providerSymbol}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const providerResults = groups.get(result.providerName);
    if (providerResults) providerResults.push(result);
    else groups.set(result.providerName, [result]);
  }

  const orderedProviders = [
    ...PROVIDER_ORDER,
    ...Array.from(groups.keys()).filter((provider) => !PROVIDER_ORDER.includes(provider)),
  ];

  return orderedProviders.flatMap((provider) => {
    const providerResults = groups.get(provider);
    return providerResults ? [{ provider, results: providerResults }] : [];
  });
}
