import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const openingDbFixture = {
  '66be37feb35e7d6a': {
    moves: [
      { uci: 'e2e4', san: 'e4', games: 1000, w: 410, d: 320, l: 270 },
      { uci: 'd2d4', san: 'd4', games: 800, w: 330, d: 300, l: 170 }
    ]
  },
  'fa6f7503caab4032': {
    moves: [{ uci: 'c7c5', san: 'c5', games: 700, w: 280, d: 230, l: 190 }]
  }
};

const copy = {
  en: {
    title: 'Opening Explorer', games: 'Games', turn: 'Black to move',
    summary: 'Indexed matches: 25', found: 'Found 25 indexed games', metadata: 'Metadata only', idle: 'Idle',
    metaTitle: 'Chess Opening Explorer & Database | CAISSA Chess'
  },
  es: {
    title: 'Explorador de aperturas', games: 'Partidas', turn: 'Negras juegan',
    summary: 'Partidas indexadas: 25', found: 'Se encontraron 25 partidas indexadas', metadata: 'Solo metadatos', idle: 'Inactivo',
    metaTitle: 'Explorador y base de datos de aperturas | CAISSA Chess'
  },
  pt: {
    title: 'Explorador de aberturas', games: 'Partidas', turn: 'Pretas jogam',
    summary: 'Partidas indexadas: 25', found: 'Foram encontradas 25 partidas indexadas', metadata: 'Somente metadados', idle: 'Ocioso',
    metaTitle: 'Explorador e banco de dados de aberturas | CAISSA Chess'
  }
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    if (!localStorage.getItem('caissa.locale')) localStorage.setItem('caissa.locale', 'en');
  });
  await page.route('**/api/public-auth-config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/manifest.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 'v2_test',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/v2_test',
      generatedAt: '2026-11-07T12:00:00.000Z',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/v2_test/*.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(openingDbFixture)
  }));
  await page.route('**/gamesearch/manifest.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ version: 'v1', maxPlies: 10, topK: 100 })
  }));
  await page.route('**/gamesearch/line?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      games: 25,
      top: [{ gameId: 'g1', white: 'Alice', black: 'Bob', result: '1-0', event: 'HQA', year: 2026, whiteElo: 2500, blackElo: 2450, eco: 'C20' }]
    })
  }));
});

async function expectStatePreserved(page, expectedFen) {
  await expect(page.locator('#odbCurrentLine')).toContainText('1.e4');
  await expect(page.locator('#odbGamesYearMin')).toHaveValue('2000');
  await expect(page.locator('#odbGamesYearMax')).toHaveValue('2026');
  await expect(page.locator('#odbGamesEloMin')).toHaveValue('2400');
  await expect(page.locator('#odbGamesResult')).toHaveValue('1-0');
  await expect(page.locator('#odbEngineDepth')).toHaveValue('22');
  await expect(page.locator('#odbEngineMultiPV')).toHaveValue('3');
  await expect(page.locator('#odbTabGames')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#openingDbBoard [data-square="e4"] .piece-417db')).toHaveAttribute('data-piece', 'wP');
  const currentFen = await page.evaluate(() => {
    const toggle = document.querySelector('#odbFenToggleBtn');
    toggle.click();
    const value = document.querySelector('#odbFenInput').value;
    toggle.click();
    return value;
  });
  expect(currentFen).toBe(expectedFen);
  expect(await page.evaluate(() => document.querySelector('#openingDbBoard') === window.__hqaOpeningBoard)).toBe(true);
}

test('EN ES PT switch live, localize dynamic content, and preserve board, tabs, filters, and engine controls', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/opening-database');
  await page.locator('#odbStatsBody [data-move-index="0"]').click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.locator('#odbAnalysisPanel summary').filter({ hasText: 'Analysis settings' }).click();
  await page.locator('#odbEngineDepth').selectOption('22');
  await page.locator('#odbEngineMultiPV').selectOption('3');
  await page.getByRole('tab', { name: 'Games' }).click();
  await page.locator('#odbGamesYearMin').fill('2000');
  await page.locator('#odbGamesYearMax').fill('2026');
  await page.locator('#odbGamesEloMin').fill('2400');
  await page.locator('#odbGamesResult').selectOption('1-0');
  await page.getByRole('button', { name: 'Search this line', exact: true }).click();
  await expect(page.locator('#odbGamesSummary')).toContainText(copy.en.summary);

  const expectedFen = await page.evaluate(() => {
    window.__hqaOpeningBoard = document.querySelector('#openingDbBoard');
    document.querySelector('#odbFenToggleBtn').click();
    const value = document.querySelector('#odbFenInput').value;
    document.querySelector('#odbFenToggleBtn').click();
    return value;
  });
  const localeSelect = page.locator('[data-caissa-locale-select]').first();

  for (const locale of ['en', 'es', 'pt', 'en']) {
    await localeSelect.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page).toHaveTitle(copy[locale].metaTitle);
    await expect(page.locator('h1')).toHaveText(copy[locale].title);
    await expect(page.locator('#odbTabGames')).toContainText(copy[locale].games);
    await expect(page.locator('#odbTurnPly')).toContainText(copy[locale].turn);
    await expect(page.locator('#odbGamesSummary')).toContainText(copy[locale].summary);
    await expect(page.locator('#odbGamesStatus')).toContainText(copy[locale].found);
    await expect(page.locator('#odbGamesBody')).toContainText(copy[locale].metadata);
    await expect(page.locator('#odbEngineStatusValue')).toHaveText(copy[locale].idle);
    await expectStatePreserved(page, expectedFen);
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('locale persistence survives reload and the 320px surface remains accessible without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/opening-database');
  await page.locator('[data-caissa-locale-select]').first().selectOption('pt');
  await expect(page.locator('h1')).toHaveText(copy.pt.title);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt');
  await expect(page.locator('h1')).toHaveText(copy.pt.title);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
  expect(severe).toEqual([]);
});

test('live locale changes do not restart or replace an active Stockfish client', async ({ page }) => {
  await page.route('**/js/opening-trainer/stockfish19-client.js*', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `(() => {
      window.__hqaEngineCalls = { constructed: 0, init: 0, start: 0, stop: 0, terminate: 0 };
      class StableStockfishClient {
        constructor(options = {}) {
          this.owner = options.owner || 'opening-database';
          this.stateHandler = null;
          window.__hqaEngineCalls.constructed += 1;
        }
        snapshot(state) {
          return {
            state,
            workerUrl: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js',
            wasmUrl: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm',
            handshakeState: 'readyok',
            engineId: 'Stockfish 19 Lite WASM',
            engineAuthor: 'the Stockfish developers (see AUTHORS file)',
            owner: this.owner,
            attribution: { enabled: true },
            workerLifecycle: { active: 1, peakActive: 1 },
            lastStopReason: '', lastInfoAt: 0, errors: []
          };
        }
        async init() { window.__hqaEngineCalls.init += 1; this.stateHandler?.(this.snapshot('ready')); return true; }
        getIdentity() { return { ready: true, uciName: 'Stockfish 19 Lite WASM', author: 'the Stockfish developers (see AUTHORS file)', wasmPath: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm' }; }
        onInfo() {}
        onState(handler) { this.stateHandler = handler; }
        onError() {}
        onLine() {}
        setOptions() {}
        setPositionFEN() {}
        startInfiniteAnalysis() { window.__hqaEngineCalls.start += 1; this.stateHandler?.(this.snapshot('analyzing')); return 'hqa-running'; }
        stop() { window.__hqaEngineCalls.stop += 1; }
        terminate() { window.__hqaEngineCalls.terminate += 1; }
      }
      window.CaissaStockfish19LiteClient = StableStockfishClient;
      window.OpeningTrainerStockfish19Client = StableStockfishClient;
    })();`
  }));

  await page.goto('/opening-database');
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.locator('#odbStartEngineBtn').click();
  await expect(page.locator('#odbEngineStatusValue')).toHaveText('Infinite');
  const before = await page.evaluate(() => ({ ...window.__hqaEngineCalls }));
  expect(before).toEqual({ constructed: 1, init: 1, start: 1, stop: 1, terminate: 0 });

  const selector = page.locator('[data-caissa-locale-select]').first();
  for (const [locale, label] of [['es', 'Infinito'], ['pt', 'Infinito'], ['en', 'Infinite']]) {
    await selector.selectOption(locale);
    await expect(page.locator('#odbEngineStatusValue')).toHaveText(label);
    await expect.poll(() => page.evaluate(() => window.__engineDebug?.state)).toBe('Infinite');
    expect(await page.evaluate(() => ({ ...window.__hqaEngineCalls }))).toEqual(before);
  }
});
