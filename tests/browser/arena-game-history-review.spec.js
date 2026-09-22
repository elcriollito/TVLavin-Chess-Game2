import { test, expect } from '@playwright/test';
import { authorizeVercelPreview } from './helpers/vercel-preview.js';

const START_FEN_BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 7';
const REVIEW_MOVES = ['e7e5', 'g1f3', 'b8c6', 'd2d4'];

async function openArena(page, viewport = { width: 1440, height: 900 }, { trackWorkers = false } = {}) {
  await authorizeVercelPreview(page);
  await page.setViewportSize(viewport);
  await page.addInitScript(({ trackWorkers }) => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    if (!trackWorkers) return;
    const NativeWorker = window.Worker;
    const arenaAssets = /(?:stockfish-working|stockfish-18-lite-single|stockfish-19-lite-single)\.js/;
    const audit = { created: [], posted: [], terminated: [] };
    window.Worker = class ReviewAuditWorker extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.__reviewAuditUrl = String(url);
        if (arenaAssets.test(this.__reviewAuditUrl)) audit.created.push(this.__reviewAuditUrl);
      }
      postMessage(message, transfer) {
        if (arenaAssets.test(this.__reviewAuditUrl)) {
          audit.posted.push({ url: this.__reviewAuditUrl, message: String(message) });
        }
        return transfer === undefined ? super.postMessage(message) : super.postMessage(message, transfer);
      }
      terminate() {
        if (arenaAssets.test(this.__reviewAuditUrl)) audit.terminated.push(this.__reviewAuditUrl);
        return super.terminate();
      }
    };
    window.__arenaReviewWorkerAudit = audit;
  }, { trackWorkers });
  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect.poll(() => page.evaluate(() => Boolean(window.CaissaArena?.board))).toBe(true);
  await expect(page.locator('#arenaReviewControls')).toBeVisible();
}

async function seedGame(page, {
  fen = START_FEN_BLACK_TO_MOVE,
  moves = REVIEW_MOVES,
  matchState = 'finished',
  mode = 'match'
} = {}) {
  return page.evaluate(({ fen, moves, matchState, mode }) => {
    const arena = window.CaissaArena;
    arena.stopReviewPlayback({ render: false });
    const game = new Chess();
    if (game.load(fen) === false) throw new Error('Test FEN failed to load');
    const startFen = game.fen();
    const records = [];
    for (const uci of moves) {
      const result = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!result) throw new Error(`Illegal test move: ${uci}`);
      records.push({ move: result.san, uci, fen: game.fen(), source: 'fixture' });
    }
    arena.game = game;
    arena.state.mode = mode;
    arena.state.matchState = matchState;
    arena.state.currentGame = {
      white: { id: 'fixture-white', name: 'Fixture White' },
      black: { id: 'fixture-black', name: 'Fixture Black' },
      startFen,
      moves: records,
      runtimeIdentities: Object.freeze({
        white: Object.freeze({ runtimeInstanceId: 'fixture-white-runtime' }),
        black: Object.freeze({ runtimeInstanceId: 'fixture-black-runtime' })
      })
    };
    arena.resetReviewState({ render: false });
    arena.board.position(game.fen(), false);
    arena.renderMoveHistory();
    return { startFen, liveFen: game.fen(), san: game.history() };
  }, { fen, moves, matchState, mode });
}

async function geometry(page) {
  return page.locator('#arenaBoardMount').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
  });
}

function expectGeometryStable(before, after, label) {
  for (const field of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(after[field] - before[field]), `${label} ${field} drift`).toBeLessThanOrEqual(0.5);
  }
}

test('finished custom-FEN game supports complete visual review, move clicks, keyboard, playback, and Live', async ({ page }) => {
  await openArena(page);
  const seeded = await seedGame(page);
  const before = await geometry(page);
  const pageScrollBefore = await page.evaluate(() => scrollY);

  await expect(page.getByRole('button', { name: 'First position' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Previous move' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Play game review' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Next move' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Latest position' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Return to live position' })).toBeDisabled();

  await page.getByRole('button', { name: 'Previous move' }).click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState().cursor)).toBe(3);
  await page.getByRole('button', { name: 'First position' }).click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState())).toMatchObject({
    mode: 'review', cursor: 0, startFen: seeded.startFen, displayFen: seeded.startFen, liveFen: seeded.liveFen
  });

  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.locator('[data-review-ply="1"]')).toHaveAttribute('aria-current', 'step');
  await page.locator('[data-review-ply="2"]').click();
  await expect(page.locator('[data-review-ply="2"]')).toHaveClass(/is-current/);
  await page.locator('[data-review-ply="3"]').click();
  await expect(page.locator('[data-review-ply="3"]')).toHaveAttribute('aria-current', 'step');

  await page.getByRole('button', { name: 'Latest position' }).click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState().cursor)).toBe(4);
  await expect(page.getByRole('button', { name: 'Return to live position' })).toBeEnabled();

  const play = page.locator('#arenaReviewPlay');
  await play.focus();
  await play.press('Home');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState().cursor)).toBe(0);
  await play.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState().cursor)).toBe(1);
  await play.press('End');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState().cursor)).toBe(4);
  await play.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState().cursor)).toBe(3);

  await page.getByRole('button', { name: 'First position' }).click();
  await page.getByRole('button', { name: 'Play game review' }).click();
  await expect(page.getByRole('button', { name: 'Pause game review' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState().cursor), {
    timeout: 2500
  }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause game review' }).click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState().playing)).toBe(false);

  await page.getByRole('button', { name: 'Return to live position' }).click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.inspectReviewState())).toMatchObject({
    mode: 'live', cursor: null, displayFen: seeded.liveFen, liveFen: seeded.liveFen
  });
  expect(await page.evaluate(() => window.CaissaArena.state.matchState)).toBe('finished');
  expect(await page.evaluate(() => scrollY)).toBe(pageScrollBefore);
  expectGeometryStable(before, await geometry(page), 'desktop review');
});

test('live engines continue while review cursor, display FEN, workers, and runtimes stay isolated', async ({ page }) => {
  test.setTimeout(60_000);
  await openArena(page, { width: 1440, height: 900 }, { trackWorkers: true });
  await expect.poll(() => page.evaluate(() => window.CaissaArena.enginesReady), { timeout: 15_000 }).toBe(true);
  await page.getByRole('tab', { name: 'Match' }).click();
  await page.locator('#arenaMoveDelay').fill('100');
  await page.locator('#arenaMoveDelay').dispatchEvent('change');
  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThanOrEqual(2);
  await page.getByRole('tab', { name: 'Game' }).click();

  const matchPause = page.locator('#arenaPauseMatch');
  await matchPause.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('paused');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('running');

  await page.getByRole('button', { name: 'Previous move' }).click();
  const reviewing = await page.evaluate(() => ({
    review: window.CaissaArena.inspectReviewState(),
    runtimes: window.CaissaArena.inspectEngineDiagnostics().resources.liveRuntimeIds,
    created: window.__arenaReviewWorkerAudit.created.length
  }));
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThan(reviewing.review.moveCount);

  const advanced = await page.evaluate(() => ({
    review: window.CaissaArena.inspectReviewState(),
    runtimes: window.CaissaArena.inspectEngineDiagnostics().resources.liveRuntimeIds,
    created: window.__arenaReviewWorkerAudit.created.length,
    state: window.CaissaArena.state.matchState
  }));
  expect(advanced.review.cursor).toBe(reviewing.review.cursor);
  expect(advanced.review.displayFen).toBe(reviewing.review.displayFen);
  expect(advanced.review.liveFen).not.toBe(reviewing.review.liveFen);
  expect(advanced.review.newerMoves).toBeGreaterThan(0);
  expect(advanced.runtimes).toEqual(reviewing.runtimes);
  expect(advanced.created).toBe(reviewing.created);
  expect(advanced.state).toBe('running');

  await page.locator('#arenaPauseMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('paused');
  await page.waitForTimeout(300);
  const invariantBefore = await page.evaluate(() => ({
    posts: window.__arenaReviewWorkerAudit.posted.length,
    created: window.__arenaReviewWorkerAudit.created.length,
    runtimes: window.CaissaArena.inspectEngineDiagnostics().resources.liveRuntimeIds
  }));
  await page.getByRole('button', { name: 'First position' }).click();
  await page.getByRole('button', { name: 'Next move' }).click();
  await page.getByRole('button', { name: 'Latest position' }).click();
  await page.getByRole('button', { name: 'Return to live position' }).click();
  const invariantAfter = await page.evaluate(() => ({
    posts: window.__arenaReviewWorkerAudit.posted.length,
    created: window.__arenaReviewWorkerAudit.created.length,
    runtimes: window.CaissaArena.inspectEngineDiagnostics().resources.liveRuntimeIds
  }));
  expect(invariantAfter).toEqual(invariantBefore);
  await page.locator('#arenaStopMatch').click();
});

test('Tournament review leaves lifecycle, standings, result, and progression state untouched and next game returns Live', async ({ page }) => {
  await openArena(page);
  await seedGame(page, { matchState: 'running', mode: 'tournament' });
  const before = await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.state.tournament = {
      engines: [{ id: 'fixture-white' }, { id: 'fixture-black' }],
      format: 'round-robin', rounds: 1, openingMode: 'free', currentRound: 0,
      standings: [{ engine: { id: 'fixture-white' }, score: 1, played: 1 }],
      games: [{ white: { id: 'fixture-white' }, black: { id: 'fixture-black' }, result: null }]
    };
    arena.state.currentGame.result = null;
    return JSON.stringify({ tournament: arena.state.tournament, result: arena.state.currentGame.result });
  });

  await page.getByRole('button', { name: 'Previous move' }).click();
  await page.getByRole('button', { name: 'First position' }).click();
  const during = await page.evaluate(() => ({
    snapshot: JSON.stringify({
      tournament: window.CaissaArena.state.tournament,
      result: window.CaissaArena.state.currentGame.result
    }),
    matchState: window.CaissaArena.state.matchState,
    review: window.CaissaArena.inspectReviewState()
  }));
  expect(during.snapshot).toBe(before);
  expect(during.matchState).toBe('running');
  expect(during.review).toMatchObject({ mode: 'review', cursor: 0 });

  const nextGame = await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.resetBoard();
    arena.state.currentGame = { startFen: arena.game.fen(), moves: [], result: null };
    arena.renderMoveHistory();
    return arena.inspectReviewState();
  });
  expect(nextGame).toMatchObject({ mode: 'live', cursor: null, moveCount: 0 });
});

for (const viewport of [
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'mobile landscape', width: 844, height: 390 }
]) {
  test(`${viewport.name} review controls remain contained and board geometry does not jitter`, async ({ page }) => {
    await openArena(page, viewport);
    await seedGame(page);
    await page.locator('#arenaReviewControls').evaluate(element => element.scrollIntoView({ block: 'center' }));
    const pageScrollBefore = await page.evaluate(() => scrollY);
    const before = await geometry(page);
    await page.getByRole('button', { name: 'Previous move' }).click();
    await page.getByRole('button', { name: 'First position' }).click();
    await page.getByRole('button', { name: 'Next move' }).click();
    await page.locator('[data-review-ply="3"]').click();
    const after = await geometry(page);
    const layout = await page.evaluate(() => {
      const controls = document.getElementById('arenaReviewControls').getBoundingClientRect();
      return {
        viewportWidth: innerWidth,
        controlsLeft: controls.left,
        controlsRight: controls.right,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    expect(layout.controlsLeft).toBeGreaterThanOrEqual(0);
    expect(layout.controlsRight).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.horizontalOverflow).toBe(false);
    expect(await page.evaluate(() => scrollY)).toBe(pageScrollBefore);
    expectGeometryStable(before, after, viewport.name);
    await expect(page.locator('#arenaReviewStatus')).toContainText('Reviewing move 3');
  });
}
