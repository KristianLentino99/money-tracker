/**
 * Vehicle Serializers
 *
 * Vehicle responses include the underlying Account inline so the frontend has
 * one round-trip to render a vehicle card / detail (name, currency, current
 * value all come from Accounts; metadata + depreciation params come from
 * Vehicles).
 */
import { DEPRECIATION_PRESET, type RecordId, VEHICLE_CLASS } from '@bt/shared/types';
import { centsToApiDecimal, centsToApiDecimalOrNull } from '@common/types/money';
import type Vehicles from '@models/vehicles.model';
import { serializeAccount, type AccountApiResponse } from '@root/serializers/accounts.serializer';
import { metersToDistance, type DistanceUnit } from '@services/vehicle-maintenance/distance';

export interface VehicleApiResponse {
  id: string;
  accountId: RecordId;
  userId: number;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  vehicleClass: VEHICLE_CLASS;
  purchasePrice: number;
  purchaseDate: string;
  valueAnchor: number | null;
  valueAnchorDate: string | null;
  depreciationPreset: DEPRECIATION_PRESET;
  customAnnualRatePct: number | null;
  salvageFloorPct: number;
  currentMileage: number | null;
  distanceUnit: DistanceUnit;
  valueLastComputedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: AccountApiResponse | null;
}

export function serializeVehicle(
  vehicle: Vehicles,
  { distanceUnit = 'km' }: { distanceUnit?: DistanceUnit } = {},
): VehicleApiResponse {
  return {
    id: vehicle.id,
    accountId: vehicle.accountId,
    userId: vehicle.userId,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    year: vehicle.year,
    vehicleClass: vehicle.vehicleClass,
    purchasePrice: centsToApiDecimal(vehicle.purchasePrice),
    purchaseDate: vehicle.purchaseDate,
    valueAnchor: centsToApiDecimalOrNull(vehicle.valueAnchor),
    valueAnchorDate: vehicle.valueAnchorDate,
    depreciationPreset: vehicle.depreciationPreset,
    customAnnualRatePct: vehicle.customAnnualRatePct ? Number(vehicle.customAnnualRatePct) : null,
    salvageFloorPct: Number(vehicle.salvageFloorPct),
    currentMileage:
      vehicle.currentMileageMeters == null
        ? null
        : metersToDistance({ meters: vehicle.currentMileageMeters, unit: distanceUnit }),
    distanceUnit,
    valueLastComputedAt: vehicle.valueLastComputedAt ? vehicle.valueLastComputedAt.toISOString() : null,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
    account: vehicle.account ? serializeAccount(vehicle.account) : null,
  };
}

export function serializeVehicles(
  vehicles: Vehicles[],
  { distanceUnit = 'km' }: { distanceUnit?: DistanceUnit } = {},
): VehicleApiResponse[] {
  return vehicles.map((vehicle) => serializeVehicle(vehicle, { distanceUnit }));
}
