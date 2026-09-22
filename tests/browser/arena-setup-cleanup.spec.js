import { test, expect } from '@playwright/test';
import { authorizeVercelPreview } from './helpers/vercel-preview.js';

const SF18 = 'stockfish-18-lite';
const SF19 = 'stockfish-19-lite';
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CUSTOM_FEN = 'r1bq1rk1/ppp2ppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 4 8';
const MANUAL_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b Kq - 0 1';

function placementObject(fen) {
  const board = {};
  const ranks = fen.split(' ')[0].split('/');
  const pieces = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
  ranks.forEach((rank, rankIndex) => {
    let file = 0;
    for (const token of rank) {
      if (/\d/.test(token)) {
        file += Number(token);
      } else {
        const square = `${String.fromCharCode(97 + file)}${8 - rankIndex}`;
        board[square] = `${token === token.toUpperCase() ? 'w' : 'b'}${pieces[token.toLowerCase()]}`;
        file += 1;
      }
    }
  });
  return board;
}

async function openArena(page, viewport = { width: 1440, height: 900 }) {
  await authorizeVercelPreview(page);
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    const NativeWorker = window.Worker;
    const audit = { created: [], posted: [], terminated: [] };
    window.Worker = class SetupAuditWorker extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.__auditUrl = String(url);
        audit.created.push(this.__auditUrl);
      }
      postMessage(message, transfer) {
        audit.posted.push({ url: this.__auditUrl, message: String(message) });
        return transfer === undefined ? super.postMessage(message) : super.postMessage(message, transfer);
      }
      terminate() {
        audit.terminated.push(this.__auditUrl);
        return super.terminate();
      }
    };
    window.__arenaSetupWorkerAudit = audit;
  });
  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect.poll(() => page.evaluate(() => Boolean(window.CaissaArena?.board))).toBe(true);
  await page.getByRole('tab', { name: 'Match' }).click();
}

async function openFenPanel(page) {
  if (await page.locator('#arenaPositionPanel').isHidden()) {
    await page.locator('#arenaSetPositionBtn').click();
  }
}

async function applyFen(page, fen) {
  await openFenPanel(page);
  await page.locator('#arenaFenInput').fill(fen);
  await page.locator('#arenaApplyFen').click();
}

async function selectSf18Sf19(page) {
  await page.locator('#arenaWhiteEngine').selectOption(SF18);
  await page.locator('#arenaBlackEngine').selectOption(SF19);
  await expect.poll(() => page.evaluate(() => {
    const arena = window.CaissaArena;
    return arena.enginesReady && arena.playerInstancesMatchSelections()
      ? [arena.whiteEngineInstance.id, arena.blackEngineInstance.id]
      : [];
  }), { timeout: 20_000 }).toEqual([SF18, SF19]);
}

async function boardGeometry(page) {
  return page.locator('#arenaBoardMount').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

function expectStable(before, after, label) {
  for (const key of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(after[key] - before[key]), `${label}: ${key}`).toBeLessThanOrEqual(0.5);
  }
}

test('FEN matrix updates authoritative state and visible board atomically without jitter', async ({ page }) => {
  await openArena(page);
  const beforeGeometry = await boardGeometry(page);
  const cases = [
    { name: 'initial', fen: INITIAL_FEN, turn: 'White to move' },
    { name: 'middlegame black', fen: CUSTOM_FEN, turn: 'Black to move' },
    { name: 'no castling', fen: '8/8/8/3k4/8/4K3/8/8 w - - 0 1', turn: 'White to move' },
    { name: 'partial castling', fen: 'r3k2r/8/8/8/8/8/8/R3K2R b Kq - 0 1', turn: 'Black to move' },
    { name: 'en passant', fen: 'rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', turn: 'White to move' },
    { name: 'unusual material', fen: '4k3/8/8/2Q5/8/8/4K3/7N b - - 12 37', turn: 'Black to move' }
  ];

  for (const item of cases) {
    await applyFen(page, item.fen);
    await expect(page.locator('#arenaFenMessage'), item.name).toContainText(item.turn);
    await expect(page.locator('#arenaStatusTurn'), item.name).toHaveText(item.turn);
    expect(await page.evaluate(() => ({
      fen: window.CaissaArena.game.fen(),
      startingFen: window.CaissaArena.state.customStartFen,
      board: window.CaissaArena.board.position()
    })), item.name).toEqual({ fen: item.fen, startingFen: item.fen, board: placementObject(item.fen) });
    expectStable(beforeGeometry, await boardGeometry(page), item.name);
  }

  const validSnapshot = await page.evaluate(() => ({
    fen: window.CaissaArena.game.fen(),
    startingFen: window.CaissaArena.state.customStartFen,
    board: window.CaissaArena.board.position()
  }));
  await applyFen(page, 'this is not a FEN');
  await expect(page.locator('#arenaFenMessage')).toHaveClass(/error/);
  expect(await page.evaluate(() => ({
    fen: window.CaissaArena.game.fen(),
    startingFen: window.CaissaArena.state.customStartFen,
    board: window.CaissaArena.board.position()
  }))).toEqual(validSnapshot);
});

test('custom FEN is the exact Match and Infinite Analysis engine position', async ({ page }) => {
  test.setTimeout(75_000);
  await openArena(page);
  await applyFen(page, CUSTOM_FEN);
  await selectSf18Sf19(page);
  await page.locator('#arenaMoveDelay').fill('100');
  await page.locator('#arenaMoveDelay').dispatchEvent('change');
  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.currentGame?.startFen), {
    timeout: 20_000
  }).toBe(CUSTOM_FEN);
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 25_000
  }).toBeGreaterThan(0);
  const match = await page.evaluate((fen) => {
    const arena = window.CaissaArena;
    const identities = arena.state.currentGame.runtimeIdentities;
    return {
      startFen: arena.state.currentGame.startFen,
      identities,
      sentFen: window.__arenaSetupWorkerAudit.posted.some(entry => entry.message === `position fen ${fen}`)
    };
  }, CUSTOM_FEN);
  expect(match.startFen).toBe(CUSTOM_FEN);
  expect(match.sentFen).toBe(true);
  expect(match.identities.white).toMatchObject({ providerId: SF18, requestedEngineId: SF18, identityValidated: true });
  expect(match.identities.black).toMatchObject({ providerId: SF19, requestedEngineId: SF19, identityValidated: true });
  await page.evaluate(() => window.CaissaArena.stopMatch());

  await applyFen(page, CUSTOM_FEN);
  await page.locator('#arenaInfiniteAnalysis').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.analysisFen), {
    timeout: 20_000
  }).toBe(CUSTOM_FEN);
  expect(await page.evaluate((fen) => window.__arenaSetupWorkerAudit.posted
    .some(entry => entry.message === `position fen ${fen}`), CUSTOM_FEN)).toBe(true);
  await page.locator('#arenaInfiniteAnalysis').click();
});

async function openManualSetup(page) {
  await page.locator('#arenaManualSetupBtn').click();
  await expect(page.locator('#arenaSetupModal')).toHaveClass(/show/);
  await expect(page.locator('#arenaSetupModal')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByRole('button', { name: 'Move existing piece' })).toHaveAttribute('aria-pressed', 'true');
}

async function clickSquare(page, square) {
  await page.locator(`#arenaSetupBoard .square-${square}`).click();
}

test('manual setup supports click, keyboard, drag, palette, erase, clear, initial, turn and castling', async ({ page }) => {
  await openArena(page);
  await openManualSetup(page);

  await clickSquare(page, 'e2');
  await expect(page.locator('#arenaSetupBoard .square-e2')).toHaveAttribute('aria-pressed', 'true');
  await clickSquare(page, 'e4');
  let position = await page.evaluate(() => window.CaissaArena.setupBoardInstance.position());
  expect(position.e2).toBeUndefined();
  expect(position.e4).toBe('wP');

  await page.locator('#arenaSetupBoard .square-e7').focus();
  await page.keyboard.press('Enter');
  await page.locator('#arenaSetupBoard .square-e5').focus();
  await page.keyboard.press('Space');
  position = await page.evaluate(() => window.CaissaArena.setupBoardInstance.position());
  expect(position.e7).toBeUndefined();
  expect(position.e5).toBe('bP');

  await page.locator('#arenaSetupBoard .square-g1 .piece-417db')
    .dragTo(page.locator('#arenaSetupBoard .square-f3'));
  await expect.poll(() => page.evaluate(() => window.CaissaArena.setupBoardInstance.position().f3)).toBe('wN');
  expect(await page.evaluate(() => window.CaissaArena.setupBoardInstance.position().g1)).toBeUndefined();

  await page.getByRole('button', { name: 'Select eraser for manual setup' }).click();
  await clickSquare(page, 'a2');
  expect(await page.evaluate(() => window.CaissaArena.setupBoardInstance.position().a2)).toBeUndefined();
  await page.getByRole('button', { name: 'Add White queen' }).click();
  await clickSquare(page, 'a3');
  expect(await page.evaluate(() => window.CaissaArena.setupBoardInstance.position().a3)).toBe('wQ');

  await page.locator('#arenaSetupClear').click();
  await expect.poll(() => page.evaluate(() => Object.keys(window.CaissaArena.setupBoardInstance.position()).length)).toBe(0);
  await page.locator('#arenaSetupReset').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.setupBoardInstance.position()))
    .toEqual(placementObject(INITIAL_FEN));
  await expect(page.getByRole('button', { name: 'Move existing piece' })).toHaveAttribute('aria-pressed', 'true');

  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await page.locator('#arenaSetupTurn').selectOption('b');
  await page.locator('#arenaSetupCastleWK').check();
  await page.locator('#arenaSetupCastleWQ').uncheck();
  await page.locator('#arenaSetupCastleBK').uncheck();
  await page.locator('#arenaSetupCastleBQ').check();
  await page.locator('#arenaSetupApply').click();

  await expect(page.locator('#arenaSetupModal')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => ({
    game: window.CaissaArena.game.fen(),
    startingFen: window.CaissaArena.state.customStartFen,
    board: window.CaissaArena.board.position()
  }))).toEqual({ game: MANUAL_FEN, startingFen: MANUAL_FEN, board: placementObject(MANUAL_FEN) });
  await expect(page.locator('#arenaStatusTurn')).toHaveText('Black to move');
});

test('manual setup position starts real Match and Infinite Analysis unchanged', async ({ page }) => {
  test.setTimeout(90_000);
  await openArena(page);
  await openManualSetup(page);
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await page.locator('#arenaSetupTurn').selectOption('b');
  await page.locator('#arenaSetupCastleWQ').uncheck();
  await page.locator('#arenaSetupCastleBK').uncheck();
  await page.locator('#arenaSetupApply').click();
  await selectSf18Sf19(page);

  await page.locator('#arenaInfiniteAnalysis').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.analysisFen), {
    timeout: 20_000
  }).toBe(MANUAL_FEN);
  await page.locator('#arenaInfiniteAnalysis').click();

  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.currentGame?.startFen), {
    timeout: 20_000
  }).toBe(MANUAL_FEN);
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 25_000
  }).toBeGreaterThan(0);
  await page.evaluate(() => window.CaissaArena.stopMatch());
});

test('standard Arena catalogs expose only four certified Stockfish providers', async ({ page }) => {
  await openArena(page);
  const expected = ['stockfish', 'stockfish-lite', SF18, SF19];
  const result = await page.evaluate(() => ({
    registry: window.EngineRegistry.listArenaProviders().map(provider => provider.id),
    fairy: window.EngineRegistry.get('fairy-stockfish'),
    match: Array.from(document.querySelectorAll('#arenaWhiteEngine option'), option => option.value),
    tournament: Array.from(document.querySelectorAll('#arenaTournamentEngines input'), input => input.value)
  }));
  expect(result.registry).toEqual(expected);
  expect(result.match).toEqual(expected);
  expect(result.tournament).toEqual(expected);
  expect(result.fairy).toMatchObject({
    supportsStandardArena: false,
    productOwner: 'caissa-variants',
    chessFamilies: 'non-standard'
  });
});

for (const viewport of [
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'mobile landscape', width: 844, height: 390 }
]) {
  test(`${viewport.name} supports touch-style click relocation without overflow or board jitter`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true
    });
    const page = await context.newPage();
    await openArena(page, viewport);
    await openManualSetup(page);
    const before = await boardGeometry(page);
    for (const square of ['e2', 'e4']) {
      await page.locator(`#arenaSetupBoard .square-${square}`).tap();
    }
    await expect.poll(() => page.evaluate(() => window.CaissaArena.setupBoardInstance.position().e4)).toBe('wP');
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      selected: window.CaissaArena.state.setupSelectedSquare
    }));
    expect(layout).toEqual({ overflow: false, selected: null });
    await page.locator('#arenaSetupApply').click();
    await page.waitForTimeout(50);
    const after = await boardGeometry(page);
    expectStable(before, after, viewport.name);
    await context.close();
  });
}
