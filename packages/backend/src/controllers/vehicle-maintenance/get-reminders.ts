import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicleMaintenanceReminder } from '@root/serializers/vehicle-maintenance-reminders.serializer';
import { getVehicleMaintenanceReminders } from '@services/vehicle-maintenance/get-reminders.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const [plans, distanceUnit] = await Promise.all([
    getVehicleMaintenanceReminders({ userId: user.id }),
    getVehicleDistanceUnit({ userId: user.id }),
  ]);

  return {
    data: plans.map((plan) => serializeVehicleMaintenanceReminder({ plan, distanceUnit })),
  };
});
