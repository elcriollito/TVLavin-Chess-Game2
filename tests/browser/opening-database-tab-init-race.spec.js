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
  return { requested: requestObserved.promise, release: releaseModule.release };
}

const names = ['Analysis', 'Games', 'Explore'];

async function expectActiveTab(page, name, { focused = true } = {}) {
  for (const candidate of names) {
    const tab = page.getByRole('tab', { name: candidate, exact: true });
    const selected = candidate === name;
    await expect(tab).toHaveAttribute('aria-selected', selected ? 'true' : 'false');
    await expect(tab).toHaveAttribute('tabindex', selected ? '0' : '-1');
  }
  const panels = {
    Analysis: '#odbAnalysisPanel',
    Games: '#odbGamesPanel',
    Explore: '#odbMovesPanel'
  };
  for (const [candidate, selector] of Object.entries(panels)) {
    if (candidate === name) await expect(page.locator(selector)).toBeVisible();
    else await expect(page.locator(selector)).toBeHidden();
  }
  if (focused) await expect(page.getByRole('tab', { name, exact: true })).toBeFocused();
}

test('tabs work before delayed board initialization and preserve early selection', async ({ page }) => {
  const boundary = await delayBoardInitialization(page);
  const navigation = page.goto('/opening-database', { waitUntil: 'domcontentloaded' });
  await boundary.requested;
  await navigation;
  const explore = page.getByRole('tab', { name: 'Explore', exact: true });

  try {
    await explore.focus();
    await page.keyboard.press('Home');
    await expectActiveTab(page, 'Analysis');
    await page.keyboard.press('ArrowRight');
    await expectActiveTab(page, 'Games');
    await page.keyboard.press('End');
    await expectActiveTab(page, 'Explore');
    await page.keyboard.press('ArrowRight');
    await expectActiveTab(page, 'Analysis');
    await page.keyboard.press('ArrowLeft');
    await expectActiveTab(page, 'Explore');

    await page.keyboard.press('Tab');
    await expect(page.locator('#odbMovesPopularBtn')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(explore).toBeFocused();

    for (const tabName of names) {
      const tab = page.getByRole('tab', { name: tabName, exact: true });
      await tab.click();
      await expectActiveTab(page, tabName, { focused: false });
    }
  } finally {
    boundary.release();
  }

  await expect(page.locator('#openingDbBoard .board-b72b1')).toBeVisible();
  await expectActiveTab(page, 'Explore', { focused: false });
});

test('tabs work after fast board initialization', async ({ page }) => {
  await page.goto('/opening-database');
  const explore = page.getByRole('tab', { name: 'Explore', exact: true });
  await explore.focus();
  await page.keyboard.press('Home');
  await expectActiveTab(page, 'Analysis');
  await page.keyboard.press('End');
  await expectActiveTab(page, 'Explore');
});

test('tab binding is idempotent', async ({ page }) => {
  await page.addInitScript(() => {
    const addEventListener = EventTarget.prototype.addEventListener;
    window.__openingDbTabListenerCount = 0;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (['odbTabAnalysis', 'odbTabGames', 'odbTabMoves'].includes(this.id) && ['keydown', 'click'].includes(type)) {
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
  await expect.poll(() => page.evaluate(() => window.__openingDbTabListenerCount)).toBe(6);
  await page.evaluate(() => {
    window.__testBindOpeningDbTabInteractions();
    window.__testBindOpeningDbTabInteractions();
  });
  await expect.poll(() => page.evaluate(() => window.__openingDbTabListenerCount)).toBe(6);
});

test('tabs retain truthful semantics when board initialization fails', async ({ page }) => {
  await page.route('**/assets/vendor/chessboard.js/chessboard-1.0.0.min.js', route => route.abort('failed'));
  await page.goto('/opening-database');
  await expect(page.locator('#openingDbBoard')).toContainText('The board could not load');
  const explore = page.getByRole('tab', { name: 'Explore', exact: true });
  await explore.focus();
  await page.keyboard.press('Home');
  await expectActiveTab(page, 'Analysis');
  await page.keyboard.press('End');
  await expectActiveTab(page, 'Explore');
});
