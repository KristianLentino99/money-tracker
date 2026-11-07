import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicle } from '@root/serializers/vehicles.serializer';
import { createVehicle } from '@services/vehicles/create-vehicle.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { createVehicleBodySchema } from '@services/vehicles/zod-schemas';
import { z } from 'zod';

export const schema = z.object({
  body: createVehicleBodySchema,
});

export default createController(schema, async ({ user, body }) => {
  const distanceUnit = await getVehicleDistanceUnit({ userId: user.id });
  const vehicle = await createVehicle({
    userId: user.id,
    ...body,
  });

  return {
    data: vehicle ? serializeVehicle(vehicle, { distanceUnit }) : null,
    statusCode: 201,
  };
});
