import { recordId } from '@common/lib/zod/custom-types';
import createActivityController from '@controllers/vehicle-maintenance/create-activity';
import createPlanController from '@controllers/vehicle-maintenance/create-plan';
import createVisitController from '@controllers/vehicle-maintenance/create-visit';
import { serializeVehicleMaintenanceActivity } from '@controllers/vehicle-maintenance/serialize-activity';
import updateActivityController from '@controllers/vehicle-maintenance/update-activity';
import updatePlanController from '@controllers/vehicle-maintenance/update-plan';
import updateVisitController from '@controllers/vehicle-maintenance/update-visit';
import createVehicleController from '@controllers/vehicles/create-vehicle';
import updateVehicleController from '@controllers/vehicles/update-vehicle';
import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { serializeEligibleMaintenanceTransaction } from '@root/serializers/eligible-maintenance-transactions.serializer';
import { serializeVehicleMaintenancePlan } from '@root/serializers/vehicle-maintenance-plans.serializer';
import { serializeVehicleMaintenanceReminder } from '@root/serializers/vehicle-maintenance-reminders.serializer';
import { serializeVehicleMaintenanceVisit } from '@root/serializers/vehicle-maintenance-visits.serializer';
import { serializeVehicle, serializeVehicles } from '@root/serializers/vehicles.serializer';
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
import { createVehicle } from '@services/vehicles/create-vehicle.service';
import { deleteVehicle } from '@services/vehicles/delete-vehicle.service';
import { getVehicle } from '@services/vehicles/get-vehicle.service';
import { getVehicles } from '@services/vehicles/get-vehicles.service';
import { getVehicleDistanceUnit } from '@services/vehicles/helpers';
import { updateVehicle } from '@services/vehicles/update-vehicle.service';
import { z } from 'zod';

import { assertMcpMutationAllowed, getUserId, jsonContent } from './helpers';

const createVehicleInputSchema = {
  data: createVehicleController.schema.shape.body.describe(
    'Fields accepted by the matching REST operation. Amounts are decimals; distance uses the user distance unit.',
  ),
};
const updateVehicleInputSchema = {
  vehicleId: recordId(),
  data: updateVehicleController.schema.shape.body.describe(
    'Fields accepted by the matching REST operation. Amounts are decimals; distance uses the user distance unit.',
  ),
};
const createActivityInputSchema = {
  data: createActivityController.schema.shape.body.describe(
    'Fields accepted by the matching REST operation. Amounts are decimals; distance uses the user distance unit.',
  ),
};
const updateActivityInputSchema = {
  activityId: recordId(),
  data: updateActivityController.schema.shape.body.describe(
    'Fields accepted by the matching REST operation. Amounts are decimals; distance uses the user distance unit.',
  ),
};
const createPlanInputSchema = {
  vehicleId: recordId(),
  data: createPlanController.schema.shape.body.describe(
    'Fields accepted by the matching REST operation. Amounts are decimals; distance uses the user distance unit.',
  ),
};
const updatePlanInputSchema = {
  vehicleId: recordId(),
  planId: recordId(),
  data: updatePlanController.schema.shape.body.describe(
    'Fields accepted by the matching REST operation. Amounts are decimals; distance uses the user distance unit.',
  ),
};
const createVisitInputSchema = {
  vehicleId: recordId(),
  data: createVisitController.schema.shape.body.describe(
    'Fields accepted by the matching REST operation. Amounts are decimals; distance uses the user distance unit.',
  ),
};
const updateVisitInputSchema = {
  vehicleId: recordId(),
  visitId: recordId(),
  data: updateVisitController.schema.shape.body.describe(
    'Fields accepted by the matching REST operation. Amounts are decimals; distance uses the user distance unit.',
  ),
};
const vehicleIdInputSchema = { vehicleId: recordId() };
const deleteVisitInputSchema = {
  vehicleId: recordId(),
  visitId: recordId(),
  deleteGeneratedExpense: z.boolean().optional(),
};

export function registerVehicleTools(server: McpServer) {
  server.registerTool(
    'get_vehicles',
    {
      description:
        'List vehicles with current estimated values, depreciation and mileage in the configured distance unit.',
    },
    async (extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_vehicles', clientId: extra.authInfo?.clientId });
      const [vehicles, distanceUnit] = await Promise.all([getVehicles({ userId }), getVehicleDistanceUnit({ userId })]);
      return jsonContent({ data: serializeVehicles(vehicles, { distanceUnit }) });
    },
  );
  server.registerTool(
    'get_vehicle',
    { description: 'Read a vehicle with depreciation, valuation and mileage.', inputSchema: vehicleIdInputSchema },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_vehicle', clientId: extra.authInfo?.clientId });
      const [vehicle, distanceUnit] = await Promise.all([
        getVehicle({ userId, vehicleId: args.vehicleId }),
        getVehicleDistanceUnit({ userId }),
      ]);
      return jsonContent({ data: vehicle ? serializeVehicle(vehicle, { distanceUnit }) : null });
    },
  );
  server.registerTool(
    'create_vehicle',
    {
      description: 'Create a vehicle and its linked asset account. purchasePrice uses decimal currency units.',
      inputSchema: createVehicleInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'create_vehicle', clientId: extra.authInfo?.clientId });
      const vehicle = await createVehicle({ userId, ...args.data });
      const distanceUnit = await getVehicleDistanceUnit({ userId });
      return jsonContent({ data: vehicle ? serializeVehicle(vehicle, { distanceUnit }) : null });
    },
  );
  server.registerTool(
    'update_vehicle',
    {
      description: 'Update vehicle details, depreciation settings and current mileage.',
      inputSchema: updateVehicleInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'update_vehicle', clientId: extra.authInfo?.clientId });
      const vehicle = await updateVehicle({ userId, vehicleId: args.vehicleId, ...args.data });
      const distanceUnit = await getVehicleDistanceUnit({ userId });
      return jsonContent({ data: vehicle ? serializeVehicle(vehicle, { distanceUnit }) : null });
    },
  );
  server.registerTool(
    'delete_vehicle',
    {
      description: 'Delete a vehicle and its asset account using existing ownership and linked-payment protections.',
      inputSchema: vehicleIdInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_vehicle', clientId: extra.authInfo?.clientId });
      await deleteVehicle({ userId, vehicleId: args.vehicleId });
      return jsonContent({ data: { id: args.vehicleId } });
    },
  );
  server.registerTool(
    'get_vehicle_maintenance',
    {
      description: 'Read all maintenance plans and visits for a vehicle, including linked expenses.',
      inputSchema: vehicleIdInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_vehicle_maintenance', clientId: extra.authInfo?.clientId });
      const [{ plans, visits }, distanceUnit] = await Promise.all([
        getVehicleMaintenance({ userId, vehicleId: args.vehicleId }),
        getVehicleDistanceUnit({ userId }),
      ]);
      return jsonContent({
        data: {
          plans: plans.map((plan) =>
            serializeVehicleMaintenancePlan({
              plan,
              distanceUnit,
              currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
            }),
          ),
          visits: visits.map((visit) => serializeVehicleMaintenanceVisit({ visit, distanceUnit })),
        },
      });
    },
  );
  server.registerTool(
    'get_vehicle_maintenance_activities',
    { description: 'List the available maintenance activities and their archive status.' },
    async (extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_vehicle_maintenance_activities', clientId: extra.authInfo?.clientId });
      const activities = await getVehicleMaintenanceActivities({ userId });
      return jsonContent({ data: activities.map((activity) => serializeVehicleMaintenanceActivity({ activity })) });
    },
  );
  server.registerTool(
    'create_vehicle_maintenance_activity',
    { description: 'Create a reusable maintenance activity.', inputSchema: createActivityInputSchema },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'create_vehicle_maintenance_activity', clientId: extra.authInfo?.clientId });
      const activity = await createVehicleMaintenanceActivity({ userId, ...args.data });
      return jsonContent({ data: serializeVehicleMaintenanceActivity({ activity }) });
    },
  );
  server.registerTool(
    'update_vehicle_maintenance_activity',
    { description: 'Rename or archive a reusable maintenance activity.', inputSchema: updateActivityInputSchema },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'update_vehicle_maintenance_activity', clientId: extra.authInfo?.clientId });
      const activity = await updateVehicleMaintenanceActivity({ userId, id: args.activityId, ...args.data });
      return jsonContent({ data: serializeVehicleMaintenanceActivity({ activity }) });
    },
  );
  server.registerTool(
    'get_vehicle_maintenance_reminders',
    { description: 'List upcoming and overdue maintenance reminders using date and mileage thresholds.' },
    async (extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_vehicle_maintenance_reminders', clientId: extra.authInfo?.clientId });
      const [plans, distanceUnit] = await Promise.all([
        getVehicleMaintenanceReminders({ userId }),
        getVehicleDistanceUnit({ userId }),
      ]);
      return jsonContent({ data: plans.map((plan) => serializeVehicleMaintenanceReminder({ plan, distanceUnit })) });
    },
  );
  server.registerTool(
    'get_eligible_maintenance_transactions',
    { description: 'List expenses that can be linked to a vehicle maintenance visit.' },
    async (extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_eligible_maintenance_transactions', clientId: extra.authInfo?.clientId });
      const transactions = await getEligibleMaintenanceTransactions({ userId });
      return jsonContent({
        data: transactions.map((transaction) => serializeEligibleMaintenanceTransaction({ transaction })),
      });
    },
  );
  server.registerTool(
    'create_vehicle_maintenance_plan',
    {
      description: 'Create a maintenance reminder using a due date or distance threshold.',
      inputSchema: createPlanInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'create_vehicle_maintenance_plan', clientId: extra.authInfo?.clientId });
      const plan = await createVehicleMaintenancePlan({ userId, vehicleId: args.vehicleId, ...args.data });
      const distanceUnit = await getVehicleDistanceUnit({ userId });
      return jsonContent({
        data: serializeVehicleMaintenancePlan({
          plan,
          distanceUnit,
          currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
        }),
      });
    },
  );
  server.registerTool(
    'update_vehicle_maintenance_plan',
    { description: 'Renew, change or archive a vehicle maintenance plan.', inputSchema: updatePlanInputSchema },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'update_vehicle_maintenance_plan', clientId: extra.authInfo?.clientId });
      const plan = await updateVehicleMaintenancePlan({
        userId,
        vehicleId: args.vehicleId,
        planId: args.planId,
        ...args.data,
      });
      const distanceUnit = await getVehicleDistanceUnit({ userId });
      return jsonContent({
        data: serializeVehicleMaintenancePlan({
          plan,
          distanceUnit,
          currentMileageMeters: plan.vehicle?.currentMileageMeters ?? null,
        }),
      });
    },
  );
  server.registerTool(
    'create_vehicle_maintenance_visit',
    {
      description:
        'Record a maintenance visit, renew plans and link existing expenses or create a quickExpense atomically.',
      inputSchema: createVisitInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'create_vehicle_maintenance_visit', clientId: extra.authInfo?.clientId });
      const visit = await createVehicleMaintenanceVisit({ userId, vehicleId: args.vehicleId, ...args.data });
      const distanceUnit = await getVehicleDistanceUnit({ userId });
      return jsonContent({ data: serializeVehicleMaintenanceVisit({ visit, distanceUnit }) });
    },
  );
  server.registerTool(
    'update_vehicle_maintenance_visit',
    {
      description: 'Update the date, mileage, notes or activities on a maintenance visit.',
      inputSchema: updateVisitInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId });
      trackMcpToolUsed({ userId, tool: 'update_vehicle_maintenance_visit', clientId: extra.authInfo?.clientId });
      const visit = await updateVehicleMaintenanceVisit({
        userId,
        vehicleId: args.vehicleId,
        visitId: args.visitId,
        ...args.data,
      });
      const distanceUnit = await getVehicleDistanceUnit({ userId });
      return jsonContent({ data: serializeVehicleMaintenanceVisit({ visit, distanceUnit }) });
    },
  );
  server.registerTool(
    'delete_vehicle_maintenance_visit',
    {
      description:
        'Delete a maintenance visit. deleteGeneratedExpense explicitly controls deletion of its generated expense.',
      inputSchema: deleteVisitInputSchema,
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      await assertMcpMutationAllowed({ extra, userId, scope: 'finance:delete' });
      trackMcpToolUsed({ userId, tool: 'delete_vehicle_maintenance_visit', clientId: extra.authInfo?.clientId });
      await deleteVehicleMaintenanceVisit({ userId, ...args });
      return jsonContent({ data: { id: args.visitId } });
    },
  );
}
