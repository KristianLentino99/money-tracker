import { FILTER_OPERATION, TRANSACTION_TYPES } from '@bt/shared/types';
import { endOfDay, parseISO, startOfDay } from 'date-fns';

import {
  buildPickTransactionStaticFilters,
  getPickTransactionGridClass,
  isTransactionOnDate,
} from './pick-transaction-dialog.helpers';

describe('pick transaction dialog helpers', () => {
  it('uses a bounded desktop filter column so the transaction list keeps space', () => {
    expect(getPickTransactionGridClass({ isMobile: false })).toBe('grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]');
  });

  it('limits payment linking to the expected period date and transaction type', () => {
    const date = parseISO('2026-08-25');

    expect(
      buildPickTransactionStaticFilters({
        transactionDate: '2026-08-25',
        transactionType: TRANSACTION_TYPES.expense,
      }),
    ).toEqual({
      transferFilter: FILTER_OPERATION.exclude,
      transactionType: TRANSACTION_TYPES.expense,
      start: startOfDay(date),
      end: endOfDay(date),
    });
  });

  it('recognizes transactions recorded on the expected calendar date', () => {
    expect(
      isTransactionOnDate({
        transactionTime: '2026-08-25T21:00:00.000Z',
        transactionDate: '2026-08-25',
      }),
    ).toBe(true);
    expect(
      isTransactionOnDate({
        transactionTime: '2026-08-26T00:00:00.000Z',
        transactionDate: '2026-08-25',
      }),
    ).toBe(false);
  });
});
