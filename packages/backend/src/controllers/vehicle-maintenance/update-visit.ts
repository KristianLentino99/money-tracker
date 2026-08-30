import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicleMaintenanceVisit } from '@root/serializers/vehicle-maintenance-visits.serializer';
import { updateVehicleMaintenanceVisit } from '@services/vehicle-maintenance/update-visit.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { z } from 'zod';

import { dateOnly } from './create-plan';

const activitySchema = z
  .object({
    activityId: recordId().optional(),
    label: z.string().trim().min(1).max(100).optional(),
  })
  .refine(({ activityId, label }) => (activityId === undefined) !== (label === undefined), {
    message: 'Provide exactly one of activityId or label for each activity',
  });

const schema = z.object({
  params: z.object({ id: recordId(), visitId: recordId() }),
  body: z.object({
    serviceDate: dateOnly.optional(),
    odometer: z.number().finite().min(0).nullable().optional(),
    notes: z.string().trim().max(5_000).nullable().optional(),
    activities: z.array(activitySchema).min(1).optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const visit = await updateVehicleMaintenanceVisit({
    userId: user.id,
    vehicleId: params.id,
    visitId: params.visitId,
    ...body,
  });
  const distanceUnit = await getVehicleDistanceUnit({ userId: user.id });

  return { data: serializeVehicleMaintenanceVisit({ visit, distanceUnit }) };
});
