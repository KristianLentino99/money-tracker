import { format } from 'date-fns';

import { expect, test } from '../../fixtures';
import { completeOnboarding, createAccount, createCategory, extractId } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';
import {
  createMaintenanceVisitFixture,
  createVehicleFixture,
  getMaintenanceActivitiesFixture,
  getTransactionIfPresent,
} from '../../helpers/vehicle-maintenance';

const CURRENCY = 'USD';

test.describe('Vehicle maintenance visit deletion', () => {
  test('keeps a generated expense by default and deletes it only after explicit confirmation', async ({
    page,
    testUser,
  }) => {
    await loginViaUI({ page, email: testUser.email, password: testUser.password });
    await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

    const vehicle = await createVehicleFixture({
      request: page.request,
      name: `Delete maintenance ${testUser.name}`,
      currentMileage: 5_000,
    });
    const account = await createAccount({
      request: page.request,
      name: `Delete maintenance wallet ${testUser.name}`,
      currencyCode: CURRENCY,
      initialBalance: 1_000,
    });
    const category = await createCategory({
      request: page.request,
      name: `Delete maintenance category ${testUser.name}`,
      color: '#8f5b34',
    });
    const activities = await getMaintenanceActivitiesFixture({ request: page.request });
    const otherActivity = activities.find((activity) => activity.systemKey === 'other');
    expect(otherActivity).toBeDefined();

    const serviceDate = format(new Date(), 'yyyy-MM-dd');
    const retainedVisit = await createMaintenanceVisitFixture({
      request: page.request,
      vehicleId: vehicle.id,
      serviceDate,
      activities: [{ activityId: otherActivity!.id }],
      notes: 'Keep generated expense',
      quickExpense: {
        accountId: extractId(account),
        amount: 60,
        date: serviceDate,
        categoryId: extractId(category),
        paymentType: 'creditCard',
        note: 'Generated expense to retain',
      },
    });
    const retainedGeneratedId = retainedVisit.generatedTransactionIds[0];
    expect(retainedGeneratedId).toBeTruthy();

    const deletedVisit = await createMaintenanceVisitFixture({
      request: page.request,
      vehicleId: vehicle.id,
      serviceDate,
      activities: [{ activityId: otherActivity!.id }],
      notes: 'Delete generated expense',
      quickExpense: {
        accountId: extractId(account),
        amount: 70,
        date: serviceDate,
        categoryId: extractId(category),
        paymentType: 'creditCard',
        note: 'Generated expense to delete',
      },
    });
    const deletedGeneratedId = deletedVisit.generatedTransactionIds[0];
    expect(deletedGeneratedId).toBeTruthy();

    await page.goto(`/accounts/vehicles/${vehicle.id}`);
    await expect(page.getByRole('heading', { name: vehicle.name, level: 1 })).toBeVisible({ timeout: 15_000 });
    const history = page.getByRole('region', { name: /visit history/i });
    await expect(history).toBeVisible();

    const retainedCard = history.getByRole('article').filter({ hasText: /Keep generated expense/i });
    await retainedCard.getByRole('button', { name: /delete visit/i }).click();
    const keepDialog = page.getByRole('alertdialog');
    await expect(keepDialog).toBeVisible();
    const deleteExpenseToggle = keepDialog.getByRole('checkbox', { name: /also delete the expense/i });
    await expect(deleteExpenseToggle).not.toBeChecked();
    await keepDialog.getByRole('button', { name: /delete visit/i }).click();
    await expect(retainedCard).not.toBeVisible();
    expect(await getTransactionIfPresent({ request: page.request, id: retainedGeneratedId! })).not.toBeNull();

    const deletedCard = history.getByRole('article').filter({ hasText: /Delete generated expense/i });
    await deletedCard.getByRole('button', { name: /delete visit/i }).click();
    const deleteDialog = page.getByRole('alertdialog');
    await expect(deleteDialog).toBeVisible();
    const deleteExpenseCheckbox = deleteDialog.getByRole('checkbox', { name: /also delete the expense/i });
    await deleteExpenseCheckbox.check();
    await expect(deleteExpenseCheckbox).toBeChecked();
    const deleteVisitRequest = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        request.url().includes(`/vehicles/${vehicle.id}/maintenance/visits/${deletedVisit.id}`),
    );
    const deleteVisitResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().includes(`/vehicles/${vehicle.id}/maintenance/visits/${deletedVisit.id}`),
    );
    await deleteDialog.getByRole('button', { name: /delete visit/i }).click();
    expect((await deleteVisitRequest).postDataJSON()).toEqual({ deleteGeneratedExpense: true });
    expect((await deleteVisitResponse).status()).toBe(200);
    await expect(deletedCard).not.toBeVisible();
    expect(await getTransactionIfPresent({ request: page.request, id: deletedGeneratedId! })).toBeNull();
  });
});
