import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
});

function createGate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

async function delayBoardInitialization(page) {
  const requestObserved = createGate();
  const releaseModule = createGate();
  await page.route('**/js/board/caissa-legacy-quiet-drag-adapter.js', async route => {
    requestObserved.release();
    await releaseModule.promise;
    await route.continue();
  });
  return {
    requested: requestObserved.promise,
    release: releaseModule.release
  };
}

async function expectActiveTab(page, name, { focused = true } = {}) {
  const moves = page.getByRole('tab', { name: 'Moves', exact: true });
  const games = page.getByRole('tab', { name: 'Search Games', exact: true });
  const active = name === 'games' ? games : moves;
  const inactive = name === 'games' ? moves : games;
  await expect(active).toHaveAttribute('aria-selected', 'true');
  await expect(active).toHaveAttribute('tabindex', '0');
  await expect(inactive).toHaveAttribute('aria-selected', 'false');
  await expect(inactive).toHaveAttribute('tabindex', '-1');
  if (name === 'moves') {
    await expect(page.locator('#odbMovesPanel')).toBeVisible();
    await expect(page.locator('#odbGamesPanel')).toBeHidden();
  } else {
    await expect(page.locator('#odbMovesPanel')).toBeHidden();
    await expect(page.locator('#odbGamesPanel')).toBeVisible();
  }
  if (focused) await expect(active).toBeFocused();
}

test('Opening Database tabs work before delayed board initialization and preserve early selection', async ({ page }) => {
  const boundary = await delayBoardInitialization(page);
  const navigation = page.goto('/opening-database', { waitUntil: 'domcontentloaded' });
  await boundary.requested;
  await navigation;

  const moves = page.getByRole('tab', { name: 'Moves', exact: true });
  const games = page.getByRole('tab', { name: 'Search Games', exact: true });

  try {
    await moves.focus();
    await page.keyboard.press('End');
    await expectActiveTab(page, 'games');

    await page.keyboard.press('Home');
    await expectActiveTab(page, 'moves');

    await page.keyboard.press('ArrowLeft');
    await expectActiveTab(page, 'games');

    await page.keyboard.press('ArrowRight');
    await expectActiveTab(page, 'moves');

    await page.keyboard.press('Tab');
    await expect(page.locator('#odbMovesPopularBtn')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(moves).toBeFocused();

    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await expect(page.locator('#odbSearchGamesBtn')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(games).toBeFocused();

    await moves.focus();
    await page.keyboard.press('Space');
    await expectActiveTab(page, 'moves');

    await games.focus();
    await page.keyboard.press('Enter');
    await expectActiveTab(page, 'games');

    await moves.click();
    await expectActiveTab(page, 'moves');
    await games.click();
    await expectActiveTab(page, 'games');
  } finally {
    boundary.release();
  }

  await expect(page.locator('#openingDbBoard .board-b72b1')).toBeVisible();
  await expectActiveTab(page, 'games');
});

test('Opening Database tabs work after fast board initialization', async ({ page }) => {
  await page.goto('/opening-database');
  const moves = page.getByRole('tab', { name: 'Moves', exact: true });
  await moves.focus();
  await page.keyboard.press('End');
  await expectActiveTab(page, 'games');
  await page.keyboard.press('Home');
  await expectActiveTab(page, 'moves');
});

test('Opening Database tab binding is idempotent', async ({ page }) => {
  await page.addInitScript(() => {
    const addEventListener = EventTarget.prototype.addEventListener;
    window.__openingDbTabListenerCount = 0;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (['odbTabMoves', 'odbTabGames'].includes(this.id) && ['keydown', 'click'].includes(type)) {
        window.__openingDbTabListenerCount += 1;
      }
      return addEventListener.call(this, type, listener, options);
    };
  });
  await page.route('**/js/opening-database.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "  if (document.readyState === 'loading') {";
    expect(source).toContain(marker);
    await route.fulfill({
      response,
      body: source.replace(marker, `  window.__testBindOpeningDbTabInteractions = bindOpeningDbTabInteractions;\n${marker}`)
    });
  });

  await page.goto('/opening-database');
  await expect.poll(() => page.evaluate(() => window.__openingDbTabListenerCount)).toBe(4);
  await page.evaluate(() => {
    window.__testBindOpeningDbTabInteractions();
    window.__testBindOpeningDbTabInteractions();
  });
  await expect.poll(() => page.evaluate(() => window.__openingDbTabListenerCount)).toBe(4);
});

test('Opening Database tabs retain truthful semantics when board initialization fails', async ({ page }) => {
  await page.route('**/assets/vendor/chessboard.js/chessboard-1.0.0.min.js', route => route.abort('failed'));
  await page.goto('/opening-database');
  await expect(page.locator('#openingDbBoard')).toContainText('The board could not load');

  const moves = page.getByRole('tab', { name: 'Moves', exact: true });
  await moves.focus();
  await page.keyboard.press('End');
  await expectActiveTab(page, 'games');
  await page.keyboard.press('Home');
  await expectActiveTab(page, 'moves');
});
