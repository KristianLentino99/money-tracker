import { addMonths, parseISO } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { computeLoanScheduleSnapshot, getLoanEndDate } from './loan-amortization';

describe('computeLoanScheduleSnapshot', () => {
  it('projects the outstanding balance and end date from a new term', () => {
    const result = computeLoanScheduleSnapshot({
      originalPrincipal: 1_000,
      interestRate: 12,
      termMonths: 24,
      startDate: parseISO('2024-01-15'),
      asOfDate: parseISO('2024-04-15'),
    });

    expect(result.outstandingBalance).toBe(887.67);
    expect(result.endDate).toEqual(addMonths(parseISO('2024-01-15'), 24));
  });

  it('returns no snapshot when the term cannot define an amortization schedule', () => {
    expect(
      computeLoanScheduleSnapshot({
        originalPrincipal: 1_000,
        interestRate: 12,
        termMonths: 0,
        startDate: parseISO('2024-01-15'),
        asOfDate: parseISO('2024-04-15'),
      }),
    ).toBeNull();
  });

  it('does not derive an end date when the loan has no term', () => {
    expect(getLoanEndDate({ startDate: parseISO('2024-01-15'), termMonths: null })).toBeNull();
  });

  it('clears the scheduled balance at the contractual end date', () => {
    const result = computeLoanScheduleSnapshot({
      originalPrincipal: 100,
      interestRate: 0,
      termMonths: 3,
      startDate: parseISO('2024-01-15'),
      asOfDate: parseISO('2024-04-15'),
    });

    expect(result?.outstandingBalance).toBe(0);
  });
});
