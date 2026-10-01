import { uploadTransactionAttachment } from '@/api/attachments';
import type { CurrencyModel } from '@bt/shared/types';
import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UI_FORM_STRUCT } from '../types';
import {
  buildInvestmentContributionPayload,
  isInvestmentContributionFormValid,
  uploadPendingTransactionAttachments,
} from './use-submit-transaction';

vi.mock('@/api/attachments', () => ({ uploadTransactionAttachment: vi.fn() }));

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

describe('pending creation attachment uploads', () => {
  beforeEach(() => vi.mocked(uploadTransactionAttachment).mockReset());

  it('uploads to the contribution transaction returned by creation', async () => {
    const file = { name: 'receipt.pdf' } as File;
    vi.mocked(uploadTransactionAttachment).mockResolvedValue({} as never);
    const onError = vi.fn();

    expect(
      await uploadPendingTransactionAttachments({ transactionIds: ['contribution-tx'], files: [file], onError }),
    ).toBe(false);
    expect(uploadTransactionAttachment).toHaveBeenCalledWith({ transactionId: 'contribution-tx', file });
    expect(onError).not.toHaveBeenCalled();
  });

  it('continues uploading the other transfer leg after a failure and reports partial failure', async () => {
    const file = { name: 'receipt.pdf' } as File;
    const error = new Error('upload failed');
    vi.mocked(uploadTransactionAttachment)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({} as never);
    const onError = vi.fn();

    expect(
      await uploadPendingTransactionAttachments({
        transactionIds: ['source-tx', 'destination-tx'],
        files: [file],
        onError,
      }),
    ).toBe(true);
    expect(uploadTransactionAttachment).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
