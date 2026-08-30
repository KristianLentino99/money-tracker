import { TRANSACTION_TYPES } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import Categories from '@models/categories.model';
import Payees from '@models/payees.model';
import { findTransactions } from '@models/transactions-query';
import VehicleMaintenanceTransactionLinks from '@models/vehicle-maintenance-transaction-links.model';
import { Op } from 'sequelize';

export interface GetEligibleMaintenanceTransactionsParams {
  userId: number;
}

export const getEligibleMaintenanceTransactions = async ({ userId }: GetEligibleMaintenanceTransactionsParams) => {
  const links = await VehicleMaintenanceTransactionLinks.findAll({
    attributes: ['transactionId'],
  });
  const linkedTransactionIds = links.map(({ transactionId }) => transactionId);

  return findTransactions({
    where: {
      transactionType: TRANSACTION_TYPES.expense,
      refundLinked: false,
      ...(linkedTransactionIds.length > 0 ? { id: { [Op.notIn]: linkedTransactionIds } } : {}),
    },
    planned: 'exclude',
    access: { accessibleTo: userId },
    balanceAdjustments: 'exclude',
    transfers: 'exclude',
    completeness: 'all',
    order: [
      ['time', 'DESC'],
      ['id', 'DESC'],
    ],
    include: [
      { model: Accounts, attributes: ['id', 'name'], required: true },
      { model: Categories, attributes: ['id', 'name'], required: false },
      { model: Payees, attributes: ['id', 'name'], required: false },
    ],
  });
};
