import { ACCOUNT_STATUSES, NOTIFICATION_TYPES } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import { namespace } from '@models/connection';
import Notifications from '@models/notifications.model';
import VehicleMaintenanceActivities from '@models/vehicle-maintenance-activities.model';
import VehicleMaintenancePlans from '@models/vehicle-maintenance-plans.model';
import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';
import {
  resolveVehicleMaintenancePlanStatus,
  type MaintenancePlanStatus,
} from '@services/vehicle-maintenance/resolve-plan-status';

interface GetVehicleMaintenanceRemindersParams {
  userId: number;
}

const STATUS_ORDER: Record<MaintenancePlanStatus, number> = {
  overdue: 0,
  upcoming: 1,
  scheduled: 2,
};

function compareNullable<T extends number | string>(a: T | null, b: T | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function getReminderStatus(plan: VehicleMaintenancePlans): MaintenancePlanStatus {
  return resolveVehicleMaintenancePlanStatus({
    nextDueDate: plan.nextDueDate,
    nextDueDistanceMeters: plan.nextDueDistanceMeters,
    leadDays: plan.leadDays,
    leadDistanceMeters: plan.leadDistanceMeters,
    currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
  });
}

function compareReminders(a: VehicleMaintenancePlans, b: VehicleMaintenancePlans): number {
  const statusA = getReminderStatus(a);
  const statusB = getReminderStatus(b);
  const statusOrder = STATUS_ORDER[statusA] - STATUS_ORDER[statusB];
  if (statusOrder !== 0) return statusOrder;

  const dueDateOrder = compareNullable(a.nextDueDate, b.nextDueDate);
  if (dueDateOrder !== 0) return dueDateOrder;

  const dueDistanceOrder = compareNullable(a.nextDueDistanceMeters, b.nextDueDistanceMeters);
  if (dueDistanceOrder !== 0) return dueDistanceOrder;

  const vehicleOrder = String(a.vehicleId).localeCompare(String(b.vehicleId));
  if (vehicleOrder !== 0) return vehicleOrder;

  return String(a.id).localeCompare(String(b.id));
}

async function createReminderNotificationIfNeeded({
  plan,
  userId,
  status,
}: {
  plan: VehicleMaintenancePlans;
  userId: number;
  status: 'upcoming' | 'overdue';
}): Promise<void> {
  const sequelizeTx = namespace.get('transaction');
  const alreadyNotified = status === 'upcoming' ? plan.upcomingNotifiedAt : plan.overdueNotifiedAt;
  if (alreadyNotified) return;

  await Notifications.create(
    {
      userId,
      type: NOTIFICATION_TYPES.vehicleMaintenanceReminder,
      title: 'Vehicle maintenance reminder',
      message: null,
      payload: {
        planId: plan.id,
        vehicleId: plan.vehicleId,
        reminderStatus: status,
      },
    },
    { transaction: sequelizeTx },
  );

  const notifiedAt = new Date();
  if (status === 'upcoming') {
    await plan.update({ upcomingNotifiedAt: notifiedAt }, { transaction: sequelizeTx });
  } else {
    await plan.update({ overdueNotifiedAt: notifiedAt }, { transaction: sequelizeTx });
  }
}

export const getVehicleMaintenanceReminders = withTransaction(
  async ({ userId }: GetVehicleMaintenanceRemindersParams) => {
    const sequelizeTx = namespace.get('transaction');
    const plans = await VehicleMaintenancePlans.findAll({
      where: { archivedAt: null },
      transaction: sequelizeTx,
      lock: sequelizeTx?.LOCK.UPDATE,
      include: [
        { model: VehicleMaintenanceActivities, required: true },
        {
          model: Vehicles,
          required: true,
          where: { userId },
          include: [{ model: Accounts, required: true, where: { status: ACCOUNT_STATUSES.active } }],
        },
      ],
    });

    const reminders = plans
      .filter((plan) => {
        const status = getReminderStatus(plan);
        return status === 'upcoming' || status === 'overdue';
      })
      .toSorted(compareReminders);

    for (const plan of reminders) {
      const status = getReminderStatus(plan);
      if (status === 'upcoming' || status === 'overdue') {
        await createReminderNotificationIfNeeded({ plan, userId, status });
      }
    }

    return reminders;
  },
);
