import { createController } from '@controllers/helpers/controller-factory';
import { createVehicleMaintenanceActivity } from '@services/vehicle-maintenance/create-activity.service';
import { z } from 'zod';

import { serializeVehicleMaintenanceActivity } from './serialize-activity';

export default createController(
  z.object({
    body: z.object({
      name: z.string().trim().min(1).max(100),
    }),
  }),
  async ({ user, body }) => {
    const activity = await createVehicleMaintenanceActivity({
      userId: user.id,
      name: body.name,
    });

    return { data: serializeVehicleMaintenanceActivity({ activity }), statusCode: 201 };
  },
);
