import { TRANSACTION_TYPES, VEHICLE_CLASS } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { RateLimitService } from '@services/common/rate-limit.service';
import * as helpers from '@tests/helpers';

type Row = Record<string, unknown>;

async function getCurrentUserId(): Promise<number> {
  const user = await helpers.makeRequest({ method: 'get', url: '/user', raw: true });
  return (user as { id: number }).id;
}

describe('Vehicle maintenance backup round-trip', () => {
  beforeEach(async () => {
    const userId = await getCurrentUserId();
    await RateLimitService.resetRateLimit(`backup:user:${userId}`);
    await RateLimitService.resetRateLimit(`backup-restore:user:${userId}`);
  });

  it('backs up and restores a vehicle maintenance graph with its linked expense', async () => {
    const vehicle = await helpers.createVehicle({
      name: 'Backup maintenance car',
      currencyCode: global.BASE_CURRENCY.code,
      make: 'Toyota',
      model: 'Corolla',
      year: 2021,
      vehicleClass: VEHICLE_CLASS.sedan,
      purchasePrice: 22_000,
      purchaseDate: '2021-01-01',
      currentMileage: 10_000,
      raw: true,
    });
    const serviceActivity = await helpers.createMaintenanceActivity({
      name: 'Backup scheduled service',
      raw: true,
    });
    const tireActivity = await helpers.createMaintenanceActivity({
      name: 'Backup tire rotation',
      raw: true,
    });
    const plan = await helpers.createMaintenancePlan({
      vehicleId: vehicle.id,
      activityId: serviceActivity.id,
      nextDueDistance: 15_000,
      raw: true,
    });
    const account = await helpers.createAccount({ raw: true });
    const [expense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 125.5,
        transactionType: TRANSACTION_TYPES.expense,
        note: 'Backup maintenance expense',
      }),
      raw: true,
    });

    const visit = await helpers.createMaintenanceVisit({
      vehicleId: vehicle.id,
      serviceDate: '2026-08-20',
      odometer: 12_000,
      notes: 'Backup annual service and tire rotation',
      activities: [
        {
          activityId: serviceActivity.id,
          planId: plan.id,
          nextDueDistance: 20_000,
        },
        { activityId: tireActivity.id },
      ],
      transactionIds: [expense.id],
      raw: true,
    });

    const backup = await helpers.exportBackup();
    expect(backup.statusCode).toBe(200);
    const archive = helpers.parseBackupArchive({ buffer: backup.body });

    const maintenanceTables = [
      'vehicle-maintenance-activities',
      'vehicle-maintenance-plans',
      'vehicle-maintenance-visits',
      'vehicle-maintenance-visit-activities',
      'vehicle-maintenance-transaction-links',
    ];
    for (const name of maintenanceTables) {
      expect(archive.files.has(`data/${name}.json`)).toBe(true);
      expect(Array.isArray(archive.readData({ name }))).toBe(true);
    }

    const activities = archive.readData({ name: 'vehicle-maintenance-activities' }) as Row[];
    const plans = archive.readData({ name: 'vehicle-maintenance-plans' }) as Row[];
    const visits = archive.readData({ name: 'vehicle-maintenance-visits' }) as Row[];
    const visitActivities = archive.readData({ name: 'vehicle-maintenance-visit-activities' }) as Row[];
    const transactionLinks = archive.readData({ name: 'vehicle-maintenance-transaction-links' }) as Row[];

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: serviceActivity.id, name: 'Backup scheduled service' }),
        expect.objectContaining({ id: tireActivity.id, name: 'Backup tire rotation' }),
      ]),
    );
    expect(plans).toContainEqual(
      expect.objectContaining({
        id: plan.id,
        vehicleId: vehicle.id,
        activityId: serviceActivity.id,
      }),
    );
    expect(visits).toContainEqual(
      expect.objectContaining({
        id: visit.id,
        vehicleId: vehicle.id,
        serviceDate: '2026-08-20',
      }),
    );
    expect(visitActivities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ visitId: visit.id, activityId: serviceActivity.id, planId: plan.id }),
        expect.objectContaining({ visitId: visit.id, activityId: tireActivity.id, planId: null }),
      ]),
    );
    expect(transactionLinks).toContainEqual(expect.objectContaining({ visitId: visit.id, transactionId: expense.id }));

    const restore = await helpers.restoreBackup({ fileContent: backup.body.toString('base64') });
    expect(restore.statusCode).toBe(200);
    expect(restore.jobId).toBeTruthy();
    const status = await helpers.waitForRestore({ jobId: restore.jobId! });
    expect(status.status).toBe('completed');

    const restoredVehicles = await helpers.getVehicles({ raw: true });
    const restoredVehicle = restoredVehicles.find(
      (candidate) => candidate.id === vehicle.id || candidate.account?.name === 'Backup maintenance car',
    );
    expect(restoredVehicle).toBeDefined();

    const maintenance = await helpers.getVehicleMaintenance({ vehicleId: restoredVehicle!.id, raw: true });
    const restoredPlan = maintenance.plans.find((candidate) => candidate.activityName === 'Backup scheduled service');
    expect(restoredPlan).toMatchObject({
      vehicleId: restoredVehicle!.id,
      activityId: serviceActivity.id,
      nextDueDistance: 20_000,
    });

    const restoredVisit = maintenance.visits.find((candidate) => candidate.serviceDate === '2026-08-20');
    expect(restoredVisit).toMatchObject({
      vehicleId: restoredVehicle!.id,
      odometer: 12_000,
      notes: 'Backup annual service and tire rotation',
      totalCost: 125.5,
    });
    expect(restoredVisit?.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labelSnapshot: 'Backup scheduled service' }),
        expect.objectContaining({ labelSnapshot: 'Backup tire rotation' }),
      ]),
    );
    expect(restoredVisit?.transactionIds).toHaveLength(1);
  });

  it('restores a legacy vehicle backup with currentMileage in kilometres', async () => {
    const vehicle = await helpers.createVehicle({
      name: 'Legacy mileage car',
      currencyCode: global.BASE_CURRENCY.code,
      make: 'Honda',
      model: 'Jazz',
      year: 2019,
      vehicleClass: VEHICLE_CLASS.other,
      purchasePrice: 14_000,
      purchaseDate: '2019-01-01',
      currentMileage: 1_234,
      raw: true,
    });

    const backup = await helpers.exportBackup();
    expect(backup.statusCode).toBe(200);
    const archive = helpers.parseBackupArchive({ buffer: backup.body });
    const vehicles = archive.readData({ name: 'vehicles' }) as Row[];
    const legacyVehicle = vehicles.find((candidate) => candidate.id === vehicle.id);
    expect(legacyVehicle).toBeDefined();
    expect(legacyVehicle?.currentMileageMeters).toBeDefined();
    legacyVehicle!.currentMileage = Number(legacyVehicle!.currentMileageMeters) / 1_000;
    delete legacyVehicle!.currentMileageMeters;
    archive.files.set('data/vehicles.json', Buffer.from(JSON.stringify(vehicles)));

    const legacyBackup = await helpers.repackBackup({ files: archive.files });
    const restore = await helpers.restoreBackup({ fileContent: legacyBackup });
    expect(restore.statusCode).toBe(200);
    const status = await helpers.waitForRestore({ jobId: restore.jobId! });
    expect(status.status).toBe('completed');

    const restoredVehicles = await helpers.getVehicles({ raw: true });
    const restoredVehicle = restoredVehicles.find((candidate) => candidate.id === vehicle.id);
    expect(restoredVehicle?.currentMileage).toBe(1_234);
  });
});
