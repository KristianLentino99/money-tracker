import { recordId } from '@common/lib/zod/custom-types';
import { schema as createActivitySchema } from '@controllers/vehicle-maintenance/create-activity';
import { schema as createPlanSchema } from '@controllers/vehicle-maintenance/create-plan';
import { schema as createVisitSchema } from '@controllers/vehicle-maintenance/create-visit';
import { serializeVehicleMaintenanceActivity } from '@controllers/vehicle-maintenance/serialize-activity';
import { schema as updateActivitySchema } from '@controllers/vehicle-maintenance/update-activity';
import { schema as updatePlanSchema } from '@controllers/vehicle-maintenance/update-plan';
import { schema as updateVisitSchema } from '@controllers/vehicle-maintenance/update-visit';
import { serializeEligibleMaintenanceTransaction } from '@root/serializers/eligible-maintenance-transactions.serializer';
import { serializeVehicleMaintenancePlan } from '@root/serializers/vehicle-maintenance-plans.serializer';
import { serializeVehicleMaintenanceReminder } from '@root/serializers/vehicle-maintenance-reminders.serializer';
import { serializeVehicleMaintenanceVisit } from '@root/serializers/vehicle-maintenance-visits.serializer';
import { createVehicleMaintenanceActivity } from '@services/vehicle-maintenance/create-activity.service';
import { createVehicleMaintenancePlan } from '@services/vehicle-maintenance/create-plan.service';
import { createVehicleMaintenanceVisit } from '@services/vehicle-maintenance/create-visit.service';
import { deleteVehicleMaintenanceVisit } from '@services/vehicle-maintenance/delete-visit.service';
import { getVehicleMaintenanceActivities } from '@services/vehicle-maintenance/get-activities.service';
import { getEligibleMaintenanceTransactions } from '@services/vehicle-maintenance/get-eligible-transactions.service';
import { getVehicleMaintenanceReminders } from '@services/vehicle-maintenance/get-reminders.service';
import { getVehicleMaintenance } from '@services/vehicle-maintenance/get-vehicle-maintenance.service';
import { updateVehicleMaintenanceActivity } from '@services/vehicle-maintenance/update-activity.service';
import { updateVehicleMaintenancePlan } from '@services/vehicle-maintenance/update-plan.service';
import { updateVehicleMaintenanceVisit } from '@services/vehicle-maintenance/update-visit.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { z } from 'zod';

import { defineTool } from '../define-tool';

const REST_BODY_NOTE =
  'Fields accepted by the matching REST operation. Amounts are decimals; distance uses the user distance unit.';

const TOOLSET = 'loans-vehicles' as const;

export const getVehicleMaintenanceTool = defineTool({
  name: 'get_vehicle_maintenance',
  toolset: TOOLSET,
  access: 'read',
  description: 'Read all maintenance plans and visits for a vehicle, including linked expenses.',
  input: { vehicleId: recordId() },
  run: async ({ userId, args }) => {
    const [{ plans, visits }, distanceUnit] = await Promise.all([
      getVehicleMaintenance({ userId, vehicleId: args.vehicleId }),
      getVehicleDistanceUnit({ userId }),
    ]);

    return {
      plans: plans.map((plan) =>
        serializeVehicleMaintenancePlan({
          plan,
          distanceUnit,
          currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
        }),
      ),
      visits: visits.map((visit) => serializeVehicleMaintenanceVisit({ visit, distanceUnit })),
    };
  },
});

export const getVehicleMaintenanceActivitiesTool = defineTool({
  name: 'get_vehicle_maintenance_activities',
  toolset: TOOLSET,
  access: 'read',
  description: 'List the available maintenance activities and their archive status.',
  run: async ({ userId }) => {
    const activities = await getVehicleMaintenanceActivities({ userId });

    return activities.map((activity) => serializeVehicleMaintenanceActivity({ activity }));
  },
});

export const createVehicleMaintenanceActivityTool = defineTool({
  name: 'create_vehicle_maintenance_activity',
  toolset: TOOLSET,
  access: 'write',
  description: 'Create a reusable maintenance activity.',
  input: { data: createActivitySchema.shape.body.describe(REST_BODY_NOTE) },
  run: async ({ userId, args }) => {
    const activity = await createVehicleMaintenanceActivity({ userId, ...args.data });

    return serializeVehicleMaintenanceActivity({ activity });
  },
});

export const updateVehicleMaintenanceActivityTool = defineTool({
  name: 'update_vehicle_maintenance_activity',
  toolset: TOOLSET,
  access: 'write',
  description: 'Rename or archive a reusable maintenance activity.',
  input: { activityId: recordId(), data: updateActivitySchema.shape.body.describe(REST_BODY_NOTE) },
  run: async ({ userId, args }) => {
    const activity = await updateVehicleMaintenanceActivity({ userId, id: args.activityId, ...args.data });

    return serializeVehicleMaintenanceActivity({ activity });
  },
});

export const getVehicleMaintenanceRemindersTool = defineTool({
  name: 'get_vehicle_maintenance_reminders',
  toolset: TOOLSET,
  access: 'read',
  description: 'List upcoming and overdue maintenance reminders using date and mileage thresholds.',
  run: async ({ userId }) => {
    const [plans, distanceUnit] = await Promise.all([
      getVehicleMaintenanceReminders({ userId }),
      getVehicleDistanceUnit({ userId }),
    ]);

    return plans.map((plan) => serializeVehicleMaintenanceReminder({ plan, distanceUnit }));
  },
});

export const getEligibleMaintenanceTransactionsTool = defineTool({
  name: 'get_eligible_maintenance_transactions',
  toolset: TOOLSET,
  access: 'read',
  description: 'List expenses that can be linked to a vehicle maintenance visit.',
  run: async ({ userId }) => {
    const transactions = await getEligibleMaintenanceTransactions({ userId });

    return transactions.map((transaction) => serializeEligibleMaintenanceTransaction({ transaction }));
  },
});

export const createVehicleMaintenancePlanTool = defineTool({
  name: 'create_vehicle_maintenance_plan',
  toolset: TOOLSET,
  access: 'write',
  description: 'Create a maintenance reminder using a due date or distance threshold.',
  input: { vehicleId: recordId(), data: createPlanSchema.shape.body.describe(REST_BODY_NOTE) },
  run: async ({ userId, args }) => {
    const plan = await createVehicleMaintenancePlan({ userId, vehicleId: args.vehicleId, ...args.data });
    const distanceUnit = await getVehicleDistanceUnit({ userId });

    return serializeVehicleMaintenancePlan({
      plan,
      distanceUnit,
      currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
    });
  },
});

export const updateVehicleMaintenancePlanTool = defineTool({
  name: 'update_vehicle_maintenance_plan',
  toolset: TOOLSET,
  access: 'write',
  description: 'Renew, change or archive a vehicle maintenance plan.',
  input: { vehicleId: recordId(), planId: recordId(), data: updatePlanSchema.shape.body.describe(REST_BODY_NOTE) },
  run: async ({ userId, args }) => {
    const plan = await updateVehicleMaintenancePlan({
      userId,
      vehicleId: args.vehicleId,
      planId: args.planId,
      ...args.data,
    });
    const distanceUnit = await getVehicleDistanceUnit({ userId });

    return serializeVehicleMaintenancePlan({
      plan,
      distanceUnit,
      currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
    });
  },
});

export const createVehicleMaintenanceVisitTool = defineTool({
  name: 'create_vehicle_maintenance_visit',
  toolset: TOOLSET,
  access: 'write',
  description:
    'Record a maintenance visit, renew plans and link existing expenses or create a quickExpense atomically.',
  input: { vehicleId: recordId(), data: createVisitSchema.shape.body.describe(REST_BODY_NOTE) },
  run: async ({ userId, args }) => {
    const visit = await createVehicleMaintenanceVisit({ userId, vehicleId: args.vehicleId, ...args.data });
    const distanceUnit = await getVehicleDistanceUnit({ userId });

    return serializeVehicleMaintenanceVisit({ visit, distanceUnit });
  },
});

export const updateVehicleMaintenanceVisitTool = defineTool({
  name: 'update_vehicle_maintenance_visit',
  toolset: TOOLSET,
  access: 'write',
  description: 'Update the date, mileage, notes or activities on a maintenance visit.',
  input: { vehicleId: recordId(), visitId: recordId(), data: updateVisitSchema.shape.body.describe(REST_BODY_NOTE) },
  run: async ({ userId, args }) => {
    const visit = await updateVehicleMaintenanceVisit({
      userId,
      vehicleId: args.vehicleId,
      visitId: args.visitId,
      ...args.data,
    });
    const distanceUnit = await getVehicleDistanceUnit({ userId });

    return serializeVehicleMaintenanceVisit({ visit, distanceUnit });
  },
});

export const deleteVehicleMaintenanceVisitTool = defineTool({
  name: 'delete_vehicle_maintenance_visit',
  toolset: TOOLSET,
  access: 'delete',
  description:
    'Delete a maintenance visit. deleteGeneratedExpense explicitly controls deletion of its generated expense.',
  input: { vehicleId: recordId(), visitId: recordId(), deleteGeneratedExpense: z.boolean().optional() },
  run: async ({ userId, args }) => {
    await deleteVehicleMaintenanceVisit({ userId, ...args });

    return { id: args.visitId };
  },
});
