import Accounts from '@models/accounts.model';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import VehicleMaintenancePlans from '@models/vehicle-maintenance-plans.model';
import Vehicles from '@models/vehicles.model';
import { metersToDistance } from '@services/vehicle-maintenance/distance';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { Op } from 'sequelize';

import type { VehicleMaintenancePlanRow } from '../types';
import { resolveRelationName } from './utils';

function vehicleLabel({ accountName }: { accountName: string | undefined }): string {
  return accountName ?? '(unresolved vehicle)';
}

function activityLabel({
  activity,
  activityId,
}: {
  activity: VehicleMaintenanceActivities | undefined;
  activityId: string;
}): string {
  if (activity) return activity.name ?? activity.systemKey ?? '(unresolved activity)';
  return `(unresolved activity ${activityId})`;
}

export async function transformVehicleMaintenancePlans({
  userId,
}: {
  userId: number;
}): Promise<VehicleMaintenancePlanRow[]> {
  const vehicles = await Vehicles.findAll({
    where: { userId },
    attributes: ['id', 'accountId'],
    order: [['id', 'ASC']],
  });
  if (vehicles.length === 0) return [];

  const vehicleIds = vehicles.map((vehicle) => vehicle.id);
  const accountIds = vehicles.map((vehicle) => vehicle.accountId);
  const plans = await VehicleMaintenancePlans.findAll({
    where: { vehicleId: { [Op.in]: vehicleIds } },
    order: [
      ['vehicleId', 'ASC'],
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  if (plans.length === 0) return [];

  const activityIds = [...new Set(plans.map((plan) => String(plan.activityId)))];
  const [accounts, activities, distanceUnit] = await Promise.all([
    Accounts.findAll({
      where: { userId, id: { [Op.in]: accountIds } },
      attributes: ['id', 'name'],
    }),
    VehicleMaintenanceActivities.findAll({
      where: {
        id: { [Op.in]: activityIds },
        [Op.or]: [{ userId: null }, { userId }],
      },
      attributes: ['id', 'name', 'systemKey'],
    }),
    getVehicleDistanceUnit({ userId }),
  ]);

  const accountNameById = new Map(accounts.map((account) => [String(account.id), account.name]));
  const vehicleLabelById = new Map(
    vehicles.map((vehicle) => [
      String(vehicle.id),
      vehicleLabel({ accountName: accountNameById.get(String(vehicle.accountId)) }),
    ]),
  );
  const activityById = new Map(activities.map((activity) => [String(activity.id), activity]));

  return plans.map(
    (plan): VehicleMaintenancePlanRow => ({
      vehicle: resolveRelationName({
        id: String(plan.vehicleId),
        nameById: vehicleLabelById,
        relation: 'vehicle',
        context: `vehicle maintenance plan ${plan.id}`,
      }),
      activity: activityLabel({
        activity: activityById.get(String(plan.activityId)),
        activityId: String(plan.activityId),
      }),
      nextDueDate: plan.nextDueDate,
      nextDueDistance:
        plan.nextDueDistanceMeters == null
          ? null
          : metersToDistance({ meters: plan.nextDueDistanceMeters, unit: distanceUnit }),
      leadDays: plan.leadDays,
      leadDistance: metersToDistance({ meters: plan.leadDistanceMeters, unit: distanceUnit }),
      distanceUnit,
      archivedAt: plan.archivedAt ? plan.archivedAt.toISOString() : null,
    }),
  );
}
