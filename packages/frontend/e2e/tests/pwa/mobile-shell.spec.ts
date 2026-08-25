import { expect, test } from '../../fixtures';
import { completeOnboarding } from '../../helpers/api-client';
import { loginViaUI } from '../../helpers/auth';

const CURRENCY = 'USD';
const MOBILE_WIDTHS = [320, 390, 430] as const;

test.describe('@mobile-shell mobile application shell', () => {
  test.describe.configure({ mode: 'serial' });

  for (const width of MOBILE_WIDTHS) {
    test(`keeps the five-tab bar usable at ${width}px`, async ({ page, testUser }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await loginViaUI({ page, email: testUser.email, password: testUser.password });
      await completeOnboarding({ request: page.request, currencyCode: CURRENCY });

      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

      const navigation = page.getByTestId('mobile-primary-navigation');
      await expect(navigation).toBeVisible();
      await expect(navigation.locator('[data-mobile-tab]')).toHaveCount(5);

      const addTransactionButton = page.getByTestId('mobile-add-transaction');
      await expect(addTransactionButton).toBeVisible();
      const positions = await page.evaluate(() => {
        const addButton = document.querySelector('[data-testid="mobile-add-transaction"]');
        const navigation = document.querySelector('[data-testid="mobile-primary-navigation"]');
        if (!addButton || !navigation) return null;
        return {
          addButtonTop: addButton.getBoundingClientRect().top,
          navigationTop: navigation.getBoundingClientRect().top,
        };
      });
      if (!positions) throw new Error('Mobile add transaction button or navigation is missing');
      expect(positions.addButtonTop).toBeLessThan(positions.navigationTop);

      const tabRows = await navigation
        .locator('[data-mobile-tab]')
        .evaluateAll((tabs) => tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)));
      expect(new Set(tabRows).size).toBe(1);

      const documentWidths = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(documentWidths.document).toBeLessThanOrEqual(documentWidths.viewport);
      expect(documentWidths.body).toBeLessThanOrEqual(documentWidths.viewport);

      await page.screenshot({
        path: testInfo.outputPath(`mobile-shell-${width}.png`),
        fullPage: true,
      });
    });
  }
});
