import { expect, test } from '../../fixtures';
import { completeOnboarding, signInViaApi } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import { buildTestCredentials, signUpAndVerify } from '../../helpers/test-setup';
import { deleteTestUser } from '../../helpers/test-user';
import { createVehicleFixture, getMaintenanceActivitiesFixture } from '../../helpers/vehicle-maintenance';

const CURRENCY = 'USD';

async function openCreatePlanDialog({ page }: { page: import('@playwright/test').Page }) {
  const maintenance = page.locator('#vehicle-maintenance');
  await maintenance
    .getByRole('button', { name: /add plan/i })
    .first()
    .click();

  const dialog = page
    .getByRole('dialog')
    .filter({ hasText: /set a date, mileage, or both/i })
    .last();
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Vehicle maintenance plans', () => {
  test('creates a preset plan and a private custom plan on desktop', async ({ page, testUser, playwright }) => {
    await loginViaUI({ page, email: testUser.email, password: testUser.password });
    await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

    const vehicle = await createVehicleFixture({
      request: page.request,
      name: `Maintenance plans ${testUser.name}`,
      currentMileage: 10_000,
    });
    await page.goto(`/accounts/vehicles/${vehicle.id}`);
    await expect(page.getByRole('heading', { name: vehicle.name, level: 1 })).toBeVisible({ timeout: 15_000 });

    // Date-based preset plan: its default lead time and scheduled status are rendered by the UI.
    const presetDialog = await openCreatePlanDialog({ page });
    await presetDialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /vehicle inspection/i }).click();
    await presetDialog.getByLabel('Next due date').fill('2030-06-15T00:00');
    await presetDialog.getByRole('button', { name: /create plan/i }).click();
    await expect(presetDialog).not.toBeVisible();

    const maintenance = page.locator('#vehicle-maintenance');
    const presetCard = maintenance.getByRole('article').filter({ hasText: /vehicle inspection/i });
    await expect(presetCard).toBeVisible();
    await expect(presetCard).toContainText(/scheduled/i);
    await expect(presetCard).toContainText(/reminder 30 days before or 1,000 km in advance/i);
    await expect(presetCard).toContainText(/due jun 15, 2030/i);

    // Custom activity is created through the same plan flow and becomes a normal plan card.
    const customActivityName = `Ceramic coating ${testUser.name}`;
    const customDialog = await openCreatePlanDialog({ page });
    await customDialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /create custom activity/i }).click();
    await customDialog.getByLabel('Custom activity').fill(customActivityName);
    await customDialog.getByLabel(/next due distance \(km\)/i).fill('15000');
    await customDialog.getByRole('button', { name: /create plan/i }).click();
    await expect(customDialog).not.toBeVisible();

    const customCard = maintenance.getByRole('article').filter({ hasText: customActivityName });
    await expect(customCard).toBeVisible();
    await expect(customCard).toContainText(/scheduled/i);
    await expect(customCard).toContainText(/due at 15,000 km/i);

    // A custom activity is user-owned. Another authenticated user must not see it in their catalog.
    const otherCreds = buildTestCredentials({ prefix: 'vmp-other' });
    await signUpAndVerify({ creds: otherCreds });
    const otherApi = await signInViaApi({
      playwright,
      email: otherCreds.email,
      password: otherCreds.password,
    });
    try {
      await completeOnboarding({ request: otherApi, currencyCode: CURRENCY });
      const otherActivities = await getMaintenanceActivitiesFixture({ request: otherApi });
      expect(otherActivities.some((activity) => activity.name === customActivityName)).toBe(false);
    } finally {
      await deleteTestUser({ request: otherApi, user: otherCreds });
      await otherApi.dispose();
    }
  });
});
