import { DistanceOutOfRangeError, distanceToMeters } from '@services/vehicle-maintenance/distance';

export function legacyMileageToMeters({ value }: { value: unknown }): number | undefined {
  if (typeof value === 'string' && value.trim() === '') return undefined;

  const mileage = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(mileage) || mileage < 0) return undefined;

  try {
    return distanceToMeters({ value: mileage, unit: 'km' });
  } catch (error) {
    if (error instanceof DistanceOutOfRangeError) return undefined;
    throw error;
  }
}
