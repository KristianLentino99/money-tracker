import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicle } from '@root/serializers/vehicles.serializer';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { updateVehicle } from '@services/vehicles/update-vehicle.service';
import { updateVehicleBodySchema, vehicleIdParamsSchema } from '@services/vehicles/zod-schemas';
import { z } from 'zod';

export const schema = z.object({
  params: vehicleIdParamsSchema,
  body: updateVehicleBodySchema,
});

export default createController(schema, async ({ user, params, body }) => {
  const distanceUnit = await getVehicleDistanceUnit({ userId: user.id });
  const vehicle = await updateVehicle({
    userId: user.id,
    vehicleId: params.id,
    ...body,
  });
  return { data: vehicle ? serializeVehicle(vehicle, { distanceUnit }) : null };
});
