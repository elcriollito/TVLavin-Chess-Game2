import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const openingFixture = {
  '66be37feb35e7d6a': {
    moves: [
      { uci: 'e2e4', san: 'e4', games: 1930000, w: 733400, d: 598300, l: 598300 },
      { uci: 'd2d4', san: 'd4', games: 900000, w: 351000, d: 297000, l: 252000 },
      { uci: 'g1f3', san: 'Nf3', games: 450000, w: 171000, d: 157500, l: 121500 }
    ]
  }
};
const lichessFrameUrl = 'https://lichess.org/tv/frame?theme=brown&bg=dark';
const lichessFrame = '<!doctype html><html><body><div style="width:100%;aspect-ratio:1;background:#b98b62">Lichess fixture board</div></body></html>';
const destinations = [
  { id: 'analyze', route: '/analyze', title: 'Analyze', ready: '#analyzeChessboard .caissa-board', first: '#analyzeChessboard' },
  { id: 'opening-explorer', route: '/opening-database', title: 'Opening Explorer', ready: '#odbStatsBody tr', first: '.openingdb-board-shell' },
  { id: 'watch-games', route: '/watch/lichess-tv', title: 'Watch Games', ready: '[data-lichess-tv-shell]', first: '.lichess-tv-heading' }
];
const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 }
];
const capture = process.env.CAISSA_CAPTURE_NAV_COMPLETION_S001 === '1';

async function prepare(page) {
  await instrumentPlay(page, {
    bestMove: 'e2e4', candidateMoves: ['e2e4 e7e5', 'd2d4 d7d5'],
    cp: 28, continuousDepths: [4, 8, 12], continuousDepthDelayMs: 80
  });
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
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('**/js/auth-config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.route('**/js/caissa-auth.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 'v24_navigation_completion',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/v24_navigation_completion',
      generatedAt: '2026-11-11T12:00:00.000Z',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/v24_navigation_completion/*.json', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(openingFixture)
  }));
  await page.route(lichessFrameUrl, route => route.fulfill({ status: 200, contentType: 'text/html', body: lichessFrame }));
}

async function visibleCount(page, selector) {
  return page.locator(selector).evaluateAll(elements => elements.filter(element => element.getClientRects().length).length);
}

for (const viewport of viewports) {
  test(`navigation completion owns all three destinations at ${viewport.width}px`, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize(viewport);

    for (const destination of destinations) {
      await page.goto(destination.route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(destination.ready).first()).toBeVisible();

      const header = page.locator('[data-caissa-mobile2-destination-header]');
      const back = header.locator('[data-caissa-mobile2-back]');
      await expect(header).toHaveCount(1);
      await expect(header).toBeVisible();
      await expect(header.locator('[data-caissa-mobile2-destination-title]')).toHaveText(destination.title);
      await expect(back).toHaveAttribute('href', '/');
      await expect(back).toHaveAttribute('aria-label', `Back to CAISSA Mobile Home from ${destination.title}`);

      const headerBox = await header.boundingBox();
      const contentBox = await page.locator(destination.first).first().boundingBox();
      const backBox = await back.boundingBox();
      expect(backBox.height).toBeGreaterThanOrEqual(44);
      expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(contentBox.y + 1);
      expect(await visibleCount(page,
        '#mobileNavToggle, .caissa-standalone-mobile-toggle, .mobile-quick-actions [data-mobile-action="menu"]'))
        .toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => window.CaissaMobile2DestinationHeader?.isMobileNavigationIsolated?.()))
        .toBe(true);

      if (capture) {
        await page.screenshot({
          path: `docs/mobile-home-season-001/screenshots/navigation-complete-${destination.id}-${viewport.width}.png`
        });
      }

      if (destination.id === 'analyze') {
        const stable = await page.evaluate(() => {
          const root = document.querySelector('#analyzeChessboard .caissa-board');
          const squares = [...root.querySelectorAll('.caissa-board__square')];
          AnalyzeSection.loadGameFromPgn('[Result "*"]\n\n1. e4 e5 2. Nf3 *', 'navigation completion');
          AnalyzeSection.jumpToMove(-1);
          AnalyzeSection.jumpToMove(0);
          AnalyzeSection.jumpToMove(1);
          AnalyzeSection.jumpToMove(2);
          return {
            root: document.querySelector('#analyzeChessboard .caissa-board') === root,
            squares: [...document.querySelectorAll('#analyzeChessboard .caissa-board__square')]
              .every((square, index) => square === squares[index]),
            count: document.querySelectorAll('#analyzeChessboard .caissa-board').length
          };
        });
        expect(stable).toEqual({ root: true, squares: true, count: 1 });
      }

      if (destination.id === 'opening-explorer') {
        await expect(page.locator('#odbStatsBody tr')).toHaveCount(3);
        const hierarchy = await page.evaluate(() => {
          const bottom = selector => document.querySelector(selector).getBoundingClientRect().bottom;
          const top = selector => document.querySelector(selector).getBoundingClientRect().top;
          return {
            boardBeforeData: bottom('.openingdb-board-shell') <= top('#odbMobileDataRegion') + 1,
            dataBeforeContext: bottom('#odbMobileDataRegion') <= top('.openingdb-opening-context') + 1
          };
        });
        expect(hierarchy).toEqual({ boardBeforeData: true, dataBeforeContext: true });
      }

      if (destination.id === 'watch-games') {
        await expect(page.locator('[data-lichess-tv-frame]')).toHaveAttribute('src', lichessFrameUrl);
        await expect(page.locator('.lichess-tv-main a[href^="/fics"], .lichess-tv-main [data-provider="fics"]')).toHaveCount(0);
        await expect(page.locator('.lichess-tv-heading')).toContainText('Lichess');
      }

      await back.click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('[data-mobile-home]')).toBeVisible();
    }
  });
}

test('desktop Analyze, Opening Explorer and Watch Games retain their existing navigation and layout', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const destination of destinations) {
    await page.goto(destination.route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(destination.ready).first()).toBeVisible();
    await expect(page.locator('[data-caissa-mobile2-destination-header]')).toBeHidden();
    await expect(page.locator('#mainNav')).toBeVisible();
    await expect(page.locator('#mainNav')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#mainNav')).not.toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
  }
});

for (const width of [390, 430, 640, 641, 768, 769, 800, 801, 1440]) {
  test(`destination navigation and Playchess fallback at ${width}px`, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize({ width, height: width >= 640 && width <= 801 ? 450 : 900 });
    const service = 'https://play.chessbase.com/en/Play';
    await page.route(service, route => route.abort());

    for (const destination of [
      { route: '/opening-database', maxWidth: 768, back: '/' },
      { route: '/watch/lichess-tv', maxWidth: 800, back: '/' },
      { route: '/play-online/playchess', maxWidth: 800, back: '/play-hub' }
    ]) {
      await page.goto(destination.back, { waitUntil: 'domcontentloaded' });
      await page.goto(destination.route, { waitUntil: 'domcontentloaded' });
      const back = page.locator('[data-caissa-mobile2-back]');
      const nav = page.locator('#mainNav');
      const mobile = width <= destination.maxWidth;
      const isolated = () => page.evaluate(() => window.CaissaMobile2DestinationHeader.isMobileNavigationIsolated());

      await expect(back).toHaveCount(1);
      await expect.poll(isolated).toBe(mobile);
      if (destination.route === '/play-online/playchess') {
        const disclosure = page.locator('.playchess-mobile-disclosure');
        const desktopDisclosure = page.locator('.playchess-disclosure');
        if (mobile) {
          await expect(desktopDisclosure).toBeHidden();
          const summary = disclosure.locator('summary');
          await expect(summary).toHaveText('About Playchess');
          await summary.click();
          await expect(disclosure.getByText('Playchess is operated by ChessBase GmbH.')).toBeVisible();
          const fallback = disclosure.getByRole('link', { name: 'Open the official Playchess service' });
          await expect(fallback).toBeVisible();
          await expect(fallback).toHaveAttribute('href', service);
        } else {
          await expect(disclosure).toBeHidden();
          await expect(desktopDisclosure.locator('.playchess-fallback a')).toBeVisible();
        }
      }

      if (mobile) {
        await expect(back).toBeVisible();
        await expect(nav).toBeHidden();
        await expect(back).toHaveAttribute('href', destination.back);
        await back.click();
        await expect(page).toHaveURL(url => url.pathname === destination.back);
        await page.goBack({ waitUntil: 'domcontentloaded' });
        await expect(back).toBeVisible();
      } else {
        await expect(back).toBeHidden();
        await expect(nav).toBeVisible();
        await expect(nav).not.toHaveAttribute('inert', '');
      }
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(url => url.pathname === destination.back);
    }
  });
}
