import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const hotfixOutput = name => `test-results/home-account-identity/${name}.png`;

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
  await expect(page.locator('.sidebar').getByRole('link', { name: 'CAISSA Online', exact: true })).toBeVisible();
  const onlineCallout = page.locator('.online-callout');
  await expect(onlineCallout.getByRole('heading', { name: 'CAISSA Online', exact: true })).toBeVisible();
  await expect(onlineCallout.getByText('Play against other people', { exact: true })).toBeVisible();
  await expect(onlineCallout.getByRole('link', { name: 'Play online', exact: true })).toBeVisible();
  await expect(page.locator('#all-tools-groups a[href="/online"]')).toHaveCount(1);
  await expect(page.locator('.sidebar').getByRole('link', { name: 'Scanner', exact: true })).toBeVisible();
  const scannerCard = page.locator('.scanner-home-card');
  await expect(scannerCard.getByText('CAISSA Scanner', { exact: true })).toBeVisible();
  await expect(scannerCard.getByText('Public Beta', { exact: true })).toBeVisible();
  await expect(scannerCard.getByText('Scan a chess position from your phone.', { exact: true })).toBeVisible();
  await expect(scannerCard.getByText('Open Scanner', { exact: false })).toBeVisible();
  const scannerAllTools = page.locator('#all-tools-groups a[href="/scanner"]');
  await expect(scannerAllTools).toHaveCount(1);
  await expect(scannerAllTools.getByText('CAISSA Scanner', { exact: true })).toBeVisible();
  await expect(scannerAllTools.getByText('Public Beta', { exact: true })).toBeVisible();
  await expect(scannerAllTools).toContainText('Scan chess positions from screenshots, websites, broadcasts, and photos of 2D boards.');
  await expect(page.getByRole('link', { name: 'CAISSA Classic', exact: true }).last()).toBeVisible();
  await expect(page.getByText('Coming next')).toBeVisible();
  await expect(page.getByText('New accounts are temporarily paused.')).toHaveCount(0);
  const topbar = page.locator('#topbar-account');
  await expect(topbar.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(topbar.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);
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

test('mobile Home presents the dedicated app shell and keeps Classic desktop-only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthMock(page, {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    status: 'signed-out'
  });
  const errors = collectConsoleErrors(page);

  await page.goto('/');
  await expect(page.locator('[data-mobile-home]')).toBeVisible();
  await expect(page.locator('.mobile-nav')).toBeHidden();
  await expect(page.locator('[data-mobile-destination="play"]')).toHaveAttribute('href', '/play/games');
  await expect(page.locator('[data-mobile-destination="scanner"]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'CAISSA Classic', exact: true }).last()).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await page.keyboard.press('Tab');
  await expect(page.locator('.mobile-skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mobile-main')).toBeFocused();
  expect(errors).toEqual([]);
  if (process.env.CAISSA_CAPTURE_HOME === '1') {
    await page.screenshot({ path: 'docs/home-season/screenshots/home-mobile.png', fullPage: true });
  }
});

test('auth check failure keeps Sign in and Settings available without the retired pause copy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await expect(topbar.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);
  await expect(topbar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(topbar.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/signin?redirect_url=%2F');

  const journey = page.locator('#account-content');
  await expect(journey.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(journey).not.toContainText('registration is temporarily paused');
  await expect(journey.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('Home and shared navigation reach CAISSA Online by keyboard without duplicate inventory links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installAuthMock(page, {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    status: 'signed-out'
  });

  await page.goto('/');
  const homeOnline = page.locator('.online-callout').getByRole('link', { name: 'Play online', exact: true });
  await homeOnline.focus();
  await expect(homeOnline).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/online$/);
  await expect(page.getByRole('heading', { name: 'Online Chess', exact: true })).toBeVisible();

  await page.goto('/endgame-library');
  const sharedOnline = page.getByRole('link', { name: 'CAISSA Online', exact: true });
  await expect(sharedOnline).toHaveCount(1);
  await sharedOnline.focus();
  await expect(sharedOnline).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/online$/);
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
  await expect(topbar.getByRole('link', { name: 'Register', exact: true })).toHaveCount(0);
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
  await expect(page.locator('.online-callout').getByRole('link', { name: 'Play online', exact: true })).toBeVisible();
  await expect(page.locator('.account-stats')).toContainText('1,876');
  await expect(page.locator('.account-stats')).toContainText('12');
  await expect(page.locator('.account-stats')).toContainText('15');
  const topbar = page.locator('#topbar-account');
  await expect(topbar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await topbar.getByRole('button', { name: /Ada Player account menu$/ }).click();
  await expect(topbar.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
  await topbar.getByRole('button', { name: 'Profile', exact: true }).click();
  expect(await page.evaluate(() => window.__caissaProfileOpened)).toBe(true);
  if (process.env.CAISSA_CAPTURE_HOME === '1') {
    await topbar.getByRole('button', { name: /Ada Player account menu$/ }).click();
    await page.screenshot({ path: 'docs/home-season/screenshots/home-controls-signed-in.png' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expect(page.locator('[data-mobile-home]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ada Player account menu$/ })).toBeHidden();
  expect(errors).toEqual([]);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/puzzles/progress', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ progress: { rating: 1800, solved: 0, failed: 0 }, persistent: true })
  }));
  await page.reload();
  await expect(page.getByText('No saved puzzle activity yet. Your first completed puzzle will appear here.')).toBeVisible();
  await expect(page.locator('#account-content')).not.toContainText('1800');
});

test('Home Account & identity reuses the native privacy panel across responsive breakpoints', async ({ page, browserName }) => {
  await installAuthMock(page, {
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_home_account',
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
  const accountRequests = [];
  await page.route('**/api/user/public-identity', route => {
    accountRequests.push({ path: '/api/user/public-identity', method: route.request().method() });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ identity: {
        displayName: 'SafeKnight', nickname: 'SafeKnight', fallbackAlias: 'Player-1122334455667788',
        hasCustomNickname: true, policyVersion: 1, version: 1, updatedAt: '2026-10-18T00:00:00Z'
      } })
    });
  });
  await page.route('**/api/account/privacy/summary', route => {
    accountRequests.push({ path: '/api/account/privacy/summary', method: route.request().method() });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        backendReady: true,
        requiresReauthentication: true,
        summary: {
          ownership: 'VERIFIED', accountState: 'ACTIVE',
          counts: { onlineGames: 4, puzzleProgress: 1, puzzleAttempts: 27, activeEntitlements: 0 },
          capabilities: { export: true, progressReset: true, accountDeletion: true },
          manualReviewRequired: false
        }
      })
    });
  });
  const errors = collectConsoleErrors(page);
  await page.goto('/');

  const topbar = page.locator('#topbar-account');
  const viewports = [
    { label: 'desktop-1440', width: 1440, height: 1000 },
    { label: 'tablet-885', width: 885, height: 900 }
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.locator('.season-label')).toHaveCount(0);
    await expect(page.getByText('Home · 2026 season', { exact: true })).toHaveCount(0);
    const trigger = topbar.getByRole('button', { name: 'AP Ada Player account menu', exact: true });
    await trigger.focus();
    await trigger.press('Enter');
    const actions = topbar.locator('.account-menu-action');
    await expect(actions).toHaveText(['Account & identity', 'Profile', 'Sign out']);

    const settings = topbar.getByRole('button', { name: 'Settings', exact: true });
    const accountAction = topbar.getByRole('button', { name: 'Account & identity', exact: true });
    const touchTargets = await Promise.all([settings, trigger, ...await actions.all()].map(async locator => {
      const box = await locator.boundingBox();
      return { width: box?.width || 0, height: box?.height || 0 };
    }));
    for (const target of touchTargets) {
      expect(Math.round(target.width)).toBeGreaterThanOrEqual(44);
      expect(Math.round(target.height)).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(0);
    if (process.env.CAISSA_CAPTURE_HOME_HOTFIX === '1' && browserName === 'chromium') {
      await page.screenshot({ path: hotfixOutput(`${viewport.label}-menu`) });
    }

    await accountAction.click();
    const dialog = page.locator('.caissa-public-identity-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account & identity', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Control your CAISSA account', exact: true })).toBeVisible();
    await expect(page.locator('[data-public-preview]')).toHaveText('SafeKnight');
    await expect(page.locator('[data-account-summary]')).toBeVisible();
    await expect(page.locator('[data-account-control-status]')).toHaveText('Recent identity verification required.');
    await expect(page.locator('[data-account-reauth]')).toBeVisible();
    await expect(page.locator('[data-account-controls]')).toBeHidden();
    expect(await page.evaluate(() => document.querySelector('.caissa-public-identity-dialog')
      ?.contains(document.activeElement))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(0);
    if (process.env.CAISSA_CAPTURE_HOME_HOTFIX === '1' && browserName === 'chromium') {
      await dialog.screenshot({ path: hotfixOutput(`${viewport.label}-dialog`) });
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }

  await topbar.getByRole('button', { name: 'AP Ada Player account menu', exact: true }).click();
  await topbar.getByRole('button', { name: 'Profile', exact: true }).click();
  expect(await page.evaluate(() => window.__caissaProfileOpened)).toBe(true);
  expect(accountRequests.every(request => request.method === 'GET')).toBe(true);
  expect(accountRequests.filter(request => request.path === '/api/account/privacy/summary')).toHaveLength(2);
  expect(accountRequests.filter(request => request.path === '/api/user/public-identity')).toHaveLength(2);
  const serious = (await new AxeBuilder({ page }).include('#topbar-account').analyze())
    .violations.filter(item => ['critical', 'serious'].includes(item.impact));
  expect(serious).toEqual([]);
  expect(errors).toEqual([]);
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
  await expect(page.getByText('New accounts are temporarily paused.')).toHaveCount(0);
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

  await page.getByRole('button', { name: /Second Player account menu$/ }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('New accounts are temporarily paused.')).toHaveCount(0);
  await expect(page.locator('#account-content')).not.toContainText('1,847');
  await expect(page.locator('#topbar-account').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

test('tool routes remain reachable and their existing brand returns to Home', async ({ page, request }) => {
  const routes = [
    '/play', '/yahoo-classic', '/fics', '/play-online/playchess', '/play-online/fritz',
    '/puzzles', '/academy', '/mentor', '/endgame-trainer', '/endgame-library', '/endgame-tablebase',
    '/insights', '/analyze', '/pgn-replayer', '/spectator-tv', '/watch/lichess-tv',
    '/watch/live-blitz', '/watch/live-tournaments', '/arena', '/cheater-insight',
    '/tools/polyglot', '/opening-database', '/eco', '/game-library/champions', '/game-library', '/history',
    '/dos-chess', '/downloads', '/scanner', '/about', '/help', '/blog'
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

