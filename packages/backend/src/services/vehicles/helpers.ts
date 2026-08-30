import type { RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Vehicles from '@models/vehicles.model';
import { getUserSettings } from '@services/user-settings/get-user-settings';
import type { DistanceUnit } from '@services/vehicle-maintenance/distance';
import { type FindOptions } from 'sequelize';

/**
 * Load a user's vehicle by id, throwing NotFoundError when it does not exist or
 * belongs to another user. The `where` clause is fixed to scope by owner; extra
 * find options (e.g. `attributes` to narrow the columns loaded) pass through.
 */
export const findVehicleOrThrow = async ({
  vehicleId,
  userId,
  ...options
}: { vehicleId: string | RecordId; userId: number } & Omit<FindOptions<Vehicles>, 'where'>) => {
  const id = vehicleId as RecordId;
  return findOrThrowNotFound({
    query: Vehicles.findOne({ where: { id, userId }, ...options }),
    message: t({ key: 'vehicles.notFound' }),
  });
};

export const getVehicleDistanceUnit = async ({ userId }: { userId: number }): Promise<DistanceUnit> => {
  const settings = await getUserSettings({ userId });
  return settings.distanceUnit === 'mi' ? 'mi' : 'km';
};

export const assertVehicleMileageIsMonotonic = ({
  currentMileageMeters,
  nextMileageMeters,
}: {
  currentMileageMeters: number | null;
  nextMileageMeters: number | null;
}) => {
  if (currentMileageMeters !== null && (nextMileageMeters === null || nextMileageMeters < currentMileageMeters)) {
    throw new ValidationError({ message: 'Vehicle mileage cannot be lower than its current odometer' });
  }
};
