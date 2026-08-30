import type { RecordId } from '@bt/shared/types';
import { findTransactions } from '@models/transactions-query';
import Transactions from '@models/transactions.model';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import VehicleMaintenancePlans from '@models/vehicle-maintenance-plans.model';
import VehicleMaintenanceTransactionLinks from '@models/vehicle-maintenance-transaction-links.model';
import VehicleMaintenanceVisitActivities from '@models/vehicle-maintenance-visit-activities.model';
import VehicleMaintenanceVisits from '@models/vehicle-maintenance-visits.model';
import { Op } from 'sequelize';

import { findVehicleOrThrow } from '../vehicles/helpers';

interface GetVehicleMaintenanceParams {
  userId: number;
  vehicleId: RecordId;
}

export const getVehicleMaintenance = async ({ userId, vehicleId }: GetVehicleMaintenanceParams) => {
  const vehicle = await findVehicleOrThrow({ vehicleId, userId });
  const plans = await VehicleMaintenancePlans.findAll({
    where: { vehicleId, archivedAt: null },
    include: [{ model: VehicleMaintenanceActivities, required: true }],
    order: [['createdAt', 'ASC']],
  });
  const visits = await VehicleMaintenanceVisits.findAll({
    where: { vehicleId },
    include: [
      { model: VehicleMaintenanceVisitActivities, as: 'activities', required: false },
      {
        model: VehicleMaintenanceTransactionLinks,
        as: 'transactionLinks',
        required: false,
        include: [{ model: Transactions, as: 'transaction', required: false }],
      },
    ],
    order: [
      ['serviceDate', 'DESC'],
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  const transactionIds = visits.flatMap((visit) => (visit.transactionLinks ?? []).map((link) => link.transactionId));
  if (transactionIds.length > 0) {
    const readableTransactions = await findTransactions({
      where: { id: { [Op.in]: transactionIds } },
      planned: 'exclude',
      access: { accessibleTo: userId },
      balanceAdjustments: 'exclude',
      completeness: 'all',
    });
    const transactionById = new Map(readableTransactions.map((transaction) => [transaction.id, transaction]));
    for (const visit of visits) {
      for (const link of visit.transactionLinks ?? []) {
        link.transaction = transactionById.get(link.transactionId)!;
      }
    }
  }

  for (const plan of plans) {
    plan.vehicle = vehicle;
  }

  return { plans, visits };
};
