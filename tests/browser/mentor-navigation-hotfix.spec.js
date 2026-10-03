import { test, expect } from '@playwright/test';

async function installAuthMock(page) {
  await page.route('**/js/auth-config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.route('**/js/caissa-auth.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.addInitScript(() => {
    window.CAISSA_AUTH = {
      isLoaded: true, isSignedIn: false, userId: null, status: 'signed-out',
      whenReady: async function whenReady() { return this; },
      onAuthStateChange(callback) { callback(this); return () => {}; },
      async getToken() { return null; }
    };
  });
}

test('Home All Tools enters Mentor, marks it active and returns Home', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installAuthMock(page);
  await page.goto('/');

  const card = page.locator('#all-tools-groups a[data-tool-id="mentor"]');
  await expect(card).toHaveCount(1);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('href', '/mentor');
  await expect(card).toContainText('CAISSA Mentor');
  await expect(card).toContainText('Personal coaching, game review and memory training');
  await card.click();

  await expect(page).toHaveURL(/\/mentor$/);
  const mentor = page.locator('[data-caissa-standalone-sidebar] a[data-nav-key="mentor"]');
  await expect(mentor).toHaveCount(1);
  await expect(mentor).toBeVisible();
  await expect(mentor).toHaveClass(/active/);
  await expect(mentor).toHaveAttribute('aria-current', 'page');

  await page.locator('[data-caissa-standalone-sidebar] a[data-nav-key="home"]').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Welcome to CAISSA.' })).toBeVisible();
});

test('Mentor shared navigation remains responsive without duplicate links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthMock(page);
  await page.goto('/mentor');

  await expect(page.locator('[data-caissa-standalone-sidebar] a[data-nav-key="mentor"]')).toHaveCount(1);
  await page.locator('.caissa-standalone-mobile-toggle').click();
  const mentor = page.locator('[data-caissa-standalone-sidebar] a[data-nav-key="mentor"]');
  await expect(mentor).toBeVisible();
  await expect(mentor).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
