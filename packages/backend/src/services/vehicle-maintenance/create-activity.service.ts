import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import { withTransaction } from '@services/common/with-transaction';

interface CreateVehicleMaintenanceActivityParams {
  userId: number;
  name: string;
}

const createVehicleMaintenanceActivityImpl = ({ userId, name }: CreateVehicleMaintenanceActivityParams) => {
  return VehicleMaintenanceActivities.create({
    userId,
    systemKey: null,
    name,
    sortOrder: 1000,
    archivedAt: null,
  });
};

export const createVehicleMaintenanceActivity = withTransaction(createVehicleMaintenanceActivityImpl);
