import { addDays, addMonths, format } from 'date-fns';

import { expect, test } from '../../fixtures';
import {
  completeOnboarding,
  createAccount,
  createCategory,
  createTransaction,
  extractId,
} from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import {
  createMaintenancePlanFixture,
  createMaintenanceVisitFixture,
  createVehicleFixture,
  getMaintenanceActivitiesFixture,
  getVehicleMaintenanceFixture,
} from '../../helpers/vehicle-maintenance';

const CURRENCY = 'USD';

function asDateTimeLocal({ date }: { date: Date }): string {
  return `${format(date, 'yyyy-MM-dd')}T00:00`;
}

async function openCreateVisitDialog({ page }: { page: import('@playwright/test').Page }) {
  const maintenance = page.locator('#vehicle-maintenance');
  await maintenance
    .getByRole('button', { name: /add visit|record visit/i })
    .first()
    .click();

  const dialog = page
    .getByRole('dialog')
    .filter({ hasText: /record (?:a )?maintenance visit/i })
    .last();
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Vehicle maintenance visits', () => {
  test('records multiple activities with an existing expense and quick expense, derives cost, and renews thresholds', async ({
    page,
    testUser,
  }) => {
    await loginViaUI({ page, email: testUser.email, password: testUser.password });
    await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

    const vehicle = await createVehicleFixture({
      request: page.request,
      name: `Maintenance visit ${testUser.name}`,
      currentMileage: 10_000,
    });
    const account = await createAccount({
      request: page.request,
      name: `Maintenance wallet ${testUser.name}`,
      currencyCode: CURRENCY,
      initialBalance: 2_000,
    });
    const category = await createCategory({
      request: page.request,
      name: `Maintenance category ${testUser.name}`,
      color: '#8f5b34',
    });
    const existingExpense = await createTransaction({
      request: page.request,
      accountId: extractId(account),
      categoryId: extractId(category),
      amount: 125.5,
      note: 'Existing maintenance expense',
    });
    const existingExpenseId = extractId(existingExpense);

    const activities = await getMaintenanceActivitiesFixture({ request: page.request });
    const oilChange = activities.find((activity) => activity.systemKey === 'oil-change');
    const brakeService = activities.find((activity) => activity.systemKey === 'brakes');
    expect(oilChange).toBeDefined();
    expect(brakeService).toBeDefined();

    const oilPlan = await createMaintenancePlanFixture({
      request: page.request,
      vehicleId: vehicle.id,
      activityId: oilChange!.id,
      nextDueDate: format(addMonths(new Date(), 3), 'yyyy-MM-dd'),
      nextDueDistance: 12_000,
    });
    const brakePlan = await createMaintenancePlanFixture({
      request: page.request,
      vehicleId: vehicle.id,
      activityId: brakeService!.id,
      nextDueDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    });

    await page.goto(`/accounts/vehicles/${vehicle.id}`);
    await expect(page.getByRole('heading', { name: vehicle.name, level: 1 })).toBeVisible({ timeout: 15_000 });

    const serviceDate = format(new Date(), 'yyyy-MM-dd');
    const renewedBrakeDate = format(addMonths(new Date(), 6), 'yyyy-MM-dd');
    const visitDialog = await openCreateVisitDialog({ page });
    await visitDialog.getByLabel('Service date').fill(asDateTimeLocal({ date: new Date() }));
    await visitDialog.getByLabel(/odometer \(km\)/i).fill('12000');
    await visitDialog.getByLabel('Notes').fill('Oil and brake service');

    // Each planned activity is explicitly included and receives a new threshold.
    const oilActivity = visitDialog.getByRole('group', { name: /oil change/i });
    await oilActivity.getByRole('checkbox').check();
    await oilActivity.getByLabel('Next due date').fill('');
    await oilActivity.getByLabel(/next due distance \(km\)/i).fill('17000');

    const brakeActivity = visitDialog.getByRole('group', { name: /brake service/i });
    await brakeActivity.getByRole('checkbox').check();
    await brakeActivity.getByLabel('Next due date').fill(asDateTimeLocal({ date: addMonths(new Date(), 6) }));

    // Link one eligible existing expense and create the second one atomically from the visit.
    await visitDialog.getByRole('button', { name: /link expense/i }).click();
    const transactionPicker = page.getByRole('dialog', { name: /link an existing expense/i });
    await expect(transactionPicker).toBeVisible();
    await transactionPicker.getByText(/Existing maintenance expense/).click();
    await expect(transactionPicker).not.toBeVisible();

    await visitDialog.getByRole('checkbox', { name: /create an expense/i }).check();
    await visitDialog.getByLabel('Amount').fill('275.25');
    await visitDialog.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: new RegExp(`^Maintenance wallet ${testUser.name} USD$`, 'i') }).click();
    await visitDialog.locator('[data-test="category-select-field"] button').click();
    await page.getByRole('option', { name: `Maintenance category ${testUser.name}`, exact: true }).click();
    await visitDialog.getByLabel(/expense note/i).fill('Quick maintenance expense');

    await visitDialog
      .getByRole('button', { name: /save|record visit|create visit/i })
      .last()
      .click();
    await expect(visitDialog).not.toBeVisible();

    const maintenance = page.locator('#vehicle-maintenance');
    const history = page.getByRole('region', { name: /visit history/i });
    await expect(history).toBeVisible();
    const recordedVisit = history.getByRole('article').filter({ hasText: /Oil and brake service/i });
    await expect(recordedVisit).toBeVisible();
    await expect(recordedVisit).toContainText(/oil change/i);
    await expect(recordedVisit).toContainText(/brake service/i);
    await expect(recordedVisit).toContainText(/400[.,]75/);
    await expect(maintenance.getByText(/17,000 km/i).first()).toBeVisible();
    await expect(maintenance.locator('article:has(h3)').filter({ hasText: /brake service/i })).toContainText(/due/i);

    // The UI result is also checked at the public HTTP boundary: one linked transaction,
    // one generated quick expense, and both plan thresholds updated by the visit.
    const updated = await getVehicleMaintenanceFixture({ request: page.request, vehicleId: vehicle.id });
    expect(updated.visits).toHaveLength(1);
    expect(updated.visits[0]).toMatchObject({
      serviceDate,
      odometer: 12_000,
      notes: 'Oil and brake service',
      totalCost: 400.75,
      transactionIds: expect.arrayContaining([existingExpenseId]),
    });
    expect(updated.visits[0]!.generatedTransactionIds).toHaveLength(1);
    expect(updated.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: oilPlan.id, nextDueDate: null, nextDueDistance: 17_000 }),
        expect.objectContaining({ id: brakePlan.id, nextDueDate: renewedBrakeDate }),
      ]),
    );
  });

  test('keeps visit activity controls out of the edit form when the update API only edits visit details', async ({
    page,
    testUser,
  }) => {
    await loginViaUI({ page, email: testUser.email, password: testUser.password });
    await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

    const vehicle = await createVehicleFixture({
      request: page.request,
      name: `Edit maintenance ${testUser.name}`,
      currentMileage: 1_000,
    });
    const activities = await getMaintenanceActivitiesFixture({ request: page.request });
    const oilChange = activities.find((activity) => activity.systemKey === 'oil-change');
    expect(oilChange).toBeDefined();
    const visit = await createMaintenanceVisitFixture({
      request: page.request,
      vehicleId: vehicle.id,
      serviceDate: format(new Date(), 'yyyy-MM-dd'),
      notes: 'Before editing',
      activities: [{ activityId: oilChange!.id }],
    });

    await page.goto(`/accounts/vehicles/${vehicle.id}`);
    const history = page.getByRole('region', { name: /visit history/i });
    const visitCard = history.getByRole('article').filter({ hasText: /Before editing/i });
    await visitCard.getByRole('button', { name: /edit/i }).click();

    const dialog = page
      .getByRole('dialog')
      .filter({ hasText: /edit maintenance visit/i })
      .last();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await dialog.getByLabel('Notes').fill('After editing');
    await dialog
      .getByRole('button', { name: /save|update/i })
      .last()
      .click();
    await expect(dialog).not.toBeVisible();

    const updated = await getVehicleMaintenanceFixture({ request: page.request, vehicleId: vehicle.id });
    expect(updated.visits).toEqual([
      expect.objectContaining({
        id: visit.id,
        odometer: null,
        notes: 'After editing',
        activities: [expect.objectContaining({ activityId: oilChange!.id })],
      }),
    ]);
  });

  test('formats visit totals in the user base currency when the vehicle account uses another currency', async ({
    page,
    testUser,
  }) => {
    await loginViaUI({ page, email: testUser.email, password: testUser.password });
    await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

    const vehicle = await createVehicleFixture({
      request: page.request,
      name: `Currency maintenance ${testUser.name}`,
      currencyCode: 'EUR',
    });
    const account = await createAccount({
      request: page.request,
      name: `Currency maintenance wallet ${testUser.name}`,
      currencyCode: 'EUR',
      initialBalance: 1_000,
    });
    const category = await createCategory({
      request: page.request,
      name: `Currency maintenance category ${testUser.name}`,
      color: '#8f5b34',
    });
    const activities = await getMaintenanceActivitiesFixture({ request: page.request });
    const other = activities.find((activity) => activity.systemKey === 'other');
    expect(other).toBeDefined();
    await createMaintenanceVisitFixture({
      request: page.request,
      vehicleId: vehicle.id,
      serviceDate: format(new Date(), 'yyyy-MM-dd'),
      activities: [{ activityId: other!.id }],
      quickExpense: {
        accountId: extractId(account),
        amount: 100,
        date: format(new Date(), 'yyyy-MM-dd'),
        categoryId: extractId(category),
        paymentType: 'creditCard',
      },
    });

    await page.goto(`/accounts/vehicles/${vehicle.id}`);
    const history = page.getByRole('region', { name: /visit history/i });
    const visitCard = history.getByRole('article').first();
    await expect(visitCard).toContainText('$');
    await expect(visitCard).not.toContainText('€');
  });
});
