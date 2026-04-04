import { test, expect } from '@playwright/test';

test.describe('Responsive Layout', () => {
  test('mobile viewport has no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('tablet viewport shows recipe grid', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    const cards = page.locator('recipe-card');
    await expect(cards).toHaveCount(2);
  });

  test('desktop viewport shows recipe grid', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const cards = page.locator('recipe-card');
    await expect(cards).toHaveCount(2);
  });
});
