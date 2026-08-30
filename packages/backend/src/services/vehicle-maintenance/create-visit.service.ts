import { NOTIFICATION_TYPES, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import type { RecordId } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ValidationError } from '@js/errors';
import { namespace } from '@models/connection';
import Notifications from '@models/notifications.model';
import RefundTransactions from '@models/refund-transactions.model';
import { findTransactions } from '@models/transactions-query';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import VehicleMaintenancePlans from '@models/vehicle-maintenance-plans.model';
import VehicleMaintenanceTransactionLinks from '@models/vehicle-maintenance-transaction-links.model';
import VehicleMaintenanceVisitActivities from '@models/vehicle-maintenance-visit-activities.model';
import VehicleMaintenanceVisits from '@models/vehicle-maintenance-visits.model';
import { withTransaction } from '@services/common/with-transaction';
import { createTransaction } from '@services/transactions/create-transaction';
import { distanceToMetersForApi as distanceToMeters } from '@services/vehicle-maintenance/distance';
import { Op, Sequelize, UniqueConstraintError } from 'sequelize';

import { findVehicleOrThrow, getVehicleDistanceUnit } from '../vehicles/helpers';

export interface CreateVehicleMaintenanceVisitActivity {
  activityId?: RecordId;
  label?: string;
  planId?: RecordId;
  nextDueDate?: string | null;
  nextDueDistance?: number | null;
  archivePlan?: boolean;
}

interface CreateVehicleMaintenanceVisitParams {
  userId: number;
  vehicleId: RecordId;
  serviceDate: string;
  odometer?: number;
  notes?: string;
  activities: CreateVehicleMaintenanceVisitActivity[];
  transactionIds?: RecordId[];
  quickExpense?: CreateVehicleMaintenanceQuickExpense;
}

interface CreateVehicleMaintenanceQuickExpense {
  accountId: RecordId;
  amount: Money;
  date: string;
  categoryId: RecordId;
  paymentType: PAYMENT_TYPES;
  payeeId?: RecordId | null;
  note?: string | null;
}

const validateTransactionLinks = async ({
  userId,
  transactionIds = [],
}: {
  userId: number;
  transactionIds?: RecordId[];
}) => {
  if (transactionIds.length === 0) return [];

  const uniqueTransactionIds = Array.from(
    new Set(transactionIds.map((transactionId) => transactionId.toLowerCase() as RecordId)),
  );
  if (uniqueTransactionIds.length !== transactionIds.length) {
    throw new ValidationError({ message: 'A maintenance visit cannot link the same transaction more than once' });
  }

  const transactions = await findTransactions({
    where: {
      id: { [Op.in]: uniqueTransactionIds },
      transactionType: TRANSACTION_TYPES.expense,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      refundLinked: false,
    },
    planned: 'exclude',
    access: { accessibleTo: userId },
    balanceAdjustments: 'exclude',
    completeness: 'all',
  });

  if (transactions.length !== uniqueTransactionIds.length) {
    throw new ValidationError({ message: 'One or more maintenance transactions are not eligible' });
  }

  const refundLinks = await RefundTransactions.findAll({
    where: {
      [Op.or]: [{ originalTxId: { [Op.in]: uniqueTransactionIds } }, { refundTxId: { [Op.in]: uniqueTransactionIds } }],
    },
    attributes: ['id'],
  });
  if (refundLinks.length > 0) {
    throw new ValidationError({ message: 'Refund transactions cannot be linked to vehicle maintenance visits' });
  }

  const existingLinks = await VehicleMaintenanceTransactionLinks.findAll({
    where: { transactionId: { [Op.in]: uniqueTransactionIds } },
    attributes: ['transactionId'],
  });
  if (existingLinks.length > 0) {
    throw new ValidationError({ message: 'A transaction is already linked to a vehicle maintenance visit' });
  }

  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  return uniqueTransactionIds.toSorted().map((transactionId) => transactionById.get(transactionId)!);
};

const createVehicleMaintenanceVisitImpl = async ({
  userId,
  vehicleId,
  serviceDate,
  odometer,
  notes,
  activities,
  transactionIds,
  quickExpense,
}: CreateVehicleMaintenanceVisitParams) => {
  if (activities.length === 0) {
    throw new ValidationError({ message: 'At least one maintenance visit activity is required' });
  }

  const sequelizeTx = namespace.get('transaction');
  const vehicle = await findVehicleOrThrow({
    vehicleId,
    userId,
    transaction: sequelizeTx,
    lock: sequelizeTx?.LOCK.UPDATE,
  });
  const distanceUnit = await getVehicleDistanceUnit({ userId });
  const odometerMeters = odometer === undefined ? undefined : distanceToMeters({ value: odometer, unit: distanceUnit });
  const linkedTransactions = await validateTransactionLinks({ userId, transactionIds });

  const activityRows = await Promise.all(
    activities.map(async ({ activityId, label, planId, nextDueDate, nextDueDistance, archivePlan }) => {
      let plan: VehicleMaintenancePlans | null = null;
      let nextDueDistanceMeters: number | null | undefined;

      if (planId !== undefined) {
        if (activityId === undefined || label !== undefined) {
          throw new ValidationError({
            message: 'A maintenance plan activity must reference its plan activity',
          });
        }
        if (nextDueDate === undefined && nextDueDistance === undefined && archivePlan !== true) {
          throw new ValidationError({
            message: 'A maintenance plan activity must renew a threshold or archive the plan',
          });
        }

        plan = await findOrThrowNotFound({
          query: VehicleMaintenancePlans.findOne({
            where: { id: planId, vehicleId, archivedAt: null },
            include: [{ model: VehicleMaintenanceActivities, required: true }],
          }),
          message: 'Vehicle maintenance plan not found',
        });

        if (plan.activityId !== activityId) {
          throw new ValidationError({ message: 'Maintenance plan activity does not match the selected activity' });
        }

        nextDueDistanceMeters =
          nextDueDistance === undefined || nextDueDistance === null
            ? nextDueDistance
            : distanceToMeters({ value: nextDueDistance, unit: distanceUnit });

        const finalNextDueDate = nextDueDate === undefined ? plan.nextDueDate : nextDueDate;
        const finalNextDueDistanceMeters =
          nextDueDistanceMeters === undefined ? plan.nextDueDistanceMeters : nextDueDistanceMeters;
        if (archivePlan !== true && finalNextDueDate === null && finalNextDueDistanceMeters === null) {
          throw new ValidationError({
            message: 'At least one maintenance due target is required for an active plan',
          });
        }
      }

      if (activityId !== undefined) {
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

        const labelSnapshot = activity.name ?? activity.systemKey;
        if (!labelSnapshot) {
          throw new ValidationError({ message: 'Vehicle maintenance activity has no label' });
        }

        return {
          activityId: activity.id,
          planId: plan?.id ?? null,
          labelSnapshot,
          plan,
          nextDueDate,
          nextDueDistanceMeters,
          archivePlan,
        };
      }

      if (label === undefined) {
        throw new ValidationError({ message: 'Each maintenance visit activity needs an activityId or label' });
      }

      return {
        activityId: null,
        planId: null,
        labelSnapshot: label,
        plan: null,
        nextDueDate: undefined,
        nextDueDistanceMeters: undefined,
        archivePlan: undefined,
      };
    }),
  );

  const quickTransaction = quickExpense
    ? (
        await createTransaction({
          userId,
          amount: quickExpense.amount,
          transactionType: TRANSACTION_TYPES.expense,
          paymentType: quickExpense.paymentType,
          accountId: quickExpense.accountId,
          categoryId: quickExpense.categoryId,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          isForecastOnly: false,
          time: new Date(`${quickExpense.date}T00:00:00.000Z`),
          note: quickExpense.note ?? undefined,
          payeeId: quickExpense.payeeId,
        })
      )[0]
    : null;

  for (const activity of activityRows) {
    if (!activity.plan) continue;

    const updates: {
      nextDueDate?: string | null;
      nextDueDistanceMeters?: number | null;
      archivedAt?: Date;
      upcomingNotifiedAt?: null;
      overdueNotifiedAt?: null;
    } = {};
    if (activity.nextDueDate !== undefined) updates.nextDueDate = activity.nextDueDate;
    if (activity.nextDueDistanceMeters !== undefined) {
      updates.nextDueDistanceMeters = activity.nextDueDistanceMeters;
    }
    if (activity.archivePlan === true) updates.archivedAt = new Date();
    if (Object.keys(updates).length === 0) continue;

    updates.upcomingNotifiedAt = null;
    updates.overdueNotifiedAt = null;
    await activity.plan.update(updates, { transaction: sequelizeTx });
    await Notifications.destroy({
      where: Sequelize.and(
        { userId, type: NOTIFICATION_TYPES.vehicleMaintenanceReminder },
        Sequelize.where(Sequelize.literal(`"payload"->>'planId'`), activity.plan.id),
      ),
      transaction: sequelizeTx,
    });
  }

  const visit = await VehicleMaintenanceVisits.create({
    vehicleId,
    serviceDate,
    odometerMeters: odometerMeters ?? null,
    notes: notes ?? null,
  });

  const visitActivities = await VehicleMaintenanceVisitActivities.bulkCreate(
    activityRows.map(({ activityId, planId, labelSnapshot }) => ({
      visitId: visit.id,
      activityId,
      planId,
      labelSnapshot,
    })),
  );

  let transactionLinks: VehicleMaintenanceTransactionLinks[] = [];
  const transactionsToLink = quickTransaction ? [...linkedTransactions, quickTransaction] : linkedTransactions;
  if (transactionsToLink.length > 0) {
    try {
      transactionLinks = await VehicleMaintenanceTransactionLinks.bulkCreate(
        linkedTransactions
          .map((transaction) => ({
            visitId: visit.id,
            transactionId: transaction.id,
            createdByMaintenance: false,
          }))
          .concat(
            quickTransaction
              ? [
                  {
                    visitId: visit.id,
                    transactionId: quickTransaction.id,
                    createdByMaintenance: true,
                  },
                ]
              : [],
          ),
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ValidationError({ message: 'A transaction is already linked to a vehicle maintenance visit' });
      }
      throw error;
    }
    const transactionById = new Map(transactionsToLink.map((transaction) => [transaction.id, transaction]));
    for (const link of transactionLinks) {
      link.transaction = transactionById.get(link.transactionId)!;
    }
  }

  if (
    odometerMeters !== undefined &&
    (vehicle.currentMileageMeters === null || odometerMeters > vehicle.currentMileageMeters)
  ) {
    await vehicle.update({ currentMileageMeters: odometerMeters }, { transaction: sequelizeTx });
  }

  visit.vehicle = vehicle;
  visit.activities = visitActivities;
  visit.transactionLinks = transactionLinks;
  return visit;
};

export const createVehicleMaintenanceVisit = withTransaction(createVehicleMaintenanceVisitImpl);
