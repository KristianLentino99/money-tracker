import type { RecordId } from '@bt/shared/types';
import type VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';

export interface VehicleMaintenanceActivityApiResponse {
  id: RecordId;
  systemKey: VehicleMaintenanceActivities['systemKey'];
  name: string | null;
  archivedAt: string | null;
}

export function serializeVehicleMaintenanceActivity({
  activity,
}: {
  activity: VehicleMaintenanceActivities;
}): VehicleMaintenanceActivityApiResponse {
  return {
    id: activity.id,
    systemKey: activity.systemKey,
    name: activity.name,
    archivedAt: activity.archivedAt ? activity.archivedAt.toISOString() : null,
  };
}
