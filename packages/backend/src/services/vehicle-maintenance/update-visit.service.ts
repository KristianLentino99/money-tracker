import type { RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ValidationError } from '@js/errors';
import { namespace } from '@models/connection';
import Transactions from '@models/transactions.model';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import VehicleMaintenanceTransactionLinks from '@models/vehicle-maintenance-transaction-links.model';
import VehicleMaintenanceVisitActivities from '@models/vehicle-maintenance-visit-activities.model';
import VehicleMaintenanceVisits from '@models/vehicle-maintenance-visits.model';
import { withTransaction } from '@services/common/with-transaction';
import { distanceToMetersForApi as distanceToMeters } from '@services/vehicle-maintenance/distance';
import { Op } from 'sequelize';

import { findVehicleOrThrow, getVehicleDistanceUnit } from '../vehicles/helpers';

export interface UpdateVehicleMaintenanceVisitActivity {
  activityId?: RecordId;
  label?: string;
}

interface UpdateVehicleMaintenanceVisitParams {
  userId: number;
  vehicleId: RecordId;
  visitId: RecordId;
  serviceDate?: string;
  odometer?: number | null;
  notes?: string | null;
  activities?: UpdateVehicleMaintenanceVisitActivity[];
}

const resolveActivities = async ({
  userId,
  activities,
  existingPlanIdsByActivityId,
}: {
  userId: number;
  activities: UpdateVehicleMaintenanceVisitActivity[];
  existingPlanIdsByActivityId: ReadonlyMap<RecordId, RecordId | null>;
}) => {
  if (activities.length === 0) {
    throw new ValidationError({ message: 'At least one maintenance visit activity is required' });
  }

  return Promise.all(
    activities.map(async ({ activityId, label }) => {
      if ((activityId === undefined) === (label === undefined)) {
        throw new ValidationError({ message: 'Provide exactly one of activityId or label for each activity' });
      }

      if (activityId !== undefined) {
        const activity = await findOrThrowNotFound({
          query: VehicleMaintenanceActivities.findOne({
            where: {
              id: activityId,
              archivedAt: null,
              [Op.or]: [{ userId: null }, { userId }],
            },
          }),
          message: 'Vehicle maintenance activity is not available',
        });
        const labelSnapshot = activity.name ?? activity.systemKey;
        if (!labelSnapshot) {
          throw new ValidationError({ message: 'Vehicle maintenance activity has no label' });
        }

        return {
          activityId: activity.id,
          planId: existingPlanIdsByActivityId.get(activity.id) ?? null,
          labelSnapshot,
        };
      }

      if (!label) {
        throw new ValidationError({ message: 'Each maintenance visit activity needs an activityId or label' });
      }

      return {
        activityId: null,
        planId: null,
        labelSnapshot: label,
      };
    }),
  );
};

const updateVehicleMaintenanceVisitImpl = async ({
  userId,
  vehicleId,
  visitId,
  serviceDate,
  odometer,
  notes,
  activities,
}: UpdateVehicleMaintenanceVisitParams) => {
  const sequelizeTx = namespace.get('transaction');
  const vehicle = await findVehicleOrThrow({
    vehicleId,
    userId,
    transaction: sequelizeTx,
    lock: sequelizeTx?.LOCK.UPDATE,
  });
  const visit = await findOrThrowNotFound({
    query: VehicleMaintenanceVisits.findOne({
      where: { id: visitId, vehicleId },
      transaction: sequelizeTx,
      lock: sequelizeTx?.LOCK.UPDATE,
    }),
    message: 'Vehicle maintenance visit not found',
  });

  const updates: { serviceDate?: string; odometerMeters?: number | null; notes?: string | null } = {};
  const distanceUnit = await getVehicleDistanceUnit({ userId });
  if (serviceDate !== undefined) updates.serviceDate = serviceDate;
  if (odometer !== undefined) {
    updates.odometerMeters = odometer === null ? null : distanceToMeters({ value: odometer, unit: distanceUnit });
  }
  if (notes !== undefined) updates.notes = notes;
  if (Object.keys(updates).length > 0) {
    await visit.update(updates, { transaction: sequelizeTx });
  }

  if (activities !== undefined) {
    const existingActivities = await VehicleMaintenanceVisitActivities.findAll({
      where: { visitId },
      attributes: ['activityId', 'planId'],
      transaction: sequelizeTx,
      lock: sequelizeTx?.LOCK.UPDATE,
    });
    const existingPlanIdsByActivityId = new Map(
      existingActivities
        .filter(({ activityId }) => activityId !== null)
        .map(({ activityId, planId }) => [activityId!, planId] as const),
    );
    const activityRows = await resolveActivities({ userId, activities, existingPlanIdsByActivityId });
    await VehicleMaintenanceVisitActivities.destroy({ where: { visitId }, transaction: sequelizeTx });
    await VehicleMaintenanceVisitActivities.bulkCreate(
      activityRows.map(({ activityId, planId, labelSnapshot }) => ({
        visitId,
        activityId,
        planId,
        labelSnapshot,
      })),
      { transaction: sequelizeTx },
    );
  }

  const updatedOdometerMeters = updates.odometerMeters;
  const currentMileageMeters = vehicle.currentMileageMeters;
  if (
    odometer !== undefined &&
    odometer !== null &&
    updatedOdometerMeters !== undefined &&
    updatedOdometerMeters !== null &&
    (currentMileageMeters === null || updatedOdometerMeters > currentMileageMeters)
  ) {
    await vehicle.update({ currentMileageMeters: updatedOdometerMeters }, { transaction: sequelizeTx });
  }

  const updatedVisit = await findOrThrowNotFound({
    query: VehicleMaintenanceVisits.findOne({
      where: { id: visitId, vehicleId },
      include: [
        { model: VehicleMaintenanceVisitActivities, as: 'activities', required: false },
        {
          model: VehicleMaintenanceTransactionLinks,
          as: 'transactionLinks',
          required: false,
          include: [{ model: Transactions, as: 'transaction', required: true }],
        },
      ],
      transaction: sequelizeTx,
    }),
    message: 'Vehicle maintenance visit not found',
  });

  return updatedVisit;
};

export const updateVehicleMaintenanceVisit = withTransaction(updateVehicleMaintenanceVisitImpl);
