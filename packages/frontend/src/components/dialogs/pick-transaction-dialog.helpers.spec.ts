import { FILTER_OPERATION, TRANSACTION_TYPES } from '@bt/shared/types';

import { buildPickTransactionStaticFilters, getPickTransactionGridClass } from './pick-transaction-dialog.helpers';

describe('pick transaction dialog helpers', () => {
  it('uses a bounded desktop filter column so the transaction list keeps space', () => {
    expect(getPickTransactionGridClass({ isMobile: false })).toBe('grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]');
  });

  it('keeps the picker searchable while limiting it to real transactions of the requested type', () => {
    expect(
      buildPickTransactionStaticFilters({
        excludePlanned: true,
        transactionType: TRANSACTION_TYPES.expense,
      }),
    ).toEqual({
      transferFilter: FILTER_OPERATION.exclude,
      plannedFilter: FILTER_OPERATION.exclude,
      transactionType: TRANSACTION_TYPES.expense,
    });
  });
});
