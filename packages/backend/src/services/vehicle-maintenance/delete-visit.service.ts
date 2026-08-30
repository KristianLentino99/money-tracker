import type { RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import VehicleMaintenanceTransactionLinks from '@models/vehicle-maintenance-transaction-links.model';
import VehicleMaintenanceVisitActivities from '@models/vehicle-maintenance-visit-activities.model';
import VehicleMaintenanceVisits from '@models/vehicle-maintenance-visits.model';
import { withTransaction } from '@services/common/with-transaction';
import { deleteTransaction } from '@services/transactions/delete-transaction';

import { findVehicleOrThrow } from '../vehicles/helpers';

interface DeleteVehicleMaintenanceVisitParams {
  userId: number;
  vehicleId: RecordId;
  visitId: RecordId;
  deleteGeneratedExpense?: boolean;
}

const deleteVehicleMaintenanceVisitImpl = async ({
  userId,
  vehicleId,
  visitId,
  deleteGeneratedExpense = false,
}: DeleteVehicleMaintenanceVisitParams) => {
  await findVehicleOrThrow({ vehicleId, userId });
  const visit = await findOrThrowNotFound({
    query: VehicleMaintenanceVisits.findOne({ where: { id: visitId, vehicleId } }),
    message: 'Vehicle maintenance visit not found',
  });

  const generatedLinks = deleteGeneratedExpense
    ? await VehicleMaintenanceTransactionLinks.findAll({
        where: { visitId, createdByMaintenance: true },
        attributes: ['transactionId'],
      })
    : [];

  for (const link of generatedLinks) {
    await deleteTransaction({ id: link.transactionId, userId });
  }

  await VehicleMaintenanceTransactionLinks.destroy({ where: { visitId } });
  await VehicleMaintenanceVisitActivities.destroy({ where: { visitId } });
  await visit.destroy();

  return { id: visitId };
};

export const deleteVehicleMaintenanceVisit = withTransaction(deleteVehicleMaintenanceVisitImpl);
