import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import { namespace } from '@models/connection';
import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';
import { distanceToMetersForApi as distanceToMeters } from '@services/vehicle-maintenance/distance';

import { assertVehicleMileageIsMonotonic, findVehicleOrThrow, getVehicleDistanceUnit } from './helpers';
import { refreshVehicleValueIfStale } from './refresh-vehicle-value.service';

interface UpdateVehicleParams {
  userId: number;
  vehicleId: string;
  name?: string;
  make?: string;
  model?: string;
  trim?: string | null;
  year?: number;
  vehicleClass?: VEHICLE_CLASS;
  depreciationPreset?: DEPRECIATION_PRESET;
  customAnnualRatePct?: number | null;
  salvageFloorPct?: number;
  currentMileage?: number | null;
}

const updateVehicleImpl = async (params: UpdateVehicleParams) => {
  const { userId, vehicleId, name, currentMileage, ...rest } = params;

  const sequelizeTx = namespace.get('transaction');
  const vehicle = await findVehicleOrThrow({
    vehicleId,
    userId,
    transaction: sequelizeTx,
    lock: sequelizeTx?.LOCK.UPDATE,
  });

  const currentCustomRate = vehicle.customAnnualRatePct ? Number(vehicle.customAnnualRatePct) : null;
  const currentSalvageFloor = Number(vehicle.salvageFloorPct);
  const curveAffectingChange =
    (rest.vehicleClass !== undefined && rest.vehicleClass !== vehicle.vehicleClass) ||
    (rest.depreciationPreset !== undefined && rest.depreciationPreset !== vehicle.depreciationPreset) ||
    (rest.customAnnualRatePct !== undefined && rest.customAnnualRatePct !== currentCustomRate) ||
    (rest.salvageFloorPct !== undefined && rest.salvageFloorPct !== currentSalvageFloor);

  // If the user switched to custom preset, an annual rate must be present
  // (either supplied in this update or already stored).
  const resolvedPreset = rest.depreciationPreset ?? vehicle.depreciationPreset;
  const resolvedCustomRate =
    rest.customAnnualRatePct !== undefined
      ? rest.customAnnualRatePct
      : vehicle.customAnnualRatePct
        ? Number(vehicle.customAnnualRatePct)
        : null;

  if (resolvedPreset === DEPRECIATION_PRESET.custom && resolvedCustomRate == null) {
    throw new ValidationError({
      message: 'customAnnualRatePct is required when depreciationPreset = custom',
    });
  }

  let mileageUpdate: { currentMileageMeters?: number | null } = {};

  if (currentMileage !== undefined) {
    const currentMileageMeters =
      currentMileage === null
        ? null
        : distanceToMeters({ value: currentMileage, unit: await getVehicleDistanceUnit({ userId }) });
    mileageUpdate = { currentMileageMeters };
    assertVehicleMileageIsMonotonic({
      currentMileageMeters: vehicle.currentMileageMeters,
      nextMileageMeters: currentMileageMeters,
    });
  }

  await vehicle.update({ ...rest, ...mileageUpdate }, { transaction: sequelizeTx });

  if (name !== undefined) {
    await Accounts.update({ name }, { where: { id: vehicle.accountId, userId }, transaction: sequelizeTx });
  }

  if (curveAffectingChange) {
    await refreshVehicleValueIfStale({ vehicleId, force: true });
  }

  return Vehicles.findByPk(vehicleId, {
    include: [{ model: Accounts }],
  });
};

export const updateVehicle = withTransaction(updateVehicleImpl);
