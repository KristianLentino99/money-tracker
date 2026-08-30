import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicle } from '@root/serializers/vehicles.serializer';
import { getVehicle } from '@services/vehicles/get-vehicle.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId() }),
});

export default createController(schema, async ({ user, params }) => {
  const distanceUnit = await getVehicleDistanceUnit({ userId: user.id });
  const vehicle = await getVehicle({ userId: user.id, vehicleId: params.id });
  return { data: vehicle ? serializeVehicle(vehicle, { distanceUnit }) : null };
});
