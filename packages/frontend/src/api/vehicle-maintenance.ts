import { api } from '@/api/_api';
import { PAYMENT_TYPES, type RecordId } from '@bt/shared/types';

export type DistanceUnit = 'km' | 'mi';
export type MaintenancePlanStatus = 'scheduled' | 'upcoming' | 'overdue';
export type MaintenanceActivitySystemKey =
  | 'inspection'
  | 'scheduled-service'
  | 'oil-change'
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'other';

export interface VehicleMaintenanceActivity {
  id: RecordId;
  systemKey: MaintenanceActivitySystemKey | null;
  name: string | null;
  archivedAt: string | null;
}

export interface VehicleMaintenancePlan {
  id: RecordId;
  vehicleId: RecordId;
  activityId: RecordId;
  activitySystemKey: MaintenanceActivitySystemKey | null;
  activityName: string | null;
  nextDueDate: string | null;
  nextDueDistance: number | null;
  leadDays: number;
  leadDistance: number;
  distanceUnit: DistanceUnit;
  status: MaintenancePlanStatus;
  archivedAt: string | null;
}

export interface VehicleMaintenanceReminder extends VehicleMaintenancePlan {
  planId: RecordId;
  vehicleName: string;
  currentMileage: number | null;
}

export interface VehicleMaintenanceResponse {
  plans: VehicleMaintenancePlan[];
  visits: VehicleMaintenanceVisit[];
}

export interface VehicleMaintenanceVisitActivity {
  id: RecordId;
  activityId: RecordId | null;
  planId: RecordId | null;
  labelSnapshot: string;
}

export interface VehicleMaintenanceVisit {
  id: RecordId;
  vehicleId: RecordId;
  serviceDate: string;
  odometer: number | null;
  distanceUnit: DistanceUnit;
  notes: string | null;
  totalCost: number;
  activities: VehicleMaintenanceVisitActivity[];
  transactionIds: RecordId[];
  generatedTransactionIds: RecordId[];
}

export interface EligibleVehicleMaintenanceTransaction {
  id: RecordId;
  date: string;
  amount: number;
  refAmount: number;
  note: string | null;
  account: { id: RecordId; name: string };
  category: { id: RecordId; name: string } | null;
  payee: { id: RecordId; name: string } | null;
}

export interface CreateVehicleMaintenanceActivityPayload {
  name: string;
}

export interface UpdateVehicleMaintenanceActivityPayload {
  name?: string;
  archived?: boolean;
}

export interface CreateVehicleMaintenancePlanPayload {
  activityId: RecordId;
  nextDueDate?: string | null;
  nextDueDistance?: number | null;
  leadDays?: number;
  leadDistance?: number;
  currentMileage?: number;
}

export interface UpdateVehicleMaintenancePlanPayload {
  nextDueDate?: string | null;
  nextDueDistance?: number | null;
  leadDays?: number;
  leadDistance?: number;
  archived?: boolean;
}

export interface VehicleMaintenanceVisitActivityPayload {
  activityId?: RecordId;
  label?: string;
  planId?: RecordId;
  nextDueDate?: string | null;
  nextDueDistance?: number | null;
  archivePlan?: boolean;
}

export interface VehicleMaintenanceQuickExpensePayload {
  accountId: RecordId;
  amount: number;
  date: string;
  categoryId: RecordId;
  paymentType: PAYMENT_TYPES;
  payeeId?: RecordId | null;
  note?: string | null;
}

export interface CreateVehicleMaintenanceVisitPayload {
  serviceDate: string;
  odometer?: number;
  notes?: string;
  activities: VehicleMaintenanceVisitActivityPayload[];
  transactionIds?: RecordId[];
  quickExpense?: VehicleMaintenanceQuickExpensePayload;
}

export interface UpdateVehicleMaintenanceVisitPayload {
  serviceDate?: string;
  odometer?: number | null;
  notes?: string | null;
  activities?: Array<Pick<VehicleMaintenanceVisitActivityPayload, 'activityId' | 'label'>>;
}

export const getVehicleMaintenanceActivities = async (): Promise<VehicleMaintenanceActivity[]> => {
  return api.get('/vehicle-maintenance/activities');
};

export const createVehicleMaintenanceActivity = async (
  payload: CreateVehicleMaintenanceActivityPayload,
): Promise<VehicleMaintenanceActivity> => {
  return api.post('/vehicle-maintenance/activities', payload);
};

export const updateVehicleMaintenanceActivity = async ({
  id,
  payload,
}: {
  id: RecordId;
  payload: UpdateVehicleMaintenanceActivityPayload;
}): Promise<VehicleMaintenanceActivity> => {
  return api.patch(`/vehicle-maintenance/activities/${id}`, payload);
};

export const getVehicleMaintenance = async ({
  vehicleId,
}: {
  vehicleId: RecordId;
}): Promise<VehicleMaintenanceResponse> => {
  return api.get(`/vehicles/${vehicleId}/maintenance`);
};

export const getVehicleMaintenanceReminders = async (): Promise<VehicleMaintenanceReminder[]> => {
  return api.get('/vehicle-maintenance/reminders');
};

export const getEligibleVehicleMaintenanceTransactions = async (): Promise<EligibleVehicleMaintenanceTransaction[]> => {
  return api.get('/vehicle-maintenance/eligible-transactions');
};

export const createVehicleMaintenancePlan = async ({
  vehicleId,
  payload,
}: {
  vehicleId: RecordId;
  payload: CreateVehicleMaintenancePlanPayload;
}): Promise<VehicleMaintenancePlan> => {
  return api.post(`/vehicles/${vehicleId}/maintenance/plans`, payload);
};

export const updateVehicleMaintenancePlan = async ({
  vehicleId,
  planId,
  payload,
}: {
  vehicleId: RecordId;
  planId: RecordId;
  payload: UpdateVehicleMaintenancePlanPayload;
}): Promise<VehicleMaintenancePlan> => {
  return api.patch(`/vehicles/${vehicleId}/maintenance/plans/${planId}`, payload);
};

export const createVehicleMaintenanceVisit = async ({
  vehicleId,
  payload,
}: {
  vehicleId: RecordId;
  payload: CreateVehicleMaintenanceVisitPayload;
}): Promise<VehicleMaintenanceVisit> => {
  return api.post(`/vehicles/${vehicleId}/maintenance/visits`, payload);
};

export const updateVehicleMaintenanceVisit = async ({
  vehicleId,
  visitId,
  payload,
}: {
  vehicleId: RecordId;
  visitId: RecordId;
  payload: UpdateVehicleMaintenanceVisitPayload;
}): Promise<VehicleMaintenanceVisit> => {
  return api.patch(`/vehicles/${vehicleId}/maintenance/visits/${visitId}`, payload);
};

export const deleteVehicleMaintenanceVisit = async ({
  vehicleId,
  visitId,
  deleteGeneratedExpense = false,
}: {
  vehicleId: RecordId;
  visitId: RecordId;
  deleteGeneratedExpense?: boolean;
}): Promise<{ id: RecordId }> => {
  const shouldDeleteGeneratedExpense = deleteGeneratedExpense === true;
  return api.delete(`/vehicles/${vehicleId}/maintenance/visits/${visitId}`, {
    data: { deleteGeneratedExpense: shouldDeleteGeneratedExpense },
  });
};
