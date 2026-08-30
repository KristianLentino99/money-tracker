import type { RecordId } from '@bt/shared/types';
import { NOTIFICATION_TYPES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ValidationError } from '@js/errors';
import { namespace } from '@models/connection';
import Notifications from '@models/notifications.model';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import VehicleMaintenancePlans from '@models/vehicle-maintenance-plans.model';
import { withTransaction } from '@services/common/with-transaction';
import { distanceToMetersForApi as distanceToMeters } from '@services/vehicle-maintenance/distance';
import { Op, Sequelize, UniqueConstraintError } from 'sequelize';

import { findVehicleOrThrow, getVehicleDistanceUnit } from '../vehicles/helpers';

interface UpdateVehicleMaintenancePlanParams {
  userId: number;
  vehicleId: RecordId;
  planId: RecordId;
  nextDueDate?: string | null;
  nextDueDistance?: number | null;
  leadDays?: number;
  leadDistance?: number;
  archived?: boolean;
}

const updateVehicleMaintenancePlanImpl = async ({
  userId,
  vehicleId,
  planId,
  nextDueDate,
  nextDueDistance,
  leadDays,
  leadDistance,
  archived,
}: UpdateVehicleMaintenancePlanParams) => {
  const sequelizeTx = namespace.get('transaction');
  const vehicle = await findVehicleOrThrow({ vehicleId, userId });
  const plan = await findOrThrowNotFound({
    query: VehicleMaintenancePlans.findOne({
      where: { id: planId, vehicleId },
      include: [{ model: VehicleMaintenanceActivities, required: true }],
      transaction: sequelizeTx,
      lock: sequelizeTx?.LOCK.UPDATE,
    }),
    message: 'Vehicle maintenance plan not found',
  });

  const distanceUnit = await getVehicleDistanceUnit({ userId });
  const nextDueDistanceMeters =
    nextDueDistance === undefined
      ? plan.nextDueDistanceMeters
      : nextDueDistance === null
        ? null
        : distanceToMeters({ value: nextDueDistance, unit: distanceUnit });
  const leadDistanceMeters =
    leadDistance === undefined
      ? plan.leadDistanceMeters
      : distanceToMeters({ value: leadDistance, unit: distanceUnit });
  const finalArchived = archived === undefined ? plan.archivedAt !== null : archived;
  const finalNextDueDate = nextDueDate === undefined ? plan.nextDueDate : nextDueDate;

  if (!finalArchived) {
    const activePlan = await VehicleMaintenancePlans.findOne({
      where: {
        vehicleId,
        activityId: plan.activityId,
        archivedAt: null,
        id: { [Op.ne]: plan.id },
      },
      transaction: sequelizeTx,
    });
    if (activePlan) {
      throw new ValidationError({ message: 'An active maintenance plan already exists for this activity and vehicle' });
    }
  }

  if (!finalArchived && finalNextDueDate === null && nextDueDistanceMeters === null) {
    throw new ValidationError({
      message: 'At least one maintenance due target is required for an active plan',
    });
  }

  const updates: {
    nextDueDate?: string | null;
    nextDueDistanceMeters?: number | null;
    leadDays?: number;
    leadDistanceMeters?: number;
    archivedAt?: Date | null;
    upcomingNotifiedAt?: Date | null;
    overdueNotifiedAt?: Date | null;
  } = {};
  if (nextDueDate !== undefined) updates.nextDueDate = nextDueDate;
  if (nextDueDistance !== undefined) updates.nextDueDistanceMeters = nextDueDistanceMeters;
  if (leadDays !== undefined) updates.leadDays = leadDays;
  if (leadDistance !== undefined) updates.leadDistanceMeters = leadDistanceMeters;
  if (archived !== undefined) updates.archivedAt = archived ? new Date() : null;

  const shouldInvalidateReminders =
    nextDueDate !== undefined ||
    nextDueDistance !== undefined ||
    leadDays !== undefined ||
    leadDistance !== undefined ||
    archived !== undefined;

  if (shouldInvalidateReminders) {
    updates.upcomingNotifiedAt = null;
    updates.overdueNotifiedAt = null;
  }

  if (Object.keys(updates).length > 0) {
    try {
      await plan.update(updates, { transaction: sequelizeTx });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ValidationError({
          message: 'An active maintenance plan already exists for this activity and vehicle',
        });
      }
      throw error;
    }
  }

  if (shouldInvalidateReminders) {
    await Notifications.destroy({
      where: Sequelize.and(
        { userId, type: NOTIFICATION_TYPES.vehicleMaintenanceReminder },
        Sequelize.where(Sequelize.literal(`"payload"->>'planId'`), planId),
      ),
      transaction: sequelizeTx,
    });
  }

  plan.vehicle = vehicle;
  return plan;
};

export const updateVehicleMaintenancePlan = withTransaction(updateVehicleMaintenancePlanImpl);
