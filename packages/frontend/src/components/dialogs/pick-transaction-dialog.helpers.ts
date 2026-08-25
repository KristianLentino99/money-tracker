import { FILTER_OPERATION, type TRANSACTION_TYPES } from '@bt/shared/types';
import { endOfDay, isSameDay, parseISO, startOfDay } from 'date-fns';

export const getPickTransactionGridClass = ({ isMobile }: { isMobile: boolean }): string =>
  isMobile ? 'grid-cols-1' : 'grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]';

export const buildPickTransactionStaticFilters = ({
  transactionDate,
  transactionType,
}: {
  transactionDate?: string;
  transactionType?: TRANSACTION_TYPES;
}) => {
  const date = transactionDate ? parseISO(transactionDate) : null;

  return {
    transferFilter: FILTER_OPERATION.exclude,
    ...(transactionType !== undefined ? { transactionType } : {}),
    ...(date && !Number.isNaN(date.getTime())
      ? {
          start: startOfDay(date),
          end: endOfDay(date),
        }
      : {}),
  };
};

export const isTransactionOnDate = ({
  transactionTime,
  transactionDate,
}: {
  transactionTime: Date | string;
  transactionDate: string;
}): boolean => isSameDay(new Date(transactionTime), parseISO(transactionDate));
