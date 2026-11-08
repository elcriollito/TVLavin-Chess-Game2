import { chromium } from '@playwright/test';

const baseUrl = process.env.OPENING_DB_CAPTURE_BASE_URL || 'http://127.0.0.1:8012';
const outputDir = 'docs/openingdb/v2.4-mobile-ux';
const fixture = {
  '66be37feb35e7d6a': {
    moves: [
      { uci: 'e2e4', san: 'e4', games: 1930000, w: 733400, d: 598300, l: 598300 },
      { uci: 'd2d4', san: 'd4', games: 900000, w: 351000, d: 297000, l: 252000 },
      { uci: 'g1f3', san: 'Nf3', games: 445000, w: 164650, d: 142400, l: 137950 }
    ]
  },
  'fa6f7503caab4032': {
    moves: [
      { uci: 'c7c5', san: 'c5', games: 700000, w: 280000, d: 230000, l: 190000 },
      { uci: 'e7e5', san: 'e5', games: 650000, w: 250000, d: 210000, l: 190000 }
    ]
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
      activeVersion: 'v24_capture',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/v24_capture',
      generatedAt: '2026-11-07T12:00:00.000Z',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/v24_capture/*.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(fixture)
  }));
}

async function tapSquare(page, square) {
  await page.locator(`#openingDbBoard .square-${square}`).tap();
}

async function readyPage(context, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await installFixture(page);
  await page.goto(`${baseUrl}/opening-database?quiet-drag-lab=1`, { waitUntil: 'networkidle' });
  await page.locator('#odbStatsBody tr').first().waitFor();
  await page.evaluate(() => document.fonts?.ready);
  return page;
}

const browser = await chromium.launch();
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true
});

try {
  const page = await readyPage(mobile, { width: 390, height: 844 });
  await page.screenshot({ path: `${outputDir}/after-mobile-compact-390.png`, fullPage: true });

  await tapSquare(page, 'e2');
  await page.locator('#openingDbBoard .square-e2[data-caissa-tap-selected="true"]').waitFor();
  await page.locator('.openingdb-board-column').screenshot({ path: `${outputDir}/tap-selection-390.png` });

  await tapSquare(page, 'e4');
  await page.locator('#openingDbBoard .square-e4 .piece-417db[data-piece="wP"]').waitFor();
  await page.locator('.openingdb-board-column').screenshot({ path: `${outputDir}/tap-complete-390.png` });

  await page.close();

  const landscape = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    hasTouch: true
  });
  const landscapePage = await readyPage(landscape, { width: 844, height: 390 });
  await landscapePage.locator('.openingdb-workspace').scrollIntoViewIfNeeded();
  await landscapePage.screenshot({ path: `${outputDir}/after-landscape-844x390.png` });
  await landscape.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await readyPage(desktop, { width: 1440, height: 900 });
  await desktopPage.locator('.openingdb-product-grid').screenshot({ path: `${outputDir}/after-desktop-1440.png` });
  await desktop.close();
} finally {
  await mobile.close();
  await browser.close();
}
