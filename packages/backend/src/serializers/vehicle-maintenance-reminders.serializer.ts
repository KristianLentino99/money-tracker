import type { RecordId } from '@bt/shared/types';
import type VehicleMaintenancePlans from '@models/vehicle-maintenance-plans.model';
import { metersToDistance, type DistanceUnit } from '@services/vehicle-maintenance/distance';

import {
  serializeVehicleMaintenancePlan,
  type VehicleMaintenancePlanApiResponse,
} from './vehicle-maintenance-plans.serializer';

export interface VehicleMaintenanceReminderApiResponse extends VehicleMaintenancePlanApiResponse {
  planId: RecordId;
  vehicleName: string;
  currentMileage: number | null;
}

export function serializeVehicleMaintenanceReminder({
  plan,
  distanceUnit,
}: {
  plan: VehicleMaintenancePlans;
  distanceUnit: DistanceUnit;
}): VehicleMaintenanceReminderApiResponse {
  return {
    ...serializeVehicleMaintenancePlan({
      plan,
      distanceUnit,
      currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
    }),
    planId: plan.id,
    vehicleName: plan.vehicle?.account?.name ?? '',
    currentMileage:
      plan.vehicle?.currentMileageMeters == null
        ? null
        : metersToDistance({ meters: plan.vehicle.currentMileageMeters, unit: distanceUnit }),
  };
}
