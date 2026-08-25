import { addMonths, addDays, endOfMonth, format, parseISO, setDate, startOfMonth, subMonths } from 'date-fns';

const clampStartDay = ({ date, day }: { date: Date; day: number }): Date => {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  return setDate(monthStart, Math.min(day, monthEnd.getDate()));
};

export const periodStartForDate = ({ date, day }: { date: Date | string; day: number }): string => {
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  const current = clampStartDay({ date: parsed, day });
  const currentMonthEnd = endOfMonth(parsed);
  const startsAtEndOfShortMonth = day > currentMonthEnd.getDate() && parsed.getTime() === current.getTime();
  const start =
    parsed < current || startsAtEndOfShortMonth ? clampStartDay({ date: subMonths(parsed, 1), day }) : current;
  return format(start, 'yyyy-MM-dd');
};

export const nextPeriodStart = ({ periodStart, day }: { periodStart: string; day: number }): string =>
  format(clampStartDay({ date: addMonths(parseISO(periodStart), 1), day }), 'yyyy-MM-dd');

export const previousPeriodStart = ({ periodStart, day }: { periodStart: string; day: number }): string =>
  format(clampStartDay({ date: subMonths(parseISO(periodStart), 1), day }), 'yyyy-MM-dd');

export const periodEnd = ({ periodStart, day }: { periodStart: string; day: number }): string =>
  format(addDays(parseISO(nextPeriodStart({ periodStart, day })), -1), 'yyyy-MM-dd');

export const isPeriodStart = ({ periodStart, day }: { periodStart: string; day: number }): boolean =>
  format(clampStartDay({ date: parseISO(periodStart), day }), 'yyyy-MM-dd') === periodStart;
