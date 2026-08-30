import { ValidationError } from '@js/errors';

export type DistanceUnit = 'km' | 'mi';

export const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

export class DistanceOutOfRangeError extends RangeError {
  constructor() {
    super('Distance is outside the range supported by PostgreSQL BIGINT');
    this.name = 'DistanceOutOfRangeError';
  }
}

export function distanceToMetersForApi({ value, unit }: { value: number; unit: DistanceUnit }): number {
  try {
    return distanceToMeters({ value, unit });
  } catch (error) {
    if (error instanceof DistanceOutOfRangeError) {
      throw new ValidationError({ message: error.message });
    }
    throw error;
  }
}

const METERS_PER_UNIT: Record<DistanceUnit, number> = {
  km: 1000,
  mi: 1609.344,
};

function assertValidDistance({ value }: { value: number }) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Distance must be a finite, non-negative number');
  }
}

function assertRepresentableMeters({ meters }: { meters: number }) {
  if (!Number.isSafeInteger(meters) || BigInt(meters) > POSTGRES_BIGINT_MAX) {
    throw new DistanceOutOfRangeError();
  }
}

function metersPerUnit({ unit }: { unit: DistanceUnit }) {
  const meters = METERS_PER_UNIT[unit];
  if (meters === undefined) {
    throw new RangeError(`Unsupported distance unit: ${String(unit)}`);
  }

  return meters;
}

export function distanceToMeters({ value, unit }: { value: number; unit: DistanceUnit }): number {
  assertValidDistance({ value });
  const meters = Math.round(value * metersPerUnit({ unit }));
  assertRepresentableMeters({ meters });
  return meters;
}

export function metersToDistance({ meters, unit }: { meters: number; unit: DistanceUnit }): number {
  assertValidDistance({ value: meters });
  assertRepresentableMeters({ meters });
  const distance = meters / metersPerUnit({ unit });
  return Math.round((distance + Number.EPSILON) * 1000) / 1000;
}
