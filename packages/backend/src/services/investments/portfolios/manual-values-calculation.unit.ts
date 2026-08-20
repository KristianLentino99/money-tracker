import { MANUAL_PORTFOLIO_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';
import Big from 'big.js';

import { calculateManualPortfolioPerformance } from './manual-values-calculation';

describe('manual portfolio performance calculation', () => {
  it('includes contributions recorded before the first valuation', () => {
    const result = calculateManualPortfolioPerformance({
      opening: { date: '2026-08-20', value: new Big('14921') },
      current: new Big('14921'),
      activities: [
        {
          date: '2026-04-14',
          amount: new Big('841.68'),
          category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
        },
        {
          date: '2026-07-13',
          amount: new Big('1200.65'),
          category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
        },
        {
          date: '2026-08-20',
          amount: new Big('10184.20'),
          category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.contribution,
        },
        {
          date: '2026-08-20',
          amount: new Big('40'),
          category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.fee,
        },
        {
          date: '2026-08-20',
          amount: new Big('242.93'),
          category: MANUAL_PORTFOLIO_TRANSACTION_CATEGORY.tax,
        },
      ],
    });

    expect(result.usesOpeningBaseline).toBe(false);
    expect(result.gain?.toFixed(2)).toBe('2694.47');
    expect(result.investedCapital?.toFixed(2)).toBe('12226.53');
  });
});
