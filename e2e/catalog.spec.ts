import { test, expect } from '@playwright/test';

test.describe('Catalog', () => {
  test('index page loads and displays recipe cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('All Recipes');
    const cards = page.locator('recipe-card');
    await expect(cards).toHaveCount(4);
  });

  test('search filters recipes by title', async ({ page }) => {
    await page.goto('/');
    await page.locator('search-bar input').fill('bolognese');
    const cards = page.locator('recipe-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Bolognese');
  });

  test('tag filter narrows results', async ({ page }) => {
    await page.goto('/');
    await page.click('.tag-pill:has-text("weeknight")');
    const cards = page.locator('recipe-card');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('recipe-card:has-text("Bolognese")')).toBeVisible();
  });

  test('recipe card links to recipe page', async ({ page }) => {
    await page.goto('/');
    await page.click('recipe-card:has-text("Bolognese")');
    await expect(page).toHaveURL(/spaghetti-bolognese/);
  });
});
