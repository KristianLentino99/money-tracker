import { FILTER_OPERATION, type TRANSACTION_TYPES } from '@bt/shared/types';

export const getPickTransactionGridClass = ({ isMobile }: { isMobile: boolean }): string =>
  isMobile ? 'grid-cols-1' : 'grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]';

export const buildPickTransactionStaticFilters = ({
  excludePlanned = false,
  transactionType,
}: {
  excludePlanned?: boolean;
  transactionType?: TRANSACTION_TYPES;
}) => {
  return {
    transferFilter: FILTER_OPERATION.exclude,
    ...(excludePlanned ? { plannedFilter: FILTER_OPERATION.exclude } : {}),
    ...(transactionType !== undefined ? { transactionType } : {}),
  };
};
