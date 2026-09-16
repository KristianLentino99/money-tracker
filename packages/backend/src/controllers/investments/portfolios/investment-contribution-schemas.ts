import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import type { SecuritySearchResult } from '@bt/shared/types/investments';
import { currencyCode, dateString, numericString, recordId } from '@common/lib/zod/custom-types';
import { z } from 'zod';

export const securitySearchResultSchema: z.ZodType<SecuritySearchResult> = z.object({
  symbol: z.string(),
  providerSymbol: z.string(),
  priceSourceSymbol: z.string().trim().min(1).max(255).nullable().optional(),
  name: z.string(),
  assetClass: z.nativeEnum(ASSET_CLASS),
  providerName: z.nativeEnum(SECURITY_PROVIDER),
  exchangeAcronym: z.string().optional(),
  exchangeMic: z.string().optional(),
  exchangeName: z.string().optional(),
  currencyCode: currencyCode(),
  cryptoCurrencyCode: z.string().optional(),
  cusip: z.string().optional(),
  isin: z.string().optional(),
  logoUrl: z.string().nullable().optional(),
  matchType: z.enum(['exact', 'partial']).optional(),
  marketCapRank: z.number().nullable().optional(),
});

export const investmentContributionPurchaseSchema = z
  .object({
    quantity: numericString(),
    price: numericString({ allowZero: true }),
    fees: numericString({ allowZero: true }).optional().default('0'),
    date: z.union([dateString(), z.string().datetime({ offset: true })]),
    name: z.string().max(2000).optional(),
    settlementCurrencyCode: currencyCode().optional(),
    settlementAmount: numericString({ allowZero: true }).optional(),
    settlementFees: numericString({ allowZero: true }).optional(),
    settlementRate: numericString().optional(),
  })
  .and(
    z.union([
      z.object({ securityId: recordId(), searchResult: z.undefined() }),
      z.object({ securityId: z.undefined(), searchResult: securitySearchResultSchema }),
    ]),
  )
  .refine((purchase) => purchase.settlementCurrencyCode === undefined || purchase.settlementAmount !== undefined, {
    message: 'settlementAmount is required when settlementCurrencyCode is provided.',
  })
  .refine((purchase) => purchase.settlementAmount === undefined || purchase.settlementCurrencyCode !== undefined, {
    message: 'settlementCurrencyCode is required when settlementAmount is provided.',
  })
  .refine((purchase) => purchase.settlementRate === undefined || purchase.settlementCurrencyCode !== undefined, {
    message: 'settlementCurrencyCode is required when settlementRate is provided.',
  })
  .refine((purchase) => !(purchase.settlementFees !== undefined && purchase.settlementRate !== undefined), {
    message: 'Provide either settlementFees or settlementRate, not both.',
  });
