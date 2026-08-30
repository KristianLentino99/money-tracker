import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicleMaintenancePlan } from '@root/serializers/vehicle-maintenance-plans.serializer';
import { updateVehicleMaintenancePlan } from '@services/vehicle-maintenance/update-plan.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { z } from 'zod';

import { dateOnly } from './create-plan';

const schema = z.object({
  params: z.object({ id: recordId(), planId: recordId() }),
  body: z.object({
    nextDueDate: dateOnly.nullable().optional(),
    nextDueDistance: z.number().finite().min(0).nullable().optional(),
    leadDays: z.number().finite().int().min(0).optional(),
    leadDistance: z.number().finite().min(0).optional(),
    archived: z.boolean().optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const plan = await updateVehicleMaintenancePlan({
    userId: user.id,
    vehicleId: params.id,
    planId: params.planId,
    ...body,
  });
  const distanceUnit = await getVehicleDistanceUnit({ userId: user.id });

  return {
    data: serializeVehicleMaintenancePlan({
      plan,
      distanceUnit,
      currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
    }),
  };
});
