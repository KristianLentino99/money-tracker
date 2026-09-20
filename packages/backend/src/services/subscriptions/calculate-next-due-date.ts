import { SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
interface CalculateNextDueDateParams {
  currentDueDate: string;
  frequency: SUBSCRIPTION_FREQUENCIES;
  anchorDay: number;
}

/**
 * Calculates the next due date based on frequency and anchor day.
 * Handles month-end clamping: if anchor is 31 but month only has 28 days,
 * clamps to 28. When a month with 31 days comes back, returns to 31.
 */
export function calculateNextDueDate({ currentDueDate, frequency, anchorDay }: CalculateNextDueDateParams): string {
  const current = new Date(currentDueDate + 'T00:00:00Z');

  switch (frequency) {
    case SUBSCRIPTION_FREQUENCIES.weekly:
      return formatDate(addUtcDays({ date: current, days: 7 }));

    case SUBSCRIPTION_FREQUENCIES.biweekly:
      return formatDate(addUtcDays({ date: current, days: 14 }));

    case SUBSCRIPTION_FREQUENCIES.monthly:
      return addMonthsClamped({ date: current, months: 1, anchorDay });

    case SUBSCRIPTION_FREQUENCIES.quarterly:
      return addMonthsClamped({ date: current, months: 3, anchorDay });

    case SUBSCRIPTION_FREQUENCIES.semiAnnual:
      return addMonthsClamped({ date: current, months: 6, anchorDay });

    case SUBSCRIPTION_FREQUENCIES.annual:
      return addMonthsClamped({ date: current, months: 12, anchorDay });

    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
}

// Due dates are UTC-midnight calendar days, so all arithmetic stays in UTC. date-fns helpers
// work in host local time and shift the day on non-UTC servers.
function addUtcDays({ date, days }: { date: Date; days: number }): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function addMonthsClamped({ date, months, anchorDay }: { date: Date; months: number; anchorDay: number }): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  // Day 0 of the following month is the last day of the target month
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(year, month, Math.min(anchorDay, daysInMonth))));
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}
