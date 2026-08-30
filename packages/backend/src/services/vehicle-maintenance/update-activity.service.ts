import type { RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import { withTransaction } from '@services/common/with-transaction';

interface UpdateVehicleMaintenanceActivityParams {
  id: RecordId;
  userId: number;
  name?: string;
  archived?: boolean;
}

const updateVehicleMaintenanceActivityImpl = async ({
  id,
  userId,
  name,
  archived,
}: UpdateVehicleMaintenanceActivityParams) => {
  const activity = await findOrThrowNotFound({
    query: VehicleMaintenanceActivities.findOne({
      where: {
        id,
        userId,
        systemKey: null,
      },
    }),
    message: 'Vehicle maintenance activity not found',
  });

  const updates: { name?: string; archivedAt?: Date | null } = {};
  if (name !== undefined) {
    updates.name = name;
  }
  if (archived !== undefined) {
    updates.archivedAt = archived ? new Date() : null;
  }

  if (Object.keys(updates).length > 0) {
    await activity.update(updates);
  }

  return activity;
};

export const updateVehicleMaintenanceActivity = withTransaction(updateVehicleMaintenanceActivityImpl);
