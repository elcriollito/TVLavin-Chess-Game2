import { test, expect } from '@playwright/test';
import { PLAY_V2_PUBLIC_BETA_DOCUMENT } from '../../api/_lib/play-v2-public-beta-document.js';

const destinations = [
  { id: 'play', route: '/play/games', title: 'Play', back: '/play-hub', backLabel: 'Play Hub', board: '#chessboard', ready: '[data-caissa-games-panel]' },
  { id: 'puzzles', route: '/puzzles', title: 'CAISSA Puzzles', back: '/', backLabel: 'CAISSA Mobile Home', board: '#puzzle-board', ready: '#categories button' },
  { id: 'bots', route: '/play/bots', title: 'Play Bots', back: '/', backLabel: 'CAISSA Mobile Home', board: '#chessboard', ready: '[data-caissa-bots-panel]' },
  { id: 'coach', route: '/play/coach', title: 'Play Coach', back: '/', backLabel: 'CAISSA Mobile Home', board: '#chessboard', ready: '[data-caissa-native-coach-panel]' }
];
const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 }
];
const capture = process.env.CAISSA_CAPTURE_FOUR_PAGE_NAVIGATION === '1';

async function prepare(page) {
  // The local server normally serves the source HTML. Exercise the document
  // embedded in Vercel middleware while keeping local assets and route fixtures.
  await page.route(/\/play\/(games|bots|coach)$/, route => route.fulfill({
    contentType: 'text/html',
    body: PLAY_V2_PUBLIC_BETA_DOCUMENT
  }));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('**/js/auth-config.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: ''
  }));
  await page.route('**/js/caissa-auth.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: ''
  }));
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
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

async function visibleCount(page, selector) {
  return page.locator(selector).evaluateAll(elements => elements.filter(element => element.getClientRects().length).length);
}

for (const viewport of viewports) {
  test(`four Mobile 2.0 destinations use the isolated back header at ${viewport.width}px`, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize(viewport);

    for (const destination of destinations) {
      await page.goto(destination.route);
      const header = page.locator('[data-caissa-mobile2-destination-header]');
      const back = header.locator('[data-caissa-mobile2-back]');
      const board = page.locator(destination.board);

      await expect(header).toBeVisible();
      await expect(header.locator('[data-caissa-mobile2-destination-title]')).toHaveText(destination.title);
      await expect(back).toHaveAttribute('href', destination.back);
      await expect(back).toHaveAttribute('aria-label', `Back to ${destination.backLabel} from ${destination.title}`);
      await expect(board).toBeVisible();
      await expect(page.locator(destination.ready).first()).toBeVisible();

      const backBox = await back.boundingBox();
      const headerBox = await header.boundingBox();
      const boardBox = await board.boundingBox();
      expect(backBox.height).toBeGreaterThanOrEqual(44);
      expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(boardBox.y);
      expect(boardBox.width).toBeLessThanOrEqual(viewport.width);
      expect(Math.abs(boardBox.width - boardBox.height)).toBeLessThanOrEqual(1);

      expect(await visibleCount(page,
        '#mobileNavToggle, .caissa-standalone-mobile-toggle, .mobile-quick-actions [data-mobile-action="menu"]'))
        .toBe(0);
      await expect(page.locator('#mainNav')).toHaveAttribute('inert', '');
      await expect(page.locator('#mainNav')).toHaveAttribute('aria-hidden', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => window.CaissaMobile2DestinationHeader?.isMobileNavigationIsolated?.()))
        .toBe(true);

      if (capture) {
        await page.screenshot({
          path: `docs/mobile-home-season-001/screenshots/navigation-${destination.id}-${viewport.width}.png`,
          fullPage: true
        });
      }

      await back.click();
      await expect(page).toHaveURL(new RegExp(`${destination.back.replaceAll('/', '\\/')}$`));
      if (destination.back === '/') await expect(page.locator('[data-mobile-home]')).toBeVisible();
      else await expect(page.locator('[data-play-hub-destination]')).toHaveCount(4);
    }
  });

  test(`browser Back returns from all four destinations at ${viewport.width}px`, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize(viewport);
    for (const destination of destinations) {
      await page.goto('/');
      await page.locator(`[data-mobile-destination="${destination.id}"]`).click();
      if (destination.id === 'play') {
        await expect(page).toHaveURL(/\/play-hub$/);
        await page.locator('[data-play-hub-destination="play"]').click();
      }
      await expect(page).toHaveURL(new RegExp(`${destination.route.replaceAll('/', '\\/')}$`));
      await expect(page.locator('[data-caissa-mobile2-destination-header]')).toBeVisible();
      await page.goBack();
      if (destination.id === 'play') {
        await expect(page.locator('[data-play-hub-destination]')).toHaveCount(4);
        await page.goBack();
      }
      await expect(page.locator('[data-mobile-home]')).toBeVisible();
    }
  });
}

test('Play mode tabs keep the isolated header in sync without exposing legacy navigation', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play/games');

  for (const mode of [
    { id: 'bots', path: '/play/bots', title: 'Play Bots' },
    { id: 'coach', path: '/play/coach', title: 'Play Coach' },
    { id: 'games', path: '/play/games', title: 'Play' }
  ]) {
    await page.locator(`[data-shell-mode="${mode.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${mode.path.replaceAll('/', '\\/')}$`));
    await expect(page.locator('[data-caissa-mobile2-destination-title]')).toHaveText(mode.title);
    expect(await visibleCount(page, '#mobileNavToggle, .mobile-quick-actions [data-mobile-action="menu"]')).toBe(0);
    await expect(page.locator('#mainNav')).toHaveAttribute('inert', '');
  }

  expect(await page.evaluate(() => [
    '/analyze', '/opening-database', '/watch/lichess-tv'
  ].every(path => window.CaissaMobile2DestinationHeader.owns(path) === true))).toBe(true);
  expect(await page.evaluate(() => [
    '/scanner', '/settings'
  ].every(path => window.CaissaMobile2DestinationHeader.owns(path) === false))).toBe(true);
});

test('desktop Play, Puzzles, Bots and Coach preserve their existing sidebar and board layout', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const destination of destinations) {
    await page.goto(destination.route);
    await expect(page.locator(destination.board)).toBeVisible();
    await expect(page.locator('#mainNav')).toBeVisible();
    await expect(page.locator('[data-caissa-mobile2-destination-header]')).toBeHidden();
    await expect(page.locator('#mainNav')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#mainNav')).not.toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
    if (destination.route.startsWith('/play/')) {
      await expect(page.locator('.caissa-simplified-shell__purpose')).toBeVisible();
    }
  }
});
