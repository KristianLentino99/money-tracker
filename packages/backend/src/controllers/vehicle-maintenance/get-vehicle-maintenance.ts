import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicleMaintenancePlan } from '@root/serializers/vehicle-maintenance-plans.serializer';
import { serializeVehicleMaintenanceVisit } from '@root/serializers/vehicle-maintenance-visits.serializer';
import { getVehicleMaintenance } from '@services/vehicle-maintenance/get-vehicle-maintenance.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  const [{ plans, visits }, distanceUnit] = await Promise.all([
    getVehicleMaintenance({ userId: user.id, vehicleId: params.id }),
    getVehicleDistanceUnit({ userId: user.id }),
  ]);

  return {
    data: {
      plans: plans.map((plan) =>
        serializeVehicleMaintenancePlan({
          plan,
          distanceUnit,
          currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
        }),
      ),
      visits: visits.map((visit) => serializeVehicleMaintenanceVisit({ visit, distanceUnit })),
    },
  };
});
