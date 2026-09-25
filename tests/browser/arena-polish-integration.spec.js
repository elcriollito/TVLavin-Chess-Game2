import { test, expect } from '@playwright/test';
import { authorizeVercelPreview } from './helpers/vercel-preview.js';

const SF18 = 'stockfish-18-lite';
const SF19 = 'stockfish-19-lite';
const CUSTOM_FEN = 'r1bq1rk1/ppp2ppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 4 8';
const MANUAL_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';

function placementObject(fen) {
  const result = {};
  const names = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
  fen.split(' ')[0].split('/').forEach((rank, rankIndex) => {
    let file = 0;
    for (const token of rank) {
      if (/\d/.test(token)) file += Number(token);
      else {
        result[`${String.fromCharCode(97 + file)}${8 - rankIndex}`] =
          `${token === token.toUpperCase() ? 'w' : 'b'}${names[token.toLowerCase()]}`;
        file += 1;
      }
    }
  });
  return result;
}

async function openArena(page) {
  await authorizeVercelPreview(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    const NativeWorker = window.Worker;
    const audit = { created: [], posted: [], terminated: [] };
    window.Worker = class PolishAuditWorker extends NativeWorker {
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
    window.__arenaPolishAudit = audit;
  });
  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect.poll(() => page.evaluate(() => Boolean(window.CaissaArena?.board))).toBe(true);
  await page.getByRole('tab', { name: 'Match' }).click();
}

async function applyFen(page, fen) {
  if (await page.locator('#arenaPositionPanel').isHidden()) await page.locator('#arenaSetPositionBtn').click();
  await page.locator('#arenaFenInput').fill(fen);
  await page.locator('#arenaApplyFen').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.customStartFen)).toBe(fen);
}

async function selectPair(page, white, black) {
  await page.locator('#arenaWhiteEngine').selectOption(white);
  await page.locator('#arenaBlackEngine').selectOption(black);
  await expect.poll(() => page.evaluate(() => {
    const arena = window.CaissaArena;
    return arena.enginesReady && arena.playerInstancesMatchSelections()
      ? [arena.whiteEngineInstance.id, arena.blackEngineInstance.id]
      : [];
  }), { timeout: 20_000 }).toEqual([white, black]);
  if (!await page.locator('#arenaAdvancedMatchOptions').evaluate(details => details.open)) {
    await page.locator('#arenaAdvancedMatchOptions > summary').click();
  }
  await page.locator('#arenaMoveDelay').fill('100');
  await page.locator('#arenaMoveDelay').dispatchEvent('change');
}

async function geometry(page) {
  return page.locator('#arenaBoardMount').evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

function expectStable(before, after, label) {
  for (const key of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(after[key] - before[key]), `${label}: ${key}`).toBeLessThanOrEqual(0.5);
  }
}

test('custom FEN remains exact through Infinite Analysis, Match, and History First', async ({ page }) => {
  test.setTimeout(90_000);
  await openArena(page);
  await applyFen(page, CUSTOM_FEN);

  await page.locator('#arenaInfiniteAnalysis').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.analysisFen), {
    timeout: 20_000
  }).toBe(CUSTOM_FEN);
  expect(await page.evaluate(fen => window.__arenaPolishAudit.posted
    .some(entry => entry.message === `position fen ${fen}`), CUSTOM_FEN)).toBe(true);
  await page.locator('#arenaInfiniteAnalysis').click();

  await selectPair(page, SF18, SF19);
  await page.locator('#arenaTimeControlMode').selectOption('fixed-depth', { force: true });
  await page.locator('#arenaTimeControlPreset').selectOption('8', { force: true });
  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 30_000
  }).toBeGreaterThanOrEqual(3);
  const before = await geometry(page);
  await page.getByRole('tab', { name: 'Game' }).click();
  await page.getByRole('button', { name: 'First position' }).click();
  const review = await page.evaluate(() => ({
    state: window.CaissaArena.inspectReviewState(),
    board: window.CaissaArena.board.position(),
    startFen: window.CaissaArena.state.currentGame.startFen,
    identities: window.CaissaArena.state.currentGame.runtimeIdentities
  }));
  expect(review.state).toMatchObject({ mode: 'review', cursor: 0, displayFen: CUSTOM_FEN, startFen: CUSTOM_FEN });
  expect(review.startFen).toBe(CUSTOM_FEN);
  expect(review.board).toEqual(placementObject(CUSTOM_FEN));
  expect(review.identities.white).toMatchObject({ providerId: SF18, requestedEngineId: SF18, identityValidated: true });
  expect(review.identities.black).toMatchObject({ providerId: SF19, requestedEngineId: SF19, identityValidated: true });
  expectStable(before, await geometry(page), 'custom FEN history');
  await page.evaluate(() => window.CaissaArena.stopMatch());
});

test('manual setup is the review origin while live engines continue and review emits no UCI', async ({ page }) => {
  test.setTimeout(90_000);
  await openArena(page);
  await page.locator('#arenaManualSetupBtn').click();
  await page.locator('#arenaSetupBoard .square-e2').click();
  await page.locator('#arenaSetupBoard .square-e4').click();
  await page.locator('#arenaSetupBoard .square-e7').click();
  await page.locator('#arenaSetupBoard .square-e5').click();
  await page.locator('#arenaSetupApply').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.customStartFen)).toBe(MANUAL_FEN);

  await selectPair(page, SF19, SF18);
  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 30_000
  }).toBeGreaterThanOrEqual(2);
  await page.getByRole('tab', { name: 'Game' }).click();
  const before = await geometry(page);
  await page.getByRole('button', { name: 'First position' }).click();
  const selected = await page.evaluate(() => ({
    review: window.CaissaArena.inspectReviewState(),
    board: window.CaissaArena.board.position(),
    runtimes: window.CaissaArena.inspectEngineDiagnostics().resources.liveRuntimeIds,
    workers: window.__arenaPolishAudit.created.length
  }));
  expect(selected.review).toMatchObject({ mode: 'review', cursor: 0, displayFen: MANUAL_FEN, startFen: MANUAL_FEN });
  expect(selected.board).toEqual(placementObject(MANUAL_FEN));

  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 30_000
  }).toBeGreaterThan(selected.review.moveCount);
  const advanced = await page.evaluate(() => ({
    review: window.CaissaArena.inspectReviewState(),
    runtimes: window.CaissaArena.inspectEngineDiagnostics().resources.liveRuntimeIds,
    workers: window.__arenaPolishAudit.created.length
  }));
  expect(advanced.review.cursor).toBe(0);
  expect(advanced.review.displayFen).toBe(MANUAL_FEN);
  expect(advanced.review.newerMoves).toBeGreaterThan(0);
  expect(advanced.runtimes).toEqual(selected.runtimes);
  expect(advanced.workers).toBe(selected.workers);

  await page.evaluate(() => window.CaissaArena.togglePause());
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('paused');
  await page.waitForTimeout(300);
  const invariant = await page.evaluate(() => ({
    posts: window.__arenaPolishAudit.posted.length,
    workers: window.__arenaPolishAudit.created.length,
    runtimes: window.CaissaArena.inspectEngineDiagnostics().resources.liveRuntimeIds
  }));
  await page.getByRole('button', { name: 'Next move' }).click();
  await page.getByRole('button', { name: 'Previous move' }).click();
  await page.getByRole('button', { name: 'Latest position' }).click();
  await page.getByRole('button', { name: 'Return to live position' }).click();
  expect(await page.evaluate(() => ({
    posts: window.__arenaPolishAudit.posted.length,
    workers: window.__arenaPolishAudit.created.length,
    runtimes: window.CaissaArena.inspectEngineDiagnostics().resources.liveRuntimeIds
  }))).toEqual(invariant);
  expectStable(before, await geometry(page), 'manual setup history');
  await page.evaluate(() => window.CaissaArena.stopMatch());
});
