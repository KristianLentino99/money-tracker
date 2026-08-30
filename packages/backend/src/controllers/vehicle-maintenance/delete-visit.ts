import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { deleteVehicleMaintenanceVisit } from '@services/vehicle-maintenance/delete-visit.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({ id: recordId(), visitId: recordId() }),
  body: z.object({ deleteGeneratedExpense: z.boolean().optional() }).optional().default({}),
});

export default createController(schema, async ({ user, params, body }) => {
  await deleteVehicleMaintenanceVisit({
    userId: user.id,
    vehicleId: params.id,
    visitId: params.visitId,
    deleteGeneratedExpense: body.deleteGeneratedExpense,
  });

  return { data: { id: params.visitId } };
});
