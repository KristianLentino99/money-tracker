import type { CurrencyModel } from '@bt/shared/types';
import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { describe, expect, it } from 'vitest';

import type { UI_FORM_STRUCT } from '../types';
import { buildInvestmentContributionPayload, isInvestmentContributionFormValid } from './use-submit-transaction';

const searchResult = {
  symbol: 'AAA',
  providerSymbol: 'AAA',
  priceSourceSymbol: null,
  name: 'Alpha ETF',
  assetClass: ASSET_CLASS.stocks,
  providerName: SECURITY_PROVIDER.fmp,
  exchangeAcronym: 'NASDAQ',
  exchangeMic: 'XNAS',
  exchangeName: 'NASDAQ',
  currencyCode: 'USD',
  cryptoCurrencyCode: undefined,
  cusip: undefined,
  isin: undefined,
  logoUrl: null,
};

type PurchaseForm = NonNullable<UI_FORM_STRUCT['investmentContribution']>['purchases'][number];

const validForm = (purchase: PurchaseForm): UI_FORM_STRUCT =>
  ({
    amount: 100,
    account: { id: 'account-id' },
    category: { id: 'category-id' },
    investmentContribution: {
      portfolio: { id: 'portfolio-id', name: 'Portfolio' },
      purchases: [purchase],
    },
  }) as UI_FORM_STRUCT;

describe('investment contribution submission helpers', () => {
  it('builds a new-security payload from a search result and keeps cross-currency settlement fees', () => {
    const form = validForm({
      searchResult,
      quantity: '2',
      price: '100',
      fees: '0',
      date: new Date('2026-09-10T00:00:00.000Z'),
      settlementCurrency: { code: 'EUR' } as CurrencyModel,
      settlementAmount: '185',
      settlementFees: '2',
    });

    expect(buildInvestmentContributionPayload({ form })).toMatchObject({
      purchases: [
        {
          searchResult,
          quantity: '2',
          price: '100',
          settlementCurrencyCode: 'EUR',
          settlementAmount: '185',
          settlementFees: '2',
        },
      ],
    });
  });

  it('omits settlement fees when settlement uses the security currency', () => {
    const form = validForm({
      securityId: 'security-id',
      securityLabel: { symbol: 'AAA', name: 'Alpha ETF', currencyCode: 'USD' },
      searchResult: null,
      quantity: '1',
      price: '100',
      fees: '1',
      date: new Date('2026-09-10T00:00:00.000Z'),
      settlementCurrency: { code: 'USD' } as CurrencyModel,
      settlementAmount: '101',
      settlementFees: '1',
    });

    const payload = buildInvestmentContributionPayload({ form });
    expect(payload).not.toBeNull();
    expect(payload!.purchases[0]).not.toHaveProperty('settlementFees');
  });

  it('rejects incomplete purchase rows before submitting', () => {
    const form = validForm({
      searchResult: null,
      quantity: '',
      price: '100',
      fees: '0',
      date: new Date('2026-09-10T00:00:00.000Z'),
      settlementCurrency: null,
      settlementAmount: '',
      settlementFees: '0',
    });

    expect(isInvestmentContributionFormValid({ form })).toBe(false);
  });
});
