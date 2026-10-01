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
      clerk: {
        async openUserProfile() { window.__caissaProfileOpened = true; }
      },
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
      __setAuthForTest(patch) {
        Object.assign(this, patch);
        listeners.forEach(callback => callback(this));
      },
      async getToken() { return `browser-test-token-${this.userId || 'guest'}`; }
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
  const topbar = page.locator('#topbar-account');
  await expect(topbar.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(topbar.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
  await expect(topbar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(topbar.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
    'href', '/signin?redirect_url=%2F%3Futm_source%3Dhome-certification'
  );

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
    await page.screenshot({ path: 'docs/home-season/screenshots/home-controls-guest.png' });
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
  const topbar = page.locator('#topbar-account');
  await expect(topbar.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(topbar.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
  await expect(topbar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
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

test('auth check failure keeps Sign in, Register and Settings available without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthMock(page, {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    status: 'unavailable'
  });
  const errors = collectConsoleErrors(page);

  await page.goto('/');
  await expect(page.getByText('Account status unavailable.')).toBeVisible();
  const topbar = page.locator('#topbar-account');
  await expect(topbar.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(topbar.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
  await expect(topbar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(topbar.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/signin?redirect_url=%2F');
  await expect(topbar.getByRole('link', { name: 'Register', exact: true })).toHaveAttribute('href', '/signup?redirect_url=%2F');

  const journey = page.locator('#account-content');
  await expect(journey.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(journey.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('loading auth keeps entry points available and Settings persists the real locale preference', async ({ page }) => {
  await installAuthMock(page, {
    isLoaded: false,
    isSignedIn: false,
    userId: null,
    status: 'loading'
  });
  await page.goto('/');

  const topbar = page.locator('#topbar-account');
  await expect(topbar.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(topbar.getByRole('link', { name: 'Register', exact: true })).toBeVisible();
  const settings = topbar.getByRole('button', { name: 'Settings', exact: true });
  await settings.click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.locator('#home-language').selectOption('es');
  expect(await page.evaluate(() => localStorage.getItem('caissa.locale'))).toBe('es');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
  await expect(settings).toBeFocused();
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
  const topbar = page.locator('#topbar-account');
  await expect(topbar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await topbar.getByRole('button', { name: 'Account menu for Ada Player', exact: true }).click();
  await expect(topbar.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
  await topbar.getByRole('button', { name: 'Profile', exact: true }).click();
  expect(await page.evaluate(() => window.__caissaProfileOpened)).toBe(true);
  if (process.env.CAISSA_CAPTURE_HOME === '1') {
    await topbar.getByRole('button', { name: 'Account menu for Ada Player', exact: true }).click();
    await page.screenshot({ path: 'docs/home-season/screenshots/home-controls-signed-in.png' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Account menu for Ada Player', exact: true })).toBeVisible();
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

test('Home loads progress after sign-in and keeps API errors account-scoped', async ({ page }) => {
  await installAuthMock(page, {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    status: 'signed-out',
    fullName: null,
    email: null,
    imageUrl: null
  });
  let failProgress = false;
  let progressRequests = 0;
  await page.route('**/api/puzzles/progress', route => {
    progressRequests += 1;
    return route.fulfill(failProgress ? {
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'temporarily unavailable' })
    } : {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ progress: { rating: 1912, solved: 7, failed: 2 }, persistent: true })
    });
  });

  await page.goto('/');
  await expect(page.getByText('Make it your own.')).toBeVisible();
  await page.evaluate(() => window.CAISSA_AUTH.__setAuthForTest({
    isSignedIn: true,
    userId: 'user_alexander',
    status: 'authenticated',
    fullName: 'Alexander Lavin',
    email: 'alexander@example.test'
  }));
  await expect(page.getByText('Welcome back, Alexander Lavin.')).toBeVisible();
  await expect(page.locator('.account-stats')).toContainText('1,912');
  await expect(page.locator('.account-stats')).toContainText('9');

  expect(progressRequests).toBeGreaterThan(0);

  failProgress = true;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByText('Your account is connected, but saved puzzle progress is unavailable right now.')).toBeVisible();
  await expect(page.locator('#account-content')).not.toContainText('1,912');
});

test('Home refreshes restored progress and rejects stale account responses', async ({ page }) => {
  await installAuthMock(page, {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_one',
    status: 'authenticated',
    fullName: 'First Player',
    email: 'first@example.test',
    imageUrl: null
  });

  const staleRequests = [];
  let currentProgress = { rating: 1764, solved: 8, failed: 3 };
  await page.route('**/api/puzzles/progress', async route => {
    const authorization = route.request().headers().authorization;
    if (authorization === 'Bearer browser-test-token-user_one') {
      staleRequests.push(route);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ progress: currentProgress, persistent: true })
    });
  });

  await page.goto('/');
  await expect.poll(() => staleRequests.length).toBeGreaterThan(0);
  await expect(page.getByText('Loading your saved puzzle progress…')).toBeVisible();
  await page.evaluate(() => window.CAISSA_AUTH.__setAuthForTest({
    userId: 'user_two', fullName: 'Second Player', email: 'second@example.test'
  }));
  await expect(page.getByText('Welcome back, Second Player.')).toBeVisible();
  await expect(page.locator('.account-stats')).toContainText('1,764');

  await Promise.all(staleRequests.map(route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ progress: { rating: 1600, solved: 1, failed: 0 }, persistent: true })
  })));
  await expect(page.locator('.account-stats')).toContainText('1,764');
  await expect(page.locator('#account-content')).not.toContainText('1,600');

  currentProgress = { rating: 1847, solved: 12, failed: 4 };
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('.account-stats')).toContainText('1,847');
  await expect(page.locator('.account-stats')).toContainText('16');

  await page.getByRole('button', { name: 'Account menu for Second Player', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Make it your own.')).toBeVisible();
  await expect(page.locator('#account-content')).not.toContainText('1,847');
  await expect(page.locator('#topbar-account').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
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

