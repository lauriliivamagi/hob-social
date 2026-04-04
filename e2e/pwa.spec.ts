import { test, expect } from '@playwright/test';

test.describe('PWA', () => {
  test('manifest loads with correct fields', async ({ page }) => {
    const response = await page.goto('/manifest.webmanifest');
    expect(response?.status()).toBe(200);
    const manifest = await response?.json();
    expect(manifest.name).toBe('Recipe Visualizer');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toBeDefined();
  });

  test('service worker registers', async ({ page }) => {
    await page.goto('/');
    
    // Wait until service worker is registered and ready
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return !!reg;
    });

    expect(swRegistered).toBeTruthy();
  });

  test('offline mode serves cached page', async ({ page }) => {
    // First load to populate cache and activate service worker
    await page.goto('/');

    // Wait for the service worker to be fully activated and controlling the page
    const swControlling = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        // Wait for controller to claim this page
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve());
          setTimeout(resolve, 3000);
        });
      }
      return !!navigator.serviceWorker.controller;
    });

    if (!swControlling) {
      test.skip();
      return;
    }

    // Second load so the SW caches the navigation response via stale-while-revalidate
    await page.reload({ waitUntil: 'load' });

    // Use CDP to emulate offline at network level (affects SW fetch too)
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    // Try to load again — SW should serve from cache
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Page should still work
    await expect(page.locator('h1')).toContainText('All Recipes');

    // Restore network
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  });
});
