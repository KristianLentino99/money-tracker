import type { RecordId } from '@bt/shared/types';
import type Transactions from '@models/transactions.model';

export interface EligibleMaintenanceTransactionApiResponse {
  id: RecordId;
  date: string;
  amount: number;
  refAmount: number;
  note: string | null;
  account: {
    id: RecordId;
    name: string;
  };
  category: {
    id: RecordId;
    name: string;
  } | null;
  payee: {
    id: RecordId;
    name: string;
  } | null;
}

export const serializeEligibleMaintenanceTransaction = ({
  transaction,
}: {
  transaction: Transactions;
}): EligibleMaintenanceTransactionApiResponse => ({
  id: transaction.id,
  date: transaction.time.toISOString().slice(0, 10),
  amount: transaction.amount.toNumber(),
  refAmount: transaction.refAmount.toNumber(),
  note: transaction.note ?? null,
  account: {
    id: transaction.account.id,
    name: transaction.account.name,
  },
  category: transaction.category
    ? {
        id: transaction.category.id,
        name: transaction.category.name,
      }
    : null,
  payee: transaction.payee
    ? {
        id: transaction.payee.id,
        name: transaction.payee.name,
      }
    : null,
});
