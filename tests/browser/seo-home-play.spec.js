import { test, expect } from '@playwright/test';

test('a storage-free direct visit receives Home and can navigate to Play and back', async ({ context, page }) => {
  await context.addInitScript(() => {
    window.__caissaSeoInitialStorage = {
      local: localStorage.length,
      session: sessionStorage.length
    };
  });

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  expect(await response?.text()).toContain('<title>CAISSA Chess — Play, Train, Analyze & Explore</title>');
  expect(await page.evaluate(() => window.__caissaSeoInitialStorage)).toEqual({ local: 0, session: 0 });
  await expect(page).toHaveTitle('CAISSA Chess — Play, Train, Analyze & Explore');
  await expect(page.getByRole('heading', { name: 'Welcome to CAISSA.' })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.caissa-chess.org/');

  const playResponsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/play');
  await page.locator('a[href="/play"]').first().click();
  const playResponse = await playResponsePromise;
  expect(playResponse.headers()['x-robots-tag']).toBe('index, follow');
  await expect(page).toHaveURL(/\/play$/);
  await expect(page).toHaveTitle('Play Chess Online | CAISSA Chess');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.caissa-chess.org/play');

  await page.locator('a[href="/"]').first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Welcome to CAISSA.' })).toBeVisible();
});

test('physical Home aliases redirect permanently to the canonical root', async ({ request }) => {
  for (const alias of ['/index.html', '/home.html']) {
    const response = await request.get(alias, { maxRedirects: 0 });
    expect(response.status(), alias).toBe(308);
    expect(response.headers().location, alias).toBe('/');
  }
});
