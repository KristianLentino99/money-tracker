import type { APIRequestContext } from '@playwright/test';

import { API_BASE_URL, apiDelete, apiPost } from './api-client';

export type VehicleMaintenanceActivitySystemKey =
  | 'inspection'
  | 'scheduled-service'
  | 'oil-change'
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'other';

export interface VehicleFixture {
  id: string;
  name: string;
  accountId: string;
  currentMileage: number | null;
}

export interface MaintenanceActivityFixture {
  id: string;
  systemKey: VehicleMaintenanceActivitySystemKey | null;
  name: string | null;
  archivedAt: string | null;
}

export interface MaintenancePlanFixture {
  id: string;
  vehicleId: string;
  activityId: string;
  activitySystemKey: VehicleMaintenanceActivitySystemKey | null;
  activityName: string | null;
  nextDueDate: string | null;
  nextDueDistance: number | null;
  leadDays: number;
  leadDistance: number;
  distanceUnit: 'km' | 'mi';
  status: 'scheduled' | 'upcoming' | 'overdue';
  archivedAt: string | null;
}

export interface MaintenanceVisitFixture {
  id: string;
  vehicleId: string;
  serviceDate: string;
  odometer: number | null;
  distanceUnit: 'km' | 'mi';
  notes: string | null;
  totalCost: number;
  activities: Array<{
    id: string;
    activityId: string | null;
    planId: string | null;
    labelSnapshot: string;
  }>;
  transactionIds: string[];
  generatedTransactionIds: string[];
}

export interface VehicleMaintenanceResponseFixture {
  plans: MaintenancePlanFixture[];
  visits: MaintenanceVisitFixture[];
}

export interface MaintenanceReminderFixture extends MaintenancePlanFixture {
  planId: string;
  vehicleName: string;
  currentMileage: number | null;
}

function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'response' in body) {
    return (body as { response: T }).response;
  }
  return body as T;
}

async function apiGet<T>({ request, path }: { request: APIRequestContext; path: string }): Promise<T> {
  const response = await request.get(`${API_BASE_URL}${path}`);
  if (!response.ok()) {
    throw new Error(`API GET ${path} failed: ${response.status()} ${await response.text()}`);
  }
  return unwrap<T>(await response.json());
}

export async function createVehicleFixture({
  request,
  name,
  make = 'Toyota',
  model = 'Corolla',
  year = 2022,
  vehicleClass = 'sedan',
  purchasePrice = 20_000,
  purchaseDate = '2022-01-01',
  currentMileage = null,
  currencyCode = 'USD',
}: {
  request: APIRequestContext;
  name: string;
  make?: string;
  model?: string;
  year?: number;
  vehicleClass?: 'sedan' | 'suv' | 'truck' | 'luxury' | 'ev' | 'motorcycle' | 'other';
  purchasePrice?: number;
  purchaseDate?: string;
  currentMileage?: number | null;
  currencyCode?: string;
}): Promise<VehicleFixture> {
  const body = await apiPost({
    request,
    path: '/api/v1/vehicles',
    data: {
      name,
      currencyCode,
      make,
      model,
      year,
      vehicleClass,
      purchasePrice,
      purchaseDate,
      depreciationPreset: 'class-default',
      salvageFloorPct: 10,
      currentMileage,
    },
  });
  const vehicle = unwrap<{ id: string; accountId: string; currentMileage: number | null }>(body);
  // The API keeps the display name on the inline account, while the UI renders
  // it as the vehicle heading. Preserve the fixture input for stable locators.
  return {
    id: vehicle.id,
    name,
    accountId: vehicle.accountId,
    currentMileage: vehicle.currentMileage,
  };
}

export async function getMaintenanceActivitiesFixture({
  request,
}: {
  request: APIRequestContext;
}): Promise<MaintenanceActivityFixture[]> {
  return apiGet({ request, path: '/api/v1/vehicle-maintenance/activities' });
}

export async function createMaintenanceActivityFixture({
  request,
  name,
}: {
  request: APIRequestContext;
  name: string;
}): Promise<MaintenanceActivityFixture> {
  const body = await apiPost({
    request,
    path: '/api/v1/vehicle-maintenance/activities',
    data: { name },
  });
  return unwrap<MaintenanceActivityFixture>(body);
}

export async function createMaintenancePlanFixture({
  request,
  vehicleId,
  activityId,
  nextDueDate,
  nextDueDistance,
  leadDays,
  leadDistance,
  currentMileage,
}: {
  request: APIRequestContext;
  vehicleId: string;
  activityId: string;
  nextDueDate?: string;
  nextDueDistance?: number;
  leadDays?: number;
  leadDistance?: number;
  currentMileage?: number;
}): Promise<MaintenancePlanFixture> {
  const body = await apiPost({
    request,
    path: `/api/v1/vehicles/${vehicleId}/maintenance/plans`,
    data: {
      activityId,
      ...(nextDueDate !== undefined ? { nextDueDate } : {}),
      ...(nextDueDistance !== undefined ? { nextDueDistance } : {}),
      ...(leadDays !== undefined ? { leadDays } : {}),
      ...(leadDistance !== undefined ? { leadDistance } : {}),
      ...(currentMileage !== undefined ? { currentMileage } : {}),
    },
  });
  return unwrap<MaintenancePlanFixture>(body);
}

export async function getVehicleMaintenanceFixture({
  request,
  vehicleId,
}: {
  request: APIRequestContext;
  vehicleId: string;
}): Promise<VehicleMaintenanceResponseFixture> {
  return apiGet({ request, path: `/api/v1/vehicles/${vehicleId}/maintenance` });
}

export async function createMaintenanceVisitFixture({
  request,
  vehicleId,
  serviceDate,
  odometer,
  notes,
  activities,
  transactionIds,
  quickExpense,
}: {
  request: APIRequestContext;
  vehicleId: string;
  serviceDate: string;
  odometer?: number;
  notes?: string;
  activities: Array<{
    activityId?: string;
    label?: string;
    planId?: string;
    nextDueDate?: string;
    nextDueDistance?: number;
    archivePlan?: boolean;
  }>;
  transactionIds?: string[];
  quickExpense?: {
    accountId: string;
    amount: number;
    date: string;
    categoryId: string;
    paymentType: 'creditCard' | 'debitCard' | 'bankTransfer' | 'voucher' | 'webPayment' | 'cash' | 'mobilePayment';
    note?: string;
  };
}): Promise<MaintenanceVisitFixture> {
  const body = await apiPost({
    request,
    path: `/api/v1/vehicles/${vehicleId}/maintenance/visits`,
    data: {
      serviceDate,
      ...(odometer !== undefined ? { odometer } : {}),
      ...(notes !== undefined ? { notes } : {}),
      activities,
      ...(transactionIds !== undefined ? { transactionIds } : {}),
      ...(quickExpense !== undefined ? { quickExpense } : {}),
    },
  });
  return unwrap<MaintenanceVisitFixture>(body);
}

export async function deleteMaintenanceVisitFixture({
  request,
  vehicleId,
  visitId,
  deleteGeneratedExpense,
}: {
  request: APIRequestContext;
  vehicleId: string;
  visitId: string;
  deleteGeneratedExpense?: boolean;
}): Promise<void> {
  await apiDelete({
    request,
    path: `/api/v1/vehicles/${vehicleId}/maintenance/visits/${visitId}`,
    data: deleteGeneratedExpense === undefined ? undefined : { deleteGeneratedExpense },
  });
}

export async function getMaintenanceRemindersFixture({
  request,
}: {
  request: APIRequestContext;
}): Promise<MaintenanceReminderFixture[]> {
  return apiGet({ request, path: '/api/v1/vehicle-maintenance/reminders' });
}

export async function getTransactionIfPresent({
  request,
  id,
}: {
  request: APIRequestContext;
  id: string;
}): Promise<unknown | null> {
  const response = await request.get(`${API_BASE_URL}/api/v1/transactions/${id}`);
  if (response.status() === 404) return null;
  if (!response.ok()) {
    throw new Error(`API GET transaction ${id} failed: ${response.status()} ${await response.text()}`);
  }
  return unwrap(await response.json());
}
