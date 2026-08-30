import type { RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ValidationError } from '@js/errors';
import { namespace } from '@models/connection';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import VehicleMaintenancePlans from '@models/vehicle-maintenance-plans.model';
import { withTransaction } from '@services/common/with-transaction';
import { distanceToMetersForApi as distanceToMeters } from '@services/vehicle-maintenance/distance';
import { Op, UniqueConstraintError } from 'sequelize';

import { assertVehicleMileageIsMonotonic, findVehicleOrThrow, getVehicleDistanceUnit } from '../vehicles/helpers';

interface CreateVehicleMaintenancePlanParams {
  userId: number;
  vehicleId: RecordId;
  activityId: RecordId;
  nextDueDate?: string;
  nextDueDistance?: number;
  leadDays?: number;
  leadDistance?: number;
  currentMileage?: number;
}

const createVehicleMaintenancePlanImpl = async ({
  userId,
  vehicleId,
  activityId,
  nextDueDate,
  nextDueDistance,
  leadDays = 30,
  leadDistance = 1_000,
  currentMileage,
}: CreateVehicleMaintenancePlanParams) => {
  const sequelizeTx = namespace.get('transaction');
  if (nextDueDate === undefined && nextDueDistance === undefined) {
    throw new ValidationError({ message: 'At least one maintenance due target is required' });
  }
  if (nextDueDistance !== undefined && (!Number.isFinite(nextDueDistance) || nextDueDistance < 0)) {
    throw new ValidationError({ message: 'nextDueDistance must be a finite, non-negative number' });
  }
  if (!Number.isInteger(leadDays) || leadDays < 0) {
    throw new ValidationError({ message: 'leadDays must be a non-negative integer' });
  }
  if (!Number.isFinite(leadDistance) || leadDistance < 0) {
    throw new ValidationError({ message: 'leadDistance must be a finite, non-negative number' });
  }
  if (currentMileage !== undefined && (!Number.isFinite(currentMileage) || currentMileage < 0)) {
    throw new ValidationError({ message: 'currentMileage must be a finite, non-negative number' });
  }

  const vehicle = await findVehicleOrThrow({
    vehicleId,
    userId,
    transaction: sequelizeTx,
    lock: sequelizeTx?.LOCK.UPDATE,
  });
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

  const activePlan = await VehicleMaintenancePlans.findOne({
    where: { vehicleId, activityId, archivedAt: null },
  });
  if (activePlan) {
    throw new ValidationError({ message: 'An active maintenance plan already exists for this activity and vehicle' });
  }

  const distanceUnit = await getVehicleDistanceUnit({ userId });
  const currentMileageMeters =
    currentMileage === undefined
      ? vehicle.currentMileageMeters
      : distanceToMeters({ value: currentMileage, unit: distanceUnit });

  if (currentMileage !== undefined) {
    assertVehicleMileageIsMonotonic({
      currentMileageMeters: vehicle.currentMileageMeters,
      nextMileageMeters: currentMileageMeters,
    });
  }

  if (nextDueDistance !== undefined && currentMileageMeters === null) {
    throw new ValidationError({
      message: 'currentMileage is required when nextDueDistance is provided for a vehicle without an odometer',
    });
  }

  if (currentMileage !== undefined) {
    await vehicle.update({ currentMileageMeters }, { transaction: sequelizeTx });
  }

  let plan: VehicleMaintenancePlans;
  try {
    plan = await VehicleMaintenancePlans.create({
      vehicleId,
      activityId,
      nextDueDate: nextDueDate ?? null,
      nextDueDistanceMeters:
        nextDueDistance === undefined ? null : distanceToMeters({ value: nextDueDistance, unit: distanceUnit }),
      leadDays,
      leadDistanceMeters: distanceToMeters({ value: leadDistance, unit: distanceUnit }),
      archivedAt: null,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new ValidationError({ message: 'An active maintenance plan already exists for this activity and vehicle' });
    }
    throw error;
  }

  plan.vehicle = vehicle;
  plan.activity = activity;
  return plan;
};

export const createVehicleMaintenancePlan = withTransaction(createVehicleMaintenancePlanImpl);
