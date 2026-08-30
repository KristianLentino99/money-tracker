import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicleMaintenancePlan } from '@root/serializers/vehicle-maintenance-plans.serializer';
import { createVehicleMaintenancePlan } from '@services/vehicle-maintenance/create-plan.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { isValid, format, parseISO } from 'date-fns';
import { z } from 'zod';

export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((value) => {
    const date = parseISO(value);
    return isValid(date) && format(date, 'yyyy-MM-dd') === value;
  }, 'Date must be a valid calendar date');

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z
    .object({
      activityId: recordId(),
      nextDueDate: dateOnly.optional(),
      nextDueDistance: z.number().finite().min(0).optional(),
      leadDays: z.number().finite().int().min(0).optional(),
      leadDistance: z.number().finite().min(0).optional(),
      currentMileage: z.number().finite().min(0).optional(),
    })
    .refine(({ nextDueDate, nextDueDistance }) => nextDueDate !== undefined || nextDueDistance !== undefined, {
      message: 'At least one maintenance due target is required',
    }),
});

export default createController(schema, async ({ user, params, body }) => {
  const plan = await createVehicleMaintenancePlan({
    userId: user.id,
    vehicleId: params.id,
    ...body,
  });
  const distanceUnit = await getVehicleDistanceUnit({ userId: user.id });

  return {
    data: serializeVehicleMaintenancePlan({
      plan,
      distanceUnit,
      currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
    }),
    statusCode: 201,
  };
});
