import { Money } from '@common/types/money';
import Accounts from '@models/accounts.model';
import { findTransactions } from '@models/transactions-query';
import { getBaseCurrency } from '@models/users-currencies.model';
import VehicleMaintenanceTransactionLinks from '@models/vehicle-maintenance-transaction-links.model';
import VehicleMaintenanceVisitActivities from '@models/vehicle-maintenance-visit-activities.model';
import VehicleMaintenanceVisits from '@models/vehicle-maintenance-visits.model';
import Vehicles from '@models/vehicles.model';
import { metersToDistance } from '@services/vehicle-maintenance/distance';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { Op } from 'sequelize';

import type { VehicleMaintenanceVisitRow } from '../types';
import { resolveRelationName } from './utils';

function groupActivities({ activities }: { activities: VehicleMaintenanceVisitActivities[] }) {
  const byVisitId = new Map<string, string[]>();
  for (const activity of activities) {
    const labels = byVisitId.get(String(activity.visitId)) ?? [];
    labels.push(activity.labelSnapshot);
    byVisitId.set(String(activity.visitId), labels);
  }
  return byVisitId;
}

function groupLinks({ links }: { links: VehicleMaintenanceTransactionLinks[] }) {
  const byVisitId = new Map<string, Map<string, VehicleMaintenanceTransactionLinks>>();
  for (const link of links) {
    const transactionId = String(link.transactionId);
    const visitLinks = byVisitId.get(String(link.visitId)) ?? new Map<string, VehicleMaintenanceTransactionLinks>();
    // A malformed duplicate link must not make a transaction count twice in a visit's total.
    if (!visitLinks.has(transactionId)) visitLinks.set(transactionId, link);
    byVisitId.set(String(link.visitId), visitLinks);
  }
  return byVisitId;
}

export async function transformVehicleMaintenanceVisits({
  userId,
}: {
  userId: number;
}): Promise<VehicleMaintenanceVisitRow[]> {
  const vehicles = await Vehicles.findAll({
    where: { userId },
    attributes: ['id', 'accountId'],
    order: [['id', 'ASC']],
  });
  if (vehicles.length === 0) return [];

  const vehicleIds = vehicles.map((vehicle) => vehicle.id);
  const accountIds = vehicles.map((vehicle) => vehicle.accountId);
  const visits = await VehicleMaintenanceVisits.findAll({
    where: { vehicleId: { [Op.in]: vehicleIds } },
    order: [
      ['serviceDate', 'ASC'],
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  if (visits.length === 0) return [];

  const visitIds = visits.map((visit) => visit.id);
  const [accounts, activities, links, distanceUnit, baseCurrency] = await Promise.all([
    Accounts.findAll({
      where: { userId, id: { [Op.in]: accountIds } },
      attributes: ['id', 'name'],
    }),
    VehicleMaintenanceVisitActivities.findAll({
      where: { visitId: { [Op.in]: visitIds } },
      order: [
        ['visitId', 'ASC'],
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    }),
    VehicleMaintenanceTransactionLinks.findAll({
      where: { visitId: { [Op.in]: visitIds } },
      attributes: ['visitId', 'transactionId'],
      order: [
        ['visitId', 'ASC'],
        ['transactionId', 'ASC'],
      ],
    }),
    getVehicleDistanceUnit({ userId }),
    getBaseCurrency({ userId }),
  ]);

  const accountNameById = new Map(accounts.map((account) => [String(account.id), account.name]));
  const vehicleLabelById = new Map(
    vehicles.map((vehicle) => [
      String(vehicle.id),
      accountNameById.get(String(vehicle.accountId)) ?? '(unresolved vehicle)',
    ]),
  );
  const activitiesByVisitId = groupActivities({ activities });
  const linksByVisitId = groupLinks({ links });
  const transactionIds = [...new Set(links.map((link) => link.transactionId))];
  const transactions = transactionIds.length
    ? await findTransactions({
        // Links do not carry an owner column, so the transaction query must retain
        // the caller scope before any amount is included in the export.
        where: { id: { [Op.in]: transactionIds } },
        attributes: ['id', 'refAmount'],
        planned: 'include',
        access: { accessibleTo: userId },
        balanceAdjustments: 'include',
        transfers: 'include',
        completeness: 'all',
      })
    : [];
  const transactionById = new Map(transactions.map((transaction) => [String(transaction.id), transaction]));
  const baseCurrencyCode = baseCurrency?.currencyCode ?? '';

  return visits.map((visit): VehicleMaintenanceVisitRow => {
    const activityLabels = activitiesByVisitId.get(String(visit.id)) ?? [];
    const visitLinks = linksByVisitId.get(String(visit.id));
    let totalCost = Money.zero();
    for (const link of visitLinks?.values() ?? []) {
      const transaction = transactionById.get(String(link.transactionId));
      if (transaction) totalCost = totalCost.add(transaction.refAmount);
    }

    return {
      vehicle: resolveRelationName({
        id: String(visit.vehicleId),
        nameById: vehicleLabelById,
        relation: 'vehicle',
        context: `vehicle maintenance visit ${visit.id}`,
      }),
      serviceDate: visit.serviceDate,
      odometer:
        visit.odometerMeters == null ? null : metersToDistance({ meters: visit.odometerMeters, unit: distanceUnit }),
      distanceUnit,
      notes: visit.notes ?? '',
      totalCost: totalCost.toNumber(),
      baseCurrency: baseCurrencyCode,
      activities: activityLabels,
      activitiesDetails: activityLabels.join('; '),
    };
  });
}
