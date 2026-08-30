import type { RecordId } from '@bt/shared/types';
import type VehicleMaintenancePlans from '@models/vehicle-maintenance-plans.model';
import { metersToDistance, type DistanceUnit } from '@services/vehicle-maintenance/distance';
import {
  resolveVehicleMaintenancePlanStatus,
  type MaintenancePlanStatus,
} from '@services/vehicle-maintenance/resolve-plan-status';

export interface VehicleMaintenancePlanApiResponse {
  id: RecordId;
  vehicleId: RecordId;
  activityId: RecordId;
  activitySystemKey: VehicleMaintenancePlans['activity']['systemKey'] | null;
  activityName: string | null;
  nextDueDate: string | null;
  nextDueDistance: number | null;
  leadDays: number;
  leadDistance: number;
  distanceUnit: DistanceUnit;
  status: MaintenancePlanStatus;
  archivedAt: string | null;
}

export function serializeVehicleMaintenancePlan({
  plan,
  distanceUnit,
  currentMileageMeters,
}: {
  plan: VehicleMaintenancePlans;
  distanceUnit: DistanceUnit;
  currentMileageMeters: number | null;
}): VehicleMaintenancePlanApiResponse {
  return {
    id: plan.id,
    vehicleId: plan.vehicleId,
    activityId: plan.activityId,
    activitySystemKey: plan.activity?.systemKey ?? null,
    activityName: plan.activity?.name ?? null,
    nextDueDate: plan.nextDueDate,
    nextDueDistance:
      plan.nextDueDistanceMeters == null
        ? null
        : metersToDistance({ meters: plan.nextDueDistanceMeters, unit: distanceUnit }),
    leadDays: plan.leadDays,
    leadDistance: metersToDistance({ meters: plan.leadDistanceMeters, unit: distanceUnit }),
    distanceUnit,
    status: resolveVehicleMaintenancePlanStatus({
      nextDueDate: plan.nextDueDate,
      nextDueDistanceMeters: plan.nextDueDistanceMeters,
      leadDays: plan.leadDays,
      leadDistanceMeters: plan.leadDistanceMeters,
      currentMileageMeters,
    }),
    archivedAt: plan.archivedAt ? plan.archivedAt.toISOString() : null,
  };
}
