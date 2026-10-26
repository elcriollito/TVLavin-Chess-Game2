import { test, expect } from '@playwright/test';

const establishedRoutes = ['/play', '/online', '/scanner', '/puzzles', '/opening-trainer', '/help', '/about'];

test('legacy Support URLs redirect permanently to Help', async ({ request, page }) => {
  for (const source of ['/support', '/support/', '/support.html']) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status(), source).toBe(308);
    expect(response.headers().location, source).toBe('/help');
  }

  await page.goto('/support');
  expect(new URL(page.url()).pathname).toBe('/help');
  await expect(page.getByRole('heading', { name: /Help/i })).toBeVisible();
});

test('navigation and localized UI expose no contribution destination', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa.locale', 'en'));
  await page.goto('/help');

  for (const locale of ['en', 'es', 'pt']) {
    await page.locator('[data-caissa-locale-select]').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('[data-nav-key="help"]')).toHaveCount(1);
    await expect(page.locator('[data-nav-key="support"]')).toHaveCount(0);
    await expect(page.getByText(/Support CAISSA|Apoya a CAISSA|Apoie a CAISSA/, { exact: true })).toHaveCount(0);
  }
});

test('desktop and mobile Help layouts remain bounded after the redirect', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto('/support');
    expect(new URL(page.url()).pathname).toBe('/help');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px horizontal overflow`).toBeLessThanOrEqual(1);
    await expect(page.locator('script[src*="paypal"], iframe[src*="paypal"], [id^="paypal-container"]')).toHaveCount(0);
  }
});

test('core routes load without PayPal, Hosted Button, or contribution requests', async ({ page, request }) => {
  const paymentRequests = [];
  page.on('request', current => {
    if (/paypal|paypalobjects|venmo/i.test(current.url())) paymentRequests.push(current.url());
  });

  for (const route of establishedRoutes) {
    const response = await request.get(route);
    expect(response.status(), route).toBeLessThan(400);
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('script[src*="paypal"], iframe[src*="paypal"], [id^="paypal-container"]')).toHaveCount(0);
  }
  expect(paymentRequests).toEqual([]);
});
