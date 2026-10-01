import { test, expect } from '@playwright/test';

const installAuthMock = async (page, auth) => {
  await page.route('**/js/auth-config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.route('**/js/caissa-auth.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.addInitScript(value => {
    const listeners = [];
    window.CAISSA_AUTH = {
      ...value,
      whenReady: async function whenReady() { return this; },
      onAuthStateChange(callback) {
        listeners.push(callback);
        if (this.isLoaded) callback(this);
        return () => {};
      },
      async signOut() {
        this.isSignedIn = false;
        this.userId = null;
        this.status = 'signed-out';
        listeners.forEach(callback => callback(this));
      },
      async getToken() { return 'browser-test-token'; }
    };
  }, auth);
};

const collectConsoleErrors = page => {
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));
  return errors;
};

test('desktop Home renders approved identity, route discovery and clean console', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installAuthMock(page, {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    status: 'signed-out',
    fullName: null,
    email: null,
    imageUrl: null
  });
  const errors = collectConsoleErrors(page);

  const response = await page.goto('/?utm_source=home-certification');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/?utm_source=home-certification$/);
  await expect(page.getByRole('heading', { name: 'Welcome to CAISSA.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CAISSA Chess home' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All tools' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CAISSA Classic', exact: true }).last()).toBeVisible();
  await expect(page.getByText('Coming next')).toBeVisible();
  await expect(page.getByText('Make it your own.')).toBeVisible();

  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    logoColor: getComputedStyle(document.querySelector('.brand-knight')).color,
    toolColors: [...document.querySelectorAll('.tool-heading i')].map(node => getComputedStyle(node).color)
  }));
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.logoColor).toBe('rgb(255, 255, 255)');
  expect(new Set(metrics.toolColors).size).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
  if (process.env.CAISSA_CAPTURE_HOME === '1') {
    await page.screenshot({ path: 'docs/home-season/screenshots/home-desktop.png', fullPage: true });
  }
});

test('mobile Home has no horizontal overflow and keeps Classic desktop-only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthMock(page, {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    status: 'signed-out'
  });
  const errors = collectConsoleErrors(page);

  await page.goto('/');
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await expect(page.getByRole('link', { name: 'CAISSA Classic', exact: true }).last()).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await page.keyboard.press('Tab');
  await expect(page.locator('.skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  expect(errors).toEqual([]);
  if (process.env.CAISSA_CAPTURE_HOME === '1') {
    await page.screenshot({ path: 'docs/home-season/screenshots/home-mobile.png', fullPage: true });
  }
});

test('connected Home renders only returned puzzle progress and preserves the empty state', async ({ page }) => {
  await installAuthMock(page, {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_home',
    status: 'authenticated',
    fullName: 'Ada Player',
    email: 'ada@example.test',
    imageUrl: null
  });
  await page.route('**/api/puzzles/progress', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ progress: { rating: 1876, solved: 12, failed: 3 }, persistent: true })
  }));
  const errors = collectConsoleErrors(page);

  await page.goto('/');
  await expect(page.getByText('Welcome back, Ada Player.')).toBeVisible();
  await expect(page.locator('.account-stats')).toContainText('1,876');
  await expect(page.locator('.account-stats')).toContainText('12');
  await expect(page.locator('.account-stats')).toContainText('15');
  expect(errors).toEqual([]);

  await page.route('**/api/puzzles/progress', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ progress: { rating: 1800, solved: 0, failed: 0 }, persistent: true })
  }));
  await page.reload();
  await expect(page.getByText('No saved puzzle activity yet. Your first completed puzzle will appear here.')).toBeVisible();
  await expect(page.locator('#account-content')).not.toContainText('1800');
});

test('tool routes remain reachable and their existing brand returns to Home', async ({ page, request }) => {
  const routes = [
    '/play', '/yahoo-classic', '/fics', '/play-online/playchess', '/play-online/fritz',
    '/puzzles', '/academy', '/endgame-trainer', '/endgame-library', '/endgame-tablebase',
    '/insights', '/analyze', '/pgn-replayer', '/spectator-tv', '/watch/lichess-tv',
    '/watch/live-blitz', '/watch/live-tournaments', '/arena', '/cheater-insight',
    '/tools/polyglot', '/opening-database', '/eco', '/game-library', '/history',
    '/dos-chess', '/vault', '/about', '/help', '/support', '/blog'
  ];
  for (const route of routes) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), route).toBeLessThan(400);
  }

  await page.goto('/analyze');
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(new URL(canonical).pathname).toBe('/analyze');

  await page.goto('/endgame-trainer');
  const home = page.getByRole('link', { name: 'CAISSA Chess — return home', exact: true });
  await expect(home).toBeVisible();
  await home.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Welcome to CAISSA.' })).toBeVisible();
});

