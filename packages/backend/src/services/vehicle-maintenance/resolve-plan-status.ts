import { addDays, format, parseISO } from 'date-fns';

export type MaintenancePlanStatus = 'scheduled' | 'upcoming' | 'overdue';

interface ResolveVehicleMaintenancePlanStatusParams {
  nextDueDate: string | null;
  nextDueDistanceMeters: number | null;
  leadDays: number;
  leadDistanceMeters: number;
  currentMileageMeters: number | null;
  /** The UTC calendar day used for date-only comparisons. */
  today?: string;
}

const STATUS_PRIORITY: Record<MaintenancePlanStatus, number> = {
  scheduled: 0,
  upcoming: 1,
  overdue: 2,
};

function mostUrgentStatus({
  current,
  candidate,
}: {
  current: MaintenancePlanStatus;
  candidate: MaintenancePlanStatus;
}): MaintenancePlanStatus {
  return STATUS_PRIORITY[candidate] > STATUS_PRIORITY[current] ? candidate : current;
}

function resolveDateStatus({
  dueDate,
  leadDays,
  today,
}: {
  dueDate: string;
  leadDays: number;
  today: string;
}): MaintenancePlanStatus {
  if (dueDate < today) return 'overdue';

  const upcomingThrough = format(addDays(parseISO(today), leadDays), 'yyyy-MM-dd');
  return dueDate <= upcomingThrough ? 'upcoming' : 'scheduled';
}

function resolveDistanceStatus({
  dueDistanceMeters,
  leadDistanceMeters,
  currentMileageMeters,
}: {
  dueDistanceMeters: number;
  leadDistanceMeters: number;
  currentMileageMeters: number;
}): MaintenancePlanStatus {
  if (currentMileageMeters >= dueDistanceMeters) return 'overdue';
  return currentMileageMeters + leadDistanceMeters >= dueDistanceMeters ? 'upcoming' : 'scheduled';
}

export function resolveVehicleMaintenancePlanStatus({
  nextDueDate,
  nextDueDistanceMeters,
  leadDays,
  leadDistanceMeters,
  currentMileageMeters,
  today = new Date().toISOString().slice(0, 10),
}: ResolveVehicleMaintenancePlanStatusParams): MaintenancePlanStatus {
  let status: MaintenancePlanStatus = 'scheduled';

  if (nextDueDate) {
    status = mostUrgentStatus({
      current: status,
      candidate: resolveDateStatus({ dueDate: nextDueDate, leadDays, today }),
    });
  }

  if (nextDueDistanceMeters != null && currentMileageMeters != null) {
    status = mostUrgentStatus({
      current: status,
      candidate: resolveDistanceStatus({
        dueDistanceMeters: nextDueDistanceMeters,
        leadDistanceMeters,
        currentMileageMeters,
      }),
    });
  }

  return status;
}
