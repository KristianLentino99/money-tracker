import { PAYMENT_TYPES } from '@bt/shared/types';
import { decimalMoney, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeVehicleMaintenanceVisit } from '@root/serializers/vehicle-maintenance-visits.serializer';
import { createVehicleMaintenanceVisit } from '@services/vehicle-maintenance/create-visit.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { z } from 'zod';

import { dateOnly } from './create-plan';

const activitySchema = z
  .object({
    activityId: recordId().optional(),
    label: z.string().trim().min(1).max(100).optional(),
    planId: recordId().optional(),
    nextDueDate: dateOnly.nullable().optional(),
    nextDueDistance: z.number().finite().min(0).nullable().optional(),
    archivePlan: z.boolean().optional(),
  })
  .refine(({ activityId, label }) => (activityId === undefined) !== (label === undefined), {
    message: 'Provide exactly one of activityId or label for each activity',
  })
  .refine(
    ({ activityId, label, planId, nextDueDate, nextDueDistance, archivePlan }) => {
      if (planId === undefined) {
        return nextDueDate === undefined && nextDueDistance === undefined && archivePlan === undefined;
      }

      return (
        activityId !== undefined &&
        label === undefined &&
        (nextDueDate !== undefined || nextDueDistance !== undefined || archivePlan === true)
      );
    },
    {
      message: 'A plan visit activity must reference its activity and renew a threshold or archive the plan',
    },
  );

const quickExpenseSchema = z.object({
  accountId: recordId(),
  amount: decimalMoney().refine((amount) => amount.isPositive(), {
    message: 'Quick expense amount must be greater than 0',
  }),
  date: dateOnly,
  categoryId: recordId(),
  paymentType: z.nativeEnum(PAYMENT_TYPES),
  payeeId: recordId().nullable().optional(),
  note: z.string().trim().max(1_000).nullish(),
});

const schema = z.object({
  params: z.object({ id: recordId() }),
  body: z.object({
    serviceDate: dateOnly,
    odometer: z.number().finite().min(0).optional(),
    notes: z.string().trim().max(5_000).optional(),
    activities: z.array(activitySchema).min(1),
    transactionIds: z.array(recordId()).optional(),
    quickExpense: quickExpenseSchema.optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const visit = await createVehicleMaintenanceVisit({
    userId: user.id,
    vehicleId: params.id,
    ...body,
  });
  const distanceUnit = await getVehicleDistanceUnit({ userId: user.id });

  return {
    data: serializeVehicleMaintenanceVisit({ visit, distanceUnit }),
    statusCode: 201,
  };
});
