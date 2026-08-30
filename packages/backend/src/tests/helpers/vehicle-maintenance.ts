import type { RecordId } from '@bt/shared/types';

import { makeRequest } from './common';

export type MaintenanceActivitySystemKey =
  | 'inspection'
  | 'scheduled-service'
  | 'oil-change'
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'other';

export interface MaintenanceActivityApiResponse {
  id: RecordId;
  systemKey: MaintenanceActivitySystemKey | null;
  name: string | null;
  archivedAt: string | null;
}

export type MaintenancePlanStatus = 'scheduled' | 'upcoming' | 'overdue';

export interface MaintenancePlanApiResponse {
  id: RecordId;
  vehicleId: RecordId;
  activityId: RecordId;
  activitySystemKey: MaintenanceActivitySystemKey | null;
  activityName: string | null;
  nextDueDate: string | null;
  nextDueDistance: number | null;
  leadDays: number;
  leadDistance: number;
  distanceUnit: 'km' | 'mi';
  status: MaintenancePlanStatus;
  archivedAt: string | null;
}

export interface VehicleMaintenanceApiResponse {
  plans: MaintenancePlanApiResponse[];
  visits: MaintenanceVisitApiResponse[];
}

export interface MaintenanceReminderApiResponse extends MaintenancePlanApiResponse {
  planId: RecordId;
  vehicleName: string;
  currentMileage: number | null;
}

export interface EligibleMaintenanceTransactionApiResponse {
  id: RecordId;
  date: string;
  amount: number;
  refAmount: number;
  note: string | null;
  account: {
    id: RecordId;
    name: string;
  };
  category: {
    id: RecordId;
    name: string;
  } | null;
  payee: {
    id: RecordId;
    name: string;
  } | null;
}

export interface MaintenanceVisitActivityApiResponse {
  id: RecordId;
  activityId: RecordId | null;
  planId: RecordId | null;
  labelSnapshot: string;
}

export interface MaintenanceVisitApiResponse {
  id: RecordId;
  vehicleId: RecordId;
  serviceDate: string;
  odometer: number | null;
  distanceUnit: 'km' | 'mi';
  notes: string | null;
  totalCost: number;
  activities: MaintenanceVisitActivityApiResponse[];
  transactionIds: RecordId[];
  generatedTransactionIds: RecordId[];
}

export function getMaintenanceActivities<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<MaintenanceActivityApiResponse[], R>({
    method: 'get',
    url: '/vehicle-maintenance/activities',
    raw,
  });
}

export function createMaintenanceActivity<R extends boolean | undefined = undefined>({
  name,
  raw,
}: {
  name: string;
  raw?: R;
}) {
  return makeRequest<MaintenanceActivityApiResponse, R>({
    method: 'post',
    url: '/vehicle-maintenance/activities',
    payload: { name },
    raw,
  });
}

export function updateMaintenanceActivity<R extends boolean | undefined = undefined>({
  id,
  name,
  archived,
  raw,
}: {
  id: string;
  name?: string;
  archived?: boolean;
  raw?: R;
}) {
  return makeRequest<MaintenanceActivityApiResponse, R>({
    method: 'patch',
    url: `/vehicle-maintenance/activities/${id}`,
    payload: {
      ...(name !== undefined ? { name } : {}),
      ...(archived !== undefined ? { archived } : {}),
    },
    raw,
  });
}

export function createMaintenancePlan<R extends boolean | undefined = undefined>({
  vehicleId,
  activityId,
  nextDueDate,
  nextDueDistance,
  leadDays,
  leadDistance,
  currentMileage,
  raw,
}: {
  vehicleId: string;
  activityId: string;
  nextDueDate?: string;
  nextDueDistance?: number;
  leadDays?: number;
  leadDistance?: number;
  currentMileage?: number;
  raw?: R;
}) {
  return makeRequest<MaintenancePlanApiResponse, R>({
    method: 'post',
    url: `/vehicles/${vehicleId}/maintenance/plans`,
    payload: {
      activityId,
      ...(nextDueDate !== undefined ? { nextDueDate } : {}),
      ...(nextDueDistance !== undefined ? { nextDueDistance } : {}),
      ...(leadDays !== undefined ? { leadDays } : {}),
      ...(leadDistance !== undefined ? { leadDistance } : {}),
      ...(currentMileage !== undefined ? { currentMileage } : {}),
    },
    raw,
  });
}

export function getVehicleMaintenance<R extends boolean | undefined = undefined>({
  vehicleId,
  raw,
}: {
  vehicleId: string;
  raw?: R;
}) {
  return makeRequest<VehicleMaintenanceApiResponse, R>({
    method: 'get',
    url: `/vehicles/${vehicleId}/maintenance`,
    raw,
  });
}

export function updateMaintenancePlan<R extends boolean | undefined = undefined>({
  vehicleId,
  planId,
  nextDueDate,
  nextDueDistance,
  leadDays,
  leadDistance,
  archived,
  raw,
}: {
  vehicleId: string;
  planId: string;
  nextDueDate?: string | null;
  nextDueDistance?: number | null;
  leadDays?: number;
  leadDistance?: number;
  archived?: boolean;
  raw?: R;
}) {
  return makeRequest<MaintenancePlanApiResponse, R>({
    method: 'patch',
    url: `/vehicles/${vehicleId}/maintenance/plans/${planId}`,
    payload: {
      ...(nextDueDate !== undefined ? { nextDueDate } : {}),
      ...(nextDueDistance !== undefined ? { nextDueDistance } : {}),
      ...(leadDays !== undefined ? { leadDays } : {}),
      ...(leadDistance !== undefined ? { leadDistance } : {}),
      ...(archived !== undefined ? { archived } : {}),
    },
    raw,
  });
}

export function createMaintenanceVisit<R extends boolean | undefined = undefined>({
  vehicleId,
  serviceDate,
  odometer,
  notes,
  activities,
  transactionIds,
  quickExpense,
  raw,
}: {
  vehicleId: string;
  serviceDate: string;
  odometer?: number;
  notes?: string;
  activities: Array<{
    activityId?: string;
    label?: string;
    planId?: string;
    nextDueDate?: string | null;
    nextDueDistance?: number | null;
    archivePlan?: boolean;
  }>;
  transactionIds?: string[];
  quickExpense?: {
    accountId: string;
    amount: number;
    date: string;
    categoryId: string;
    paymentType: string;
    payeeId?: string | null;
    note?: string;
  };
  raw?: R;
}) {
  return makeRequest<MaintenanceVisitApiResponse, R>({
    method: 'post',
    url: `/vehicles/${vehicleId}/maintenance/visits`,
    payload: {
      serviceDate,
      ...(odometer !== undefined ? { odometer } : {}),
      ...(notes !== undefined ? { notes } : {}),
      activities,
      ...(transactionIds !== undefined ? { transactionIds } : {}),
      ...(quickExpense !== undefined ? { quickExpense } : {}),
    },
    raw,
  });
}

export function updateMaintenanceVisit<R extends boolean | undefined = undefined>({
  vehicleId,
  visitId,
  serviceDate,
  odometer,
  notes,
  activities,
  raw,
}: {
  vehicleId: string;
  visitId: string;
  serviceDate?: string;
  odometer?: number | null;
  notes?: string | null;
  activities?: Array<{
    activityId?: string;
    label?: string;
  }>;
  raw?: R;
}) {
  return makeRequest<MaintenanceVisitApiResponse, R>({
    method: 'patch',
    url: `/vehicles/${vehicleId}/maintenance/visits/${visitId}`,
    payload: {
      ...(serviceDate !== undefined ? { serviceDate } : {}),
      ...(odometer !== undefined ? { odometer } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(activities !== undefined ? { activities } : {}),
    },
    raw,
  });
}

export function deleteMaintenanceVisit<R extends boolean | undefined = undefined>({
  vehicleId,
  visitId,
  deleteGeneratedExpense,
  raw,
}: {
  vehicleId: string;
  visitId: string;
  deleteGeneratedExpense?: boolean;
  raw?: R;
}) {
  return makeRequest<{ id: RecordId }, R>({
    method: 'delete',
    url: `/vehicles/${vehicleId}/maintenance/visits/${visitId}`,
    payload: deleteGeneratedExpense === undefined ? {} : { deleteGeneratedExpense },
    raw,
  });
}

export function getMaintenanceReminders<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<MaintenanceReminderApiResponse[], R>({
    method: 'get',
    url: '/vehicle-maintenance/reminders',
    raw,
  });
}

export function getEligibleMaintenanceTransactions<R extends boolean | undefined = undefined>({
  raw,
}: { raw?: R } = {}) {
  return makeRequest<EligibleMaintenanceTransactionApiResponse[], R>({
    method: 'get',
    url: '/vehicle-maintenance/eligible-transactions',
    raw,
  });
}
