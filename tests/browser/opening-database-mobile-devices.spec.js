import { devices, test, expect } from '@playwright/test';

const { defaultBrowserType: _iphoneDefaultBrowser, ...iphone13 } = devices['iPhone 13'];
const { defaultBrowserType: _pixelDefaultBrowser, ...pixel7 } = devices['Pixel 7'];

const fixture = {
  '66be37feb35e7d6a': {
    moves: [
      { uci: 'e2e4', san: 'e4', games: 1930000, w: 733400, d: 598300, l: 598300 },
      { uci: 'd2d4', san: 'd4', games: 900000, w: 351000, d: 297000, l: 252000 }
    ]
  },
  'fa6f7503caab4032': {
    moves: [{ uci: 'c7c5', san: 'c5', games: 700000, w: 280000, d: 230000, l: 190000 }]
  }
};

async function installFixture(page) {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 'v24_device_test',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/v24_device_test',
      generatedAt: '2026-11-07T12:00:00.000Z',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/v24_device_test/*.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(fixture)
  }));
}

async function touchSquare(page, square) {
  const point = await page.locator(`#openingDbBoard .square-${square}`).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.touchscreen.tap(point.x, point.y);
}

async function expectMobileAcceptance(page) {
  await installFixture(page);
  await page.goto('/opening-database?quiet-drag-lab=1');
  await expect(page.locator('#openingDbBoard .piece-417db')).toHaveCount(32);
  await expect(page.locator('#odbStatsBody tr')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => !!window.__openingDbQuietDrag)).toBe(true);
  const initialLayout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    tableDisplay: getComputedStyle(document.querySelector('.openingdb-stats-table')).display,
    rowHeight: document.querySelector('#odbStatsBody tr').getBoundingClientRect().height
  }));
  expect(initialLayout.overflow).toBeLessThanOrEqual(1);
  expect(initialLayout.tableDisplay).toBe('block');
  expect(initialLayout.rowHeight).toBeLessThanOrEqual(52);

  await touchSquare(page, 'e2');
  await expect(page.locator('#openingDbBoard .square-e2')).toHaveAttribute('data-caissa-tap-selected', 'true');
  await expect(page.locator('#openingDbBoard [data-caissa-tap-legal]')).toHaveCount(2);
  await touchSquare(page, 'e4');
  await expect.poll(() => page.evaluate(() => window.__openingDbQuietDrag.getSnapshot().history)).toEqual(['e4']);
  await expect(page.locator('#openingDbBoard .square-e4 .piece-417db')).toHaveAttribute('data-piece', 'wP');
  await expect.poll(() => page.evaluate(() => window.__openingDbQuietDrag.getSnapshot().interaction.positionViewRequests)).toBeGreaterThan(1);
  const completed = await page.evaluate(() => window.__openingDbQuietDrag.getSnapshot());
  expect(completed.interaction.tapMovesApplied).toBe(1);
  expect(completed.interaction.boardMovesApplied).toBe(1);
  expect(completed.adapter.representationCount).toBe(0);
}

test.describe('iPhone-class touch', () => {
  test.use(iphone13);

  test('WebKit supports tap-to-move and compact statistics in portrait and landscape', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'This acceptance profile targets iPhone-class WebKit.');
    await expectMobileAcceptance(page);
    await page.setViewportSize({ width: 844, height: 390 });
    const landscape = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      boardPieces: document.querySelectorAll('#openingDbBoard .piece-417db').length
    }));
    expect(landscape.overflow).toBeLessThanOrEqual(1);
    expect(landscape.boardPieces).toBe(32);
  });
});

test.describe('Android-class touch', () => {
  test.use(pixel7);

  test('Chromium supports tap-to-move and compact statistics', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'This acceptance profile targets Android-class Chromium.');
    await expectMobileAcceptance(page);
  });
});
