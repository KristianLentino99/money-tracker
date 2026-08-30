import { TRANSACTION_TYPES, VEHICLE_CLASS } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { RateLimitService } from '@services/common/rate-limit.service';
import * as helpers from '@tests/helpers';

type ExportRow = Record<string, unknown>;

describe('Vehicle maintenance data export', () => {
  // Data export is limited to five requests per fifteen minutes per user. Keep
  // this focused fixture independent from requests made by other export suites.
  beforeEach(async () => {
    const user = await helpers.makeRequest({ method: 'get', url: '/user', raw: true });
    const userId = (user as { id: number }).id;
    await RateLimitService.resetRateLimit(`data-export:user:${userId}`);
  });

  it('exports one multi-activity maintenance visit with its plan and linked expense cost once', async () => {
    const vehicle = await helpers.createVehicle({
      name: 'Export maintenance car',
      currencyCode: 'USD',
      make: 'Toyota',
      model: 'Corolla',
      year: 2021,
      vehicleClass: VEHICLE_CLASS.sedan,
      purchasePrice: 22_000,
      purchaseDate: '2021-01-01',
      currentMileage: 10_000,
      raw: true,
    });
    const serviceActivity = await helpers.createMaintenanceActivity({ name: 'Scheduled service', raw: true });
    const tireActivity = await helpers.createMaintenanceActivity({ name: 'Tire rotation', raw: true });
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
        note: 'Maintenance export expense',
      }),
      raw: true,
    });

    const visit = await helpers.createMaintenanceVisit({
      vehicleId: vehicle.id,
      serviceDate: '2026-08-20',
      odometer: 12_000,
      notes: 'Annual service and tire rotation',
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

    expect(visit.transactionIds).toEqual([expense.id]);
    expect(visit.activities).toHaveLength(2);

    const response = await helpers.exportData({ format: 'json' });
    expect(response.statusCode).toBe(200);
    const archive = helpers.parseExportArchive({ buffer: response.body });
    const data = archive.json as Record<string, unknown>;
    const plans = data.vehicle_maintenance_plans as ExportRow[];
    const visits = data.vehicle_maintenance_visits as ExportRow[];

    expect(Array.isArray(plans)).toBe(true);
    expect(plans).toHaveLength(1);
    expect(JSON.stringify(plans[0])).toContain('Scheduled service');

    expect(Array.isArray(visits)).toBe(true);
    expect(visits).toHaveLength(1);
    const exportedVisit = visits[0]!;
    expect(exportedVisit).toMatchObject({
      serviceDate: '2026-08-20',
      odometer: 12_000,
      notes: 'Annual service and tire rotation',
      totalCost: 125.5,
    });
    expect(Array.isArray(exportedVisit.activities)).toBe(true);
    expect(exportedVisit.activities).toHaveLength(2);
    expect(JSON.stringify(exportedVisit.activities)).toEqual(expect.stringContaining('Scheduled service'));
    expect(JSON.stringify(exportedVisit.activities)).toEqual(expect.stringContaining('Tire rotation'));
  });
});
