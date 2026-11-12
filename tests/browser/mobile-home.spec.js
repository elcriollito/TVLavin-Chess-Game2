import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const destinationOrder = [
  'play', 'puzzles', 'bots', 'coach', 'analyze', 'scanner', 'opening-explorer', 'watch-games', 'settings'
];
const capture = process.env.CAISSA_CAPTURE_MOBILE_HOME_S001 === '1';

async function installGuestAuth(page) {
  await page.route('**/js/auth-config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.route('**/js/caissa-auth.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.addInitScript(() => {
    window.CAISSA_AUTH = {
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      status: 'signed-out',
      whenReady: async function whenReady() { return this; },
      onAuthStateChange(callback) { callback(this); return () => {}; }
    };
  });
}

test('CAISSA Mobile renders the isolated nine-card app shell at phone widths', async ({ page }) => {
  await installGuestAuth(page);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 430, height: 932 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await expect(page.locator('[data-mobile-home]')).toBeVisible();
    await expect(page.locator('.shell')).toBeHidden();
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.mobile-nav')).toBeHidden();
    await expect(page.locator('.mobile-header-title')).toHaveText('CAISSA Mobile');
    await expect(page.locator('.mobile-hero img')).toBeVisible();
    expect(await page.locator('.mobile-hero img').evaluate(image => image.naturalWidth)).toBe(512);

    const cards = page.locator('[data-mobile-home] [data-mobile-destination]');
    await expect(cards).toHaveCount(9);
    expect(await cards.evaluateAll(items => items.map(item => item.dataset.mobileDestination))).toEqual(destinationOrder);
    for (const id of destinationOrder) {
      await expect(page.locator(`[data-mobile-home] [data-mobile-destination="${id}"]`)).toBeVisible();
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(0);
    const touchTargets = await page.locator('.mobile-card-list a, .mobile-card-list button, .mobile-card-summary')
      .evaluateAll(items => items.filter(item => item.getClientRects().length).map(item => item.getBoundingClientRect().height));
    expect(touchTargets.length).toBeGreaterThanOrEqual(9);
    touchTargets.forEach(height => expect(Math.round(height)).toBeGreaterThanOrEqual(44));
    if (capture) {
      await page.screenshot({
        path: `docs/mobile-home-season-001/screenshots/mobile-home-${viewport.width}.png`,
        fullPage: true
      });
    }
  }
});

test('mobile routes are direct and Watch Games opens Lichess without a provider submenu', async ({ page }) => {
  await installGuestAuth(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('[data-mobile-destination="play"]')).toHaveAttribute('href', '/play-hub');
  await expect(page.locator('[data-mobile-destination="puzzles"]')).toHaveAttribute('href', '/puzzles');
  await expect(page.locator('[data-mobile-destination="bots"]')).toHaveAttribute('href', '/play/bots');
  await expect(page.locator('[data-mobile-destination="coach"]')).toHaveAttribute('href', '/play/coach');
  await expect(page.locator('[data-mobile-destination="analyze"]')).toHaveAttribute('href', '/analyze');
  await expect(page.locator('[data-mobile-destination="scanner"]')).toHaveAttribute('href', '/scanner');
  await expect(page.locator('[data-mobile-destination="opening-explorer"]')).toHaveAttribute('href', '/opening-database');

  const watch = page.locator('[data-mobile-destination="watch-games"]');
  await expect(watch).toHaveAttribute('href', '/watch/lichess-tv');
  await expect(watch).toContainText('High-rated chess live');
  await expect(page.locator('[data-mobile-home] .mobile-submenu-options')).toHaveCount(0);
  await expect(page.locator('[data-mobile-home] a[href="/spectator-tv"]')).toHaveCount(0);

  await page.locator('[data-mobile-destination="play"]').click();
  await expect(page).toHaveURL(/\/play-hub$/);
  await page.reload();
  await expect(page).toHaveURL(/\/play-hub$/);
  await page.goBack();
  await expect(page.locator('[data-mobile-home]')).toBeVisible();

  await page.locator('[data-mobile-destination="analyze"]').click();
  await expect(page).toHaveURL(/\/analyze$/);
  await page.goBack();
  await expect(page.locator('[data-mobile-home]')).toBeVisible();
});

test('mobile Settings is a focused category sheet with working navigation and locale', async ({ page }) => {
  await installGuestAuth(page);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');

  const trigger = page.locator('[data-mobile-settings-open]');
  await trigger.click();
  const sheet = page.locator('#mobile-settings');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(sheet.locator('[data-mobile-settings-view]')).toHaveCount(8);

  await sheet.locator('[data-mobile-settings-view="language"]').click();
  await expect(sheet.locator('#mobile-settings-title')).toHaveText('Language');
  await expect(sheet.locator('[data-mobile-settings-panel="language"]')).toBeVisible();
  for (const locale of ['es', 'pt', 'en']) {
    await sheet.locator('#mobile-language').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect(await page.evaluate(() => localStorage.getItem('caissa.locale'))).toBe(locale);
    await page.reload();
    await page.locator('[data-mobile-settings-open]').click();
    await page.locator('#mobile-settings [data-mobile-settings-view="language"]').click();
    await expect(page.locator('#mobile-language')).toHaveValue(locale);
  }
  if (capture) {
    await page.screenshot({ path: 'docs/mobile-home-season-001/screenshots/mobile-settings-language.png' });
  }

  await sheet.locator('[data-mobile-settings-back]').click();
  await expect(sheet.locator('[data-mobile-settings-view]')).toHaveCount(8);
  await sheet.locator('[data-mobile-settings-close]').click();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('mobile Home has no serious accessibility violations and desktop remains the existing dashboard', async ({ page }) => {
  await installGuestAuth(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const serious = (await new AxeBuilder({ page }).include('[data-mobile-home]').analyze())
    .violations.filter(item => ['critical', 'serious'].includes(item.impact));
  expect(serious).toEqual([]);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('[data-mobile-home]')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome to CAISSA.' })).toBeVisible();
  await expect(page.locator('.dashboard')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);
});

test('every mobile destination has a refresh-safe local route owner', async ({ request }) => {
  for (const route of [
    '/play-hub', '/play/games', '/puzzles', '/play/bots', '/play/coach', '/analyze', '/scanner',
    '/opening-database', '/watch/lichess-tv', '/spectator-tv'
  ]) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
  }
});
