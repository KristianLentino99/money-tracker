import { createController } from '@controllers/helpers/controller-factory';
import { getVehicleMaintenanceActivities } from '@services/vehicle-maintenance/get-activities.service';
import { z } from 'zod';

import { serializeVehicleMaintenanceActivity } from './serialize-activity';

export default createController(z.object({}), async ({ user }) => {
  const activities = await getVehicleMaintenanceActivities({ userId: user.id });
  return {
    data: activities.map((activity) => serializeVehicleMaintenanceActivity({ activity })),
  };
});
