import { expect, test } from '../../fixtures';
import { completeOnboarding, createAccount, createCategory, createPlan, extractId } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';

const CURRENCY = 'USD';

test.describe('Plan workspace', () => {
  test('renders a Plan and commits an accessible assignment edit', async ({ page, testUser }) => {
    await loginViaUI({ page, email: testUser.email, password: testUser.password });
    await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

    await page.goto('/plan');
    await expect(page.getByRole('button', { name: /plan\.actions\.create|create/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /plan\.actions\.template|template/i }).first()).toBeVisible();

    const category = await createCategory({ request: page.request, name: `Plan UI Category ${testUser.name}` });
    const account = await createAccount({
      request: page.request,
      name: `Plan UI Account ${testUser.name}`,
      currencyCode: CURRENCY,
      initialBalance: 100,
    });
    const plan = await createPlan({
      request: page.request,
      payload: {
        name: `Plan UI ${testUser.name}`,
        baseCurrencyCode: CURRENCY,
        categoryIds: [extractId(category)],
        accountIds: [extractId(account)],
      },
    });
    const planId = extractId(plan);

    await page.goto(`/plan?planId=${planId}`);
    await expect(page.getByRole('heading', { name: `Plan UI ${testUser.name}` })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /previous(?: period|Period)/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /next(?: period|Period)/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /auto.?assign/i })).toBeVisible();

    const assignment = page.getByRole('spinbutton').first();
    await expect(assignment).toBeVisible();
    await assignment.fill('40');
    await assignment.press('Tab');

    await expect(page.getByText(/60[.,]00/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('spinbutton').first()).toHaveValue('40');

    await page.getByRole('button', { name: new RegExp(`Plan UI Category ${testUser.name}`) }).click();
    await expect(page.getByRole('heading', { name: new RegExp(`Plan UI Category ${testUser.name}`) })).toBeVisible();
    await page.getByRole('button', { name: /add target/i }).click();
    await page.getByLabel(/target amount/i).fill('400');
    await page.getByRole('button', { name: /save target/i }).click();
    await expect(page.getByText(/33[.,]34/)).toBeVisible({ timeout: 15_000 });

    // The category input must remain keyboard-addressable at the narrow responsive layout.
    await page.setViewportSize({ width: 420, height: 900 });
    await page.reload();
    await expect(page.getByRole('spinbutton').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /previous(?: period|Period)/i })).toBeVisible();

    await page.getByRole('button', { name: /delete plan/i }).click();
    await expect(page.getByRole('heading', { name: /delete this plan/i })).toBeVisible();
    await page
      .getByRole('button', { name: /delete plan/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /plan\.actions\.create|create/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
