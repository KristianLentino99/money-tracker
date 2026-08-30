import { format } from 'date-fns';

import { expect, test } from '../../fixtures';
import { completeOnboarding } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import {
  createMaintenancePlanFixture,
  createVehicleFixture,
  getMaintenanceActivitiesFixture,
  getVehicleMaintenanceFixture,
} from '../../helpers/vehicle-maintenance';

const CURRENCY = 'USD';

test.describe('@vehicle-maintenance-mobile responsive visit dialog', () => {
  test('configures and completes a planned visit through the mobile responsive dialog', async ({ page, testUser }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUI({ page, email: testUser.email, password: testUser.password });
    await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

    const vehicle = await createVehicleFixture({
      request: page.request,
      name: `Mobile maintenance ${testUser.name}`,
      currentMileage: 10_000,
    });
    const activities = await getMaintenanceActivitiesFixture({ request: page.request });
    const oilChange = activities.find((activity) => activity.systemKey === 'oil-change');
    expect(oilChange).toBeDefined();
    const plan = await createMaintenancePlanFixture({
      request: page.request,
      vehicleId: vehicle.id,
      activityId: oilChange!.id,
      nextDueDistance: 12_000,
    });

    await page.goto(`/accounts/vehicles/${vehicle.id}`);
    await expect(page.getByRole('heading', { name: vehicle.name, level: 1 })).toBeVisible({ timeout: 15_000 });

    const maintenance = page.locator('#vehicle-maintenance');
    await maintenance
      .getByRole('button', { name: /add visit|record visit/i })
      .first()
      .click();
    const visitDialog = page
      .getByRole('dialog')
      .filter({ hasText: /record (?:a )?maintenance visit/i })
      .last();
    await expect(visitDialog).toBeVisible();

    // The same fields must remain reachable when ResponsiveDialog switches to a drawer.
    await visitDialog.getByLabel('Service date').fill(`${format(new Date(), 'yyyy-MM-dd')}T00:00`);
    await visitDialog.getByLabel(/odometer \(km\)/i).fill('12000');
    await visitDialog.getByLabel('Notes').fill('Mobile oil change');
    const oilActivity = visitDialog.getByRole('group', { name: /oil change/i });
    await oilActivity.getByRole('checkbox').check();
    await oilActivity.getByLabel(/next due distance \(km\)/i).fill('17000');

    await visitDialog
      .getByRole('button', { name: /save|record visit|complete visit|create visit/i })
      .last()
      .click();
    await expect(visitDialog).not.toBeVisible();

    const history = page.getByRole('region', { name: /visit history/i });
    await expect(history).toBeVisible();
    const visitCard = history.getByRole('article').filter({ hasText: /Mobile oil change/i });
    await expect(visitCard).toBeVisible();
    await expect(visitCard).toContainText(/oil change/i);

    const maintenanceAfterVisit = await getVehicleMaintenanceFixture({
      request: page.request,
      vehicleId: vehicle.id,
    });
    expect(maintenanceAfterVisit.visits).toHaveLength(1);
    expect(maintenanceAfterVisit.visits[0]).toMatchObject({
      odometer: 12_000,
      notes: 'Mobile oil change',
    });
    expect(maintenanceAfterVisit.plans).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: plan.id, nextDueDistance: 17_000 })]),
    );
  });
});
