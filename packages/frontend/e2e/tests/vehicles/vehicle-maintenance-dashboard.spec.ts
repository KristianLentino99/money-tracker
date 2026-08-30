import { format, subDays } from 'date-fns';

import { expect, test } from '../../fixtures';
import { completeOnboarding } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import {
  createMaintenancePlanFixture,
  createVehicleFixture,
  getMaintenanceActivitiesFixture,
  getMaintenanceRemindersFixture,
} from '../../helpers/vehicle-maintenance';

const CURRENCY = 'USD';

test.describe('Vehicle maintenance dashboard reminders', () => {
  test('renders the dashboard panel, deep-links to maintenance, and moves a reminder from upcoming to overdue', async ({
    page,
    testUser,
  }) => {
    await loginViaUI({ page, email: testUser.email, password: testUser.password });
    await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

    const vehicle = await createVehicleFixture({
      request: page.request,
      name: `Dashboard maintenance ${testUser.name}`,
      currentMileage: 1_000,
    });
    const activities = await getMaintenanceActivitiesFixture({ request: page.request });
    const inspection = activities.find((activity) => activity.systemKey === 'inspection');
    const oilChange = activities.find((activity) => activity.systemKey === 'oil-change');
    expect(inspection).toBeDefined();
    expect(oilChange).toBeDefined();

    await createMaintenancePlanFixture({
      request: page.request,
      vehicleId: vehicle.id,
      activityId: inspection!.id,
      nextDueDate: format(subDays(new Date(), 1), 'yyyy-MM-dd'),
    });
    await createMaintenancePlanFixture({
      request: page.request,
      vehicleId: vehicle.id,
      activityId: oilChange!.id,
      nextDueDistance: 1_500,
    });

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /vehicle maintenance/i })).toBeVisible({ timeout: 15_000 });

    const panel = page
      .locator('[class*="vehicle-reminders"]')
      .filter({ has: page.getByRole('heading', { name: /vehicle maintenance/i }) })
      .first();
    const reminders = panel.getByRole('article');
    await expect(reminders).toHaveCount(2);

    // The panel sorts overdue first, then upcoming, and exposes the vehicle as a deep link.
    await expect(reminders.nth(0)).toContainText(/overdue/i);
    await expect(reminders.nth(1)).toContainText(/upcoming/i);
    await reminders.nth(1).getByRole('link', { name: vehicle.name }).click();
    await expect(page).toHaveURL(new RegExp(`/accounts/vehicles/${vehicle.id}#vehicle-maintenance$`));
    await expect(page.getByRole('heading', { name: /^maintenance$/i, level: 2 })).toBeVisible();

    // The quick odometer control is available inline in the dashboard reminder row.
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /vehicle maintenance/i })).toBeVisible({ timeout: 15_000 });
    const upcomingReminder = page
      .locator('[class*="vehicle-reminders"]')
      .filter({ has: page.getByRole('heading', { name: /vehicle maintenance/i }) })
      .first()
      .getByRole('article')
      .filter({ hasText: /oil change/i });
    await expect(upcomingReminder).toContainText(/upcoming/i);

    const odometerInput = upcomingReminder.getByLabel(/current mileage \(km\)/i);
    await odometerInput.fill('1600');
    await expect(odometerInput).toHaveValue('1600');
    const updateOdometerButton = upcomingReminder.getByRole('button', { name: /update odometer/i });
    await expect(updateOdometerButton).toBeEnabled();
    await updateOdometerButton.click();
    await expect(upcomingReminder).toContainText(/overdue/i);

    const remindersAfterUpdate = await getMaintenanceRemindersFixture({ request: page.request });
    const updatedReminder = remindersAfterUpdate.find((reminder) => reminder.vehicleId === vehicle.id);
    expect(updatedReminder?.status).toBe('overdue');
    expect(updatedReminder?.currentMileage).toBe(1_600);
  });
});
