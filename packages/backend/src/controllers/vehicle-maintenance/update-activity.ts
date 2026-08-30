import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { updateVehicleMaintenanceActivity } from '@services/vehicle-maintenance/update-activity.service';
import { z } from 'zod';

import { serializeVehicleMaintenanceActivity } from './serialize-activity';

export default createController(
  z.object({
    params: z.object({ id: recordId() }),
    body: z.object({
      name: z.string().trim().min(1).max(100).optional(),
      archived: z.boolean().optional(),
    }),
  }),
  async ({ user, params, body }) => {
    const activity = await updateVehicleMaintenanceActivity({
      id: params.id,
      userId: user.id,
      name: body.name,
      archived: body.archived,
    });

    return { data: serializeVehicleMaintenanceActivity({ activity }) };
  },
);
