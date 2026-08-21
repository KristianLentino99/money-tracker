import { describe, expect, it } from '@jest/globals';

import { isPeriodStart, nextPeriodStart, periodEnd, periodStartForDate, previousPeriodStart } from './plan-periods';

describe('Plan periods', () => {
  it('clamps a day-31 period to February and assigns the first days to the previous period', () => {
    expect(periodStartForDate({ date: '2026-02-28', day: 31 })).toBe('2026-01-31');
    expect(periodStartForDate({ date: '2026-03-01', day: 31 })).toBe('2026-02-28');
    expect(isPeriodStart({ periodStart: '2026-02-28', day: 31 })).toBe(true);
  });

  it('returns the correct adjacent periods and period end across a short month', () => {
    expect(previousPeriodStart({ periodStart: '2026-03-31', day: 31 })).toBe('2026-02-28');
    expect(nextPeriodStart({ periodStart: '2026-02-28', day: 31 })).toBe('2026-03-31');
    expect(periodEnd({ periodStart: '2026-02-28', day: 31 })).toBe('2026-03-30');
  });

  it('rejects dates that are not normalized period starts', () => {
    expect(isPeriodStart({ periodStart: '2026-02-27', day: 31 })).toBe(false);
    expect(isPeriodStart({ periodStart: '2026-03-30', day: 31 })).toBe(false);
  });
});
