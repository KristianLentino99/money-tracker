import { PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, VEHICLE_CLASS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { addMonths, format, subDays } from 'date-fns';

describe('Vehicle maintenance', () => {
  describe('distance unit preference', () => {
    it('defaults to kilometres and can be changed to miles through user settings', async () => {
      const initial = await helpers.getUserSettings({ raw: true });
      expect(initial.distanceUnit).toBe('km');

      const updated = await helpers.patchUserSettings({ patch: { distanceUnit: 'mi' }, raw: true });
      expect(updated.distanceUnit).toBe('mi');

      const fetched = await helpers.getUserSettings({ raw: true });
      expect(fetched.distanceUnit).toBe('mi');
    });

    it('stores vehicle odometer canonically while representing it in the current preferred unit', async () => {
      await helpers.patchUserSettings({ patch: { distanceUnit: 'mi' }, raw: true });
      const vehicle = await helpers.createVehicle({
        name: 'Roadster',
        currencyCode: 'USD',
        make: 'Mazda',
        model: 'MX-5',
        year: 2020,
        vehicleClass: VEHICLE_CLASS.other,
        purchasePrice: 20_000,
        purchaseDate: '2020-01-01',
        currentMileage: 100,
        raw: true,
      });
      expect(vehicle).toMatchObject({ currentMileage: 100, distanceUnit: 'mi' });

      await helpers.patchUserSettings({ patch: { distanceUnit: 'km' }, raw: true });
      const representedInKm = await helpers.getVehicleById({ id: vehicle.id, raw: true });
      expect(representedInKm).toMatchObject({ currentMileage: 160.934, distanceUnit: 'km' });
    });
  });

  describe('GET /vehicle-maintenance/activities', () => {
    it('returns the global activity presets for a user with no custom activities', async () => {
      const activities = await helpers.getMaintenanceActivities({ raw: true });

      expect(activities).toHaveLength(7);
      expect(activities.map(({ systemKey }) => systemKey)).toEqual([
        'inspection',
        'scheduled-service',
        'oil-change',
        'tires',
        'brakes',
        'battery',
        'other',
      ]);
      expect(activities.every(({ name, archivedAt }) => name === null && archivedAt === null)).toBe(true);
    });
  });

  describe('POST /vehicle-maintenance/activities', () => {
    it('creates a custom activity owned by the authenticated user and returns it in their catalog', async () => {
      const created = await helpers.createMaintenanceActivity({ name: 'Ceramic coating', raw: true });

      expect(created).toMatchObject({
        systemKey: null,
        name: 'Ceramic coating',
        archivedAt: null,
      });
      expect(created.id).toEqual(expect.any(String));

      const activities = await helpers.getMaintenanceActivities({ raw: true });
      expect(activities).toHaveLength(8);
      expect(activities.at(-1)).toEqual(created);
    });
  });

  describe('PATCH /vehicle-maintenance/activities/:id', () => {
    it('renames a custom activity and returns the new name from the catalog', async () => {
      const activity = await helpers.createMaintenanceActivity({ name: 'Detailing', raw: true });

      const renamed = await helpers.updateMaintenanceActivity({
        id: activity.id,
        name: 'Interior detailing',
        raw: true,
      });

      expect(renamed).toMatchObject({ id: activity.id, name: 'Interior detailing', systemKey: null });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      expect(activities.at(-1)?.name).toBe('Interior detailing');
    });

    it('archives a custom activity and removes it from the selectable catalog', async () => {
      const activity = await helpers.createMaintenanceActivity({ name: 'Rust proofing', raw: true });

      const archived = await helpers.updateMaintenanceActivity({
        id: activity.id,
        archived: true,
        raw: true,
      });

      expect(archived.id).toBe(activity.id);
      expect(archived.archivedAt).toEqual(expect.any(String));
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      expect(activities.map(({ id }) => id)).not.toContain(activity.id);
    });
  });

  describe('vehicle maintenance plans', () => {
    it('creates a date-based preset plan with default lead time and returns it from vehicle maintenance', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Family car',
        currencyCode: 'USD',
        make: 'Toyota',
        model: 'Corolla',
        year: 2021,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 18_000,
        purchaseDate: '2021-01-01',
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const inspection = activities.find(({ systemKey }) => systemKey === 'inspection')!;
      const nextDueDate = format(addMonths(new Date(), 6), 'yyyy-MM-dd');

      const plan = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: inspection.id,
        nextDueDate,
        raw: true,
      });

      expect(plan).toMatchObject({
        vehicleId: vehicle.id,
        activityId: inspection.id,
        activitySystemKey: 'inspection',
        activityName: null,
        nextDueDate,
        nextDueDistance: null,
        leadDays: 30,
        leadDistance: 1_000,
        distanceUnit: 'km',
        status: 'scheduled',
        archivedAt: null,
      });
      const maintenance = await helpers.getVehicleMaintenance({ vehicleId: vehicle.id, raw: true });
      expect(maintenance).toEqual({ plans: [plan], visits: [] });
    });

    it('rejects a second active plan for the same vehicle and activity', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Single plan car',
        currencyCode: 'USD',
        make: 'Toyota',
        model: 'Aygo',
        year: 2021,
        vehicleClass: VEHICLE_CLASS.other,
        purchasePrice: 12_000,
        purchaseDate: '2021-01-01',
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const inspection = activities.find(({ systemKey }) => systemKey === 'inspection')!;
      const nextDueDate = format(addMonths(new Date(), 6), 'yyyy-MM-dd');

      await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: inspection.id,
        nextDueDate,
        raw: true,
      });

      const duplicate = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: inspection.id,
        nextDueDate,
      });

      expect(duplicate.statusCode).toBe(422);
    });

    it('requires and atomically records the current odometer when creating the first distance-based plan', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Commuter',
        currencyCode: 'USD',
        make: 'Honda',
        model: 'Civic',
        year: 2022,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 22_000,
        purchaseDate: '2022-01-01',
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const oilChange = activities.find(({ systemKey }) => systemKey === 'oil-change')!;

      const missingOdometer = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: oilChange.id,
        nextDueDistance: 10_000,
      });
      expect(missingOdometer.statusCode).toBe(422);

      const plan = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: oilChange.id,
        currentMileage: 5_000,
        nextDueDistance: 10_000,
        raw: true,
      });
      expect(plan).toMatchObject({
        nextDueDate: null,
        nextDueDistance: 10_000,
        leadDistance: 1_000,
        distanceUnit: 'km',
        status: 'scheduled',
      });
      const updatedVehicle = await helpers.getVehicleById({ id: vehicle.id, raw: true });
      expect(updatedVehicle.currentMileage).toBe(5_000);
    });

    it('rejects a plan mileage below the canonical vehicle odometer', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Monotonic plan car',
        currencyCode: 'USD',
        make: 'Honda',
        model: 'Civic',
        year: 2022,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 22_000,
        purchaseDate: '2022-01-01',
        currentMileage: 5_000,
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const oilChange = activities.find(({ systemKey }) => systemKey === 'oil-change')!;

      const response = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: oilChange.id,
        currentMileage: 4_999,
        nextDueDistance: 10_000,
      });

      expect(response.statusCode).toBe(422);
      expect((await helpers.getVehicleById({ id: vehicle.id, raw: true })).currentMileage).toBe(5_000);
    });

    it('rejects a plan mileage outside the supported database range', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Overflow plan car',
        currencyCode: 'USD',
        make: 'Honda',
        model: 'Civic',
        year: 2022,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 22_000,
        purchaseDate: '2022-01-01',
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const oilChange = activities.find(({ systemKey }) => systemKey === 'oil-change')!;

      const response = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: oilChange.id,
        currentMileage: Number.MAX_SAFE_INTEGER,
        nextDueDistance: 10_000,
      });

      expect(response.statusCode).toBe(422);
    });

    it('rejects a visit that references an archived maintenance plan', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Archived plan car',
        currencyCode: 'USD',
        make: 'Honda',
        model: 'Civic',
        year: 2022,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 22_000,
        purchaseDate: '2022-01-01',
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const oilChange = activities.find(({ systemKey }) => systemKey === 'oil-change')!;
      const plan = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: oilChange.id,
        nextDueDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
        raw: true,
      });
      await helpers.updateMaintenancePlan({ vehicleId: vehicle.id, planId: plan.id, archived: true, raw: true });

      const response = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate: format(new Date(), 'yyyy-MM-dd'),
        activities: [{ activityId: oilChange.id, planId: plan.id, archivePlan: true }],
      });

      expect(response.statusCode).toBe(404);
    });

    it('updates thresholds and derives the most urgent status when date and distance coexist', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Touring car',
        currencyCode: 'USD',
        make: 'Volvo',
        model: 'V60',
        year: 2023,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 35_000,
        purchaseDate: '2023-01-01',
        currentMileage: 1_000,
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const service = activities.find(({ systemKey }) => systemKey === 'scheduled-service')!;
      const original = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: service.id,
        nextDueDate: format(addMonths(new Date(), 6), 'yyyy-MM-dd'),
        raw: true,
      });

      const nextDueDate = format(addMonths(new Date(), 2), 'yyyy-MM-dd');
      const updated = await helpers.updateMaintenancePlan({
        vehicleId: vehicle.id,
        planId: original.id,
        nextDueDate,
        nextDueDistance: 1_500,
        leadDays: 15,
        leadDistance: 1_000,
        raw: true,
      });

      expect(updated).toMatchObject({
        id: original.id,
        nextDueDate,
        nextDueDistance: 1_500,
        leadDays: 15,
        leadDistance: 1_000,
        status: 'upcoming',
      });
    });
  });

  describe('vehicle maintenance visits', () => {
    it('records an activity label snapshot and advances the vehicle odometer without deriving a duplicate cost', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Weekend car',
        currencyCode: 'USD',
        make: 'BMW',
        model: 'Z4',
        year: 2019,
        vehicleClass: VEHICLE_CLASS.other,
        purchasePrice: 28_000,
        purchaseDate: '2019-01-01',
        currentMileage: 10_000,
        raw: true,
      });
      const activity = await helpers.createMaintenanceActivity({ name: 'Wheel alignment', raw: true });
      const serviceDate = format(new Date(), 'yyyy-MM-dd');

      const visit = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate,
        odometer: 12_000,
        notes: 'Rear alignment corrected',
        activities: [{ activityId: activity.id }],
        raw: true,
      });

      expect(visit).toMatchObject({
        vehicleId: vehicle.id,
        serviceDate,
        odometer: 12_000,
        distanceUnit: 'km',
        notes: 'Rear alignment corrected',
        totalCost: 0,
        transactionIds: [],
        activities: [
          {
            activityId: activity.id,
            planId: null,
            labelSnapshot: 'Wheel alignment',
          },
        ],
      });

      await helpers.updateMaintenanceActivity({ id: activity.id, name: 'Alignment', raw: true });
      const maintenance = await helpers.getVehicleMaintenance({ vehicleId: vehicle.id, raw: true });
      const firstVisit = maintenance.visits[0];
      if (!firstVisit) throw new Error('Expected the maintenance visit to be returned');
      const firstActivity = firstVisit.activities[0];
      if (!firstActivity) throw new Error('Expected the maintenance activity to be returned');
      expect(firstActivity.labelSnapshot).toBe('Wheel alignment');
      const updatedVehicle = await helpers.getVehicleById({ id: vehicle.id, raw: true });
      expect(updatedVehicle.currentMileage).toBe(12_000);
    });

    it('updates visit details and activity snapshots through HTTP and keeps the updated visit in history', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Service history car',
        currencyCode: 'USD',
        make: 'Toyota',
        model: 'Yaris',
        year: 2020,
        vehicleClass: VEHICLE_CLASS.other,
        purchasePrice: 16_000,
        purchaseDate: '2020-01-01',
        currentMileage: 8_000,
        raw: true,
      });
      const initialActivity = await helpers.createMaintenanceActivity({ name: 'Oil change', raw: true });
      const updatedActivity = await helpers.createMaintenanceActivity({ name: 'Tire rotation', raw: true });
      const visit = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate: '2026-08-01',
        odometer: 8_500,
        notes: 'Routine oil change',
        activities: [{ activityId: initialActivity.id }],
        raw: true,
      });

      const updated = await helpers.updateMaintenanceVisit({
        vehicleId: vehicle.id,
        visitId: visit.id,
        serviceDate: '2026-08-12',
        odometer: 9_125,
        notes: 'Oil changed and tires rotated',
        activities: [{ activityId: updatedActivity.id }],
        raw: true,
      });

      expect(updated).toMatchObject({
        id: visit.id,
        vehicleId: vehicle.id,
        serviceDate: '2026-08-12',
        odometer: 9_125,
        distanceUnit: 'km',
        notes: 'Oil changed and tires rotated',
        totalCost: 0,
        transactionIds: [],
        generatedTransactionIds: [],
        activities: [
          {
            activityId: updatedActivity.id,
            planId: null,
            labelSnapshot: 'Tire rotation',
          },
        ],
      });

      const maintenance = await helpers.getVehicleMaintenance({ vehicleId: vehicle.id, raw: true });
      expect(maintenance.visits).toHaveLength(1);
      expect(maintenance.visits[0]).toMatchObject({
        id: visit.id,
        serviceDate: '2026-08-12',
        odometer: 9_125,
        notes: 'Oil changed and tires rotated',
        activities: [
          {
            activityId: updatedActivity.id,
            planId: null,
            labelSnapshot: 'Tire rotation',
          },
        ],
      });
    });

    it('preserves a plan link when an existing planned activity is retained through an HTTP update', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Planned maintenance car',
        currencyCode: 'USD',
        make: 'Toyota',
        model: 'Corolla',
        year: 2021,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 18_000,
        purchaseDate: '2021-01-01',
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const inspection = activities.find(({ systemKey }) => systemKey === 'inspection')!;
      const plan = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: inspection.id,
        nextDueDate: '2026-12-01',
        raw: true,
      });
      const visit = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate: '2026-08-01',
        activities: [{ activityId: inspection.id, planId: plan.id, archivePlan: true }],
        raw: true,
      });

      const updated = await helpers.updateMaintenanceVisit({
        vehicleId: vehicle.id,
        visitId: visit.id,
        activities: [{ activityId: inspection.id }],
        raw: true,
      });

      expect(updated.activities).toEqual([
        {
          id: expect.any(String),
          activityId: inspection.id,
          planId: plan.id,
          labelSnapshot: 'inspection',
        },
      ]);
    });

    it('completes multiple plans only when each is renewed or archived and includes a free extraordinary activity', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Long-distance car',
        currencyCode: 'USD',
        make: 'Skoda',
        model: 'Octavia',
        year: 2021,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 24_000,
        purchaseDate: '2021-01-01',
        currentMileage: 10_000,
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const oil = activities.find(({ systemKey }) => systemKey === 'oil-change')!;
      const brakes = activities.find(({ systemKey }) => systemKey === 'brakes')!;
      const oilPlan = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: oil.id,
        nextDueDate: format(addMonths(new Date(), 3), 'yyyy-MM-dd'),
        nextDueDistance: 12_000,
        raw: true,
      });
      const brakesPlan = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: brakes.id,
        nextDueDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
        raw: true,
      });
      const serviceDate = format(new Date(), 'yyyy-MM-dd');

      const missingProgression = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate,
        activities: [{ activityId: oil.id, planId: oilPlan.id }],
      });
      expect(missingProgression.statusCode).toBe(422);

      const visit = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate,
        odometer: 12_000,
        activities: [
          {
            activityId: oil.id,
            planId: oilPlan.id,
            nextDueDate: format(addMonths(new Date(), 6), 'yyyy-MM-dd'),
            nextDueDistance: null,
          },
          { activityId: brakes.id, planId: brakesPlan.id, archivePlan: true },
          { label: 'Replace cracked coolant hose' },
        ],
        raw: true,
      });

      expect(visit.activities).toHaveLength(3);
      expect(visit.activities.map(({ labelSnapshot }) => labelSnapshot)).toEqual([
        'oil-change',
        'brakes',
        'Replace cracked coolant hose',
      ]);
      const maintenance = await helpers.getVehicleMaintenance({ vehicleId: vehicle.id, raw: true });
      expect(maintenance.plans).toHaveLength(1);
      expect(maintenance.plans[0]).toMatchObject({
        id: oilPlan.id,
        nextDueDate: format(addMonths(new Date(), 6), 'yyyy-MM-dd'),
        nextDueDistance: null,
        status: 'scheduled',
      });
    });

    it('links an eligible existing expense once and derives the visit total in base currency', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'City car',
        currencyCode: 'USD',
        make: 'Fiat',
        model: '500',
        year: 2020,
        vehicleClass: VEHICLE_CLASS.other,
        purchasePrice: 15_000,
        purchaseDate: '2020-01-01',
        raw: true,
      });
      const account = await helpers.createAccount({ raw: true });
      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 125.5 }),
        raw: true,
      });
      const serviceDate = format(new Date(), 'yyyy-MM-dd');

      const visit = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate,
        activities: [{ label: 'Emergency tire repair' }],
        transactionIds: [expense.id],
        raw: true,
      });
      expect(visit.transactionIds).toEqual([expense.id]);
      expect(visit.totalCost).toBe(125.5);

      const duplicateLink = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate,
        activities: [{ label: 'Duplicate repair' }],
        transactionIds: [expense.id],
      });
      expect(duplicateLink.statusCode).toBe(422);
    });

    it('creates and links one real quick expense atomically with the visit', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Utility car',
        currencyCode: 'USD',
        make: 'Ford',
        model: 'Focus',
        year: 2018,
        vehicleClass: VEHICLE_CLASS.other,
        purchasePrice: 12_000,
        purchaseDate: '2018-01-01',
        raw: true,
      });
      const account = await helpers.createAccount({ raw: true });
      const serviceDate = format(new Date(), 'yyyy-MM-dd');

      const visit = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate,
        activities: [{ label: 'Replace starter motor' }],
        quickExpense: {
          accountId: account.id,
          amount: 275.25,
          date: serviceDate,
          categoryId: global.DEFAULT_CATEGORY_ID,
          paymentType: PAYMENT_TYPES.creditCard,
          note: 'Created from maintenance visit',
        },
        raw: true,
      });

      expect(visit.totalCost).toBe(275.25);
      expect(visit.generatedTransactionIds).toHaveLength(1);
      expect(visit.transactionIds).toEqual(visit.generatedTransactionIds);
      const generatedTransactionId = visit.generatedTransactionIds[0];
      if (!generatedTransactionId) throw new Error('Expected a generated maintenance transaction');
      const transaction = await helpers.getTransactionById({
        id: generatedTransactionId,
        raw: true,
      });
      expect(transaction).toMatchObject({
        accountId: account.id,
        amount: 275.25,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        isForecastOnly: false,
        note: 'Created from maintenance visit',
      });
    });

    it('unlinks expenses when deleting a visit and deletes a generated expense only when explicitly requested', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Maintenance deletion car',
        currencyCode: 'USD',
        make: 'Renault',
        model: 'Clio',
        year: 2020,
        vehicleClass: VEHICLE_CLASS.other,
        purchasePrice: 14_000,
        purchaseDate: '2020-01-01',
        raw: true,
      });
      const account = await helpers.createAccount({ raw: true });
      const [existingExpense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 40 }),
        raw: true,
      });
      const serviceDate = format(new Date(), 'yyyy-MM-dd');
      const quickExpense = {
        accountId: account.id,
        amount: 60,
        date: serviceDate,
        categoryId: global.DEFAULT_CATEGORY_ID,
        paymentType: PAYMENT_TYPES.creditCard,
        note: 'Generated expense',
      };

      const retainedVisit = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate,
        activities: [{ label: 'Mixed payment visit' }],
        transactionIds: [existingExpense.id],
        quickExpense,
        raw: true,
      });
      const retainedGeneratedId = retainedVisit.generatedTransactionIds[0];
      if (!retainedGeneratedId) throw new Error('Expected a generated transaction to be retained');
      await helpers.deleteMaintenanceVisit({
        vehicleId: vehicle.id,
        visitId: retainedVisit.id,
        raw: true,
      });
      expect(await helpers.getTransactionById({ id: existingExpense.id, raw: true })).not.toBeNull();
      expect(await helpers.getTransactionById({ id: retainedGeneratedId, raw: true })).not.toBeNull();

      const deletedVisit = await helpers.createMaintenanceVisit({
        vehicleId: vehicle.id,
        serviceDate,
        activities: [{ label: 'Generated-only visit' }],
        quickExpense,
        raw: true,
      });
      const deletedGeneratedId = deletedVisit.generatedTransactionIds[0];
      if (!deletedGeneratedId) throw new Error('Expected a generated transaction to be deleted');
      await helpers.deleteMaintenanceVisit({
        vehicleId: vehicle.id,
        visitId: deletedVisit.id,
        deleteGeneratedExpense: true,
        raw: true,
      });
      const deletedTransaction = await helpers.getTransactionById({ id: deletedGeneratedId, raw: true });
      expect(deletedTransaction).toBeNull();

      const maintenance = await helpers.getVehicleMaintenance({ vehicleId: vehicle.id, raw: true });
      expect(maintenance.visits).toEqual([]);
    });
  });

  describe('GET /vehicle-maintenance/reminders', () => {
    it('returns only upcoming and overdue plans, overdue first, and reacts to an odometer update', async () => {
      expect(await helpers.getMaintenanceReminders({ raw: true })).toEqual([]);

      const vehicle = await helpers.createVehicle({
        name: 'Reminder car',
        currencyCode: 'USD',
        make: 'Kia',
        model: 'Niro',
        year: 2022,
        vehicleClass: VEHICLE_CLASS.suv,
        purchasePrice: 26_000,
        purchaseDate: '2022-01-01',
        currentMileage: 1_000,
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const inspection = activities.find(({ systemKey }) => systemKey === 'inspection')!;
      const oil = activities.find(({ systemKey }) => systemKey === 'oil-change')!;
      const service = activities.find(({ systemKey }) => systemKey === 'scheduled-service')!;
      const overduePlan = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: inspection.id,
        nextDueDate: format(subDays(new Date(), 1), 'yyyy-MM-dd'),
        raw: true,
      });
      const upcomingPlan = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: oil.id,
        nextDueDistance: 1_500,
        raw: true,
      });
      await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: service.id,
        nextDueDate: format(addMonths(new Date(), 6), 'yyyy-MM-dd'),
        raw: true,
      });

      const reminders = await helpers.getMaintenanceReminders({ raw: true });
      expect(reminders).toHaveLength(2);
      expect(reminders.map(({ planId, status }) => ({ planId, status }))).toEqual([
        { planId: overduePlan.id, status: 'overdue' },
        { planId: upcomingPlan.id, status: 'upcoming' },
      ]);
      expect(reminders[0]).toMatchObject({ vehicleId: vehicle.id, vehicleName: 'Reminder car' });

      await helpers.updateVehicle({ id: vehicle.id, currentMileage: 1_600, raw: true });
      const afterOdometerUpdate = await helpers.getMaintenanceReminders({ raw: true });
      expect(afterOdometerUpdate.find(({ planId }) => planId === upcomingPlan.id)?.status).toBe('overdue');
    });

    it('creates one in-app notification on entering upcoming and one on becoming overdue, then invalidates both on reschedule', async () => {
      const vehicle = await helpers.createVehicle({
        name: 'Notification car',
        currencyCode: 'USD',
        make: 'Hyundai',
        model: 'Ioniq',
        year: 2023,
        vehicleClass: VEHICLE_CLASS.ev,
        purchasePrice: 32_000,
        purchaseDate: '2023-01-01',
        currentMileage: 1_000,
        raw: true,
      });
      const activities = await helpers.getMaintenanceActivities({ raw: true });
      const tires = activities.find(({ systemKey }) => systemKey === 'tires')!;
      const plan = await helpers.createMaintenancePlan({
        vehicleId: vehicle.id,
        activityId: tires.id,
        nextDueDistance: 1_500,
        raw: true,
      });

      await helpers.getMaintenanceReminders({ raw: true });
      await helpers.getMaintenanceReminders({ raw: true });
      let notifications = await helpers.getNotifications({
        type: 'vehicle_maintenance_reminder',
        raw: true,
      });
      expect(notifications).toHaveLength(1);
      const firstNotification = notifications[0];
      if (!firstNotification) throw new Error('Expected a maintenance reminder notification');
      expect(firstNotification.payload).toMatchObject({ planId: plan.id, reminderStatus: 'upcoming' });

      await helpers.updateVehicle({ id: vehicle.id, currentMileage: 1_600, raw: true });
      await helpers.getMaintenanceReminders({ raw: true });
      await helpers.getMaintenanceReminders({ raw: true });
      notifications = await helpers.getNotifications({
        type: 'vehicle_maintenance_reminder',
        raw: true,
      });
      expect(notifications).toHaveLength(2);
      expect(
        notifications.map(({ payload }) => (payload as Record<string, unknown>).reminderStatus).toSorted(),
      ).toEqual(['overdue', 'upcoming']);

      await helpers.updateMaintenancePlan({
        vehicleId: vehicle.id,
        planId: plan.id,
        nextDueDistance: 5_000,
        raw: true,
      });
      notifications = await helpers.getNotifications({
        type: 'vehicle_maintenance_reminder',
        raw: true,
      });
      expect(notifications).toEqual([]);
    });
  });
});
