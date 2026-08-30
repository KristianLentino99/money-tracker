import type { RecordId } from '@bt/shared/types';
import { Money } from '@common/types/money';
import type VehicleMaintenanceTransactionLinks from '@models/vehicle-maintenance-transaction-links.model';
import type VehicleMaintenanceVisitActivities from '@models/vehicle-maintenance-visit-activities.model';
import type VehicleMaintenanceVisits from '@models/vehicle-maintenance-visits.model';
import { metersToDistance, type DistanceUnit } from '@services/vehicle-maintenance/distance';

export interface VehicleMaintenanceVisitActivityApiResponse {
  id: RecordId;
  activityId: RecordId | null;
  planId: RecordId | null;
  labelSnapshot: string;
}

export interface VehicleMaintenanceVisitApiResponse {
  id: RecordId;
  vehicleId: RecordId;
  serviceDate: string;
  odometer: number | null;
  distanceUnit: DistanceUnit;
  notes: string | null;
  totalCost: number;
  activities: VehicleMaintenanceVisitActivityApiResponse[];
  transactionIds: RecordId[];
  generatedTransactionIds: RecordId[];
}

function serializeVehicleMaintenanceTransactionLinks({
  links,
}: {
  links: VehicleMaintenanceTransactionLinks[];
}): Pick<VehicleMaintenanceVisitApiResponse, 'totalCost' | 'transactionIds' | 'generatedTransactionIds'> {
  const uniqueLinks = Array.from(
    new Map(links.filter((link) => link.transaction != null).map((link) => [link.transactionId, link])).values(),
  );
  const transactionIds = uniqueLinks.map((link) => link.transactionId).toSorted();
  const generatedTransactionIds = uniqueLinks
    .filter((link) => link.createdByMaintenance)
    .map((link) => link.transactionId)
    .toSorted();
  const totalCost = uniqueLinks
    .reduce((total, link) => (link.transaction ? total.add(link.transaction.refAmount) : total), Money.zero())
    .toNumber();

  return { totalCost, transactionIds, generatedTransactionIds };
}

function serializeVehicleMaintenanceVisitActivity(
  activity: VehicleMaintenanceVisitActivities,
): VehicleMaintenanceVisitActivityApiResponse {
  return {
    id: activity.id,
    activityId: activity.activityId,
    planId: activity.planId,
    labelSnapshot: activity.labelSnapshot,
  };
}

export function serializeVehicleMaintenanceVisit({
  visit,
  distanceUnit,
}: {
  visit: VehicleMaintenanceVisits;
  distanceUnit: DistanceUnit;
}): VehicleMaintenanceVisitApiResponse {
  const transactionData = serializeVehicleMaintenanceTransactionLinks({ links: visit.transactionLinks ?? [] });

  return {
    id: visit.id,
    vehicleId: visit.vehicleId,
    serviceDate: visit.serviceDate,
    odometer:
      visit.odometerMeters == null ? null : metersToDistance({ meters: visit.odometerMeters, unit: distanceUnit }),
    distanceUnit,
    notes: visit.notes,
    totalCost: transactionData.totalCost,
    activities: (visit.activities ?? []).map(serializeVehicleMaintenanceVisitActivity),
    transactionIds: transactionData.transactionIds,
    generatedTransactionIds: transactionData.generatedTransactionIds,
  };
}
