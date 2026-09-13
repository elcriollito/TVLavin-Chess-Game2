import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MAINLINE = `[Event "Sandbox contract"]
[White "Alpha"]
[Black "Beta"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *`;

const PROMOTION = `[SetUp "1"]
[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]
[White "Promoter"]
[Black "King"]
[Result "*"]

*`;

async function openReader(page, pgn = MAINLINE, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem('caissa_pgn_welcome_seen', '1'));
  await page.goto('/pgn-replayer');
  await page.locator('[data-pgn-file]').setInputFiles({ name: 'sandbox.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(pgn) });
  await expect(page.locator('[data-pgn-message]')).toContainText('1 game loaded locally');
}

async function selectAnalysis(page) {
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.locator('#pgn-chessboard .caissa-board')).toHaveAttribute('aria-readonly', 'false');
}

async function squarePoint(page, square) {
  return page.locator(`.caissa-board__square[data-square="${square}"]`).evaluate(node => {
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
}

async function tapSquare(page, square) {
  const point = await squarePoint(page, square);
  await page.mouse.click(point.x, point.y);
}

async function dragSquare(page, from, to) {
  const source = await squarePoint(page, from);
  const target = await squarePoint(page, to);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
}

async function inspect(page) {
  return page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect());
}

for (const tab of ['Albums', 'Games', 'Notation']) {
  test(`${tab} keeps the canonical board read only`, async ({ page }) => {
    await openReader(page);
    await page.getByRole('tab', { name: tab }).click();
    const before = await inspect(page);
    await tapSquare(page, 'e2');
    await tapSquare(page, 'e4');
    const after = await inspect(page);
    expect(after.fen).toBe(before.fen);
    expect(after.analysis).toBeNull();
    await expect(page.locator('#pgn-chessboard .caissa-board')).toHaveAttribute('aria-readonly', 'true');
  });
}

test('Analysis copies the canonical source into an isolated chess.js session', async ({ page }) => {
  await openReader(page);
  await page.locator('[data-pgn-next]').click();
  const canonical = await inspect(page);
  await selectAnalysis(page);
  const session = await inspect(page);
  expect(session.analysis.sourceNodeId).toBe(canonical.currentNodeId);
  expect(session.analysis.sourceFen).toBe(canonical.canonicalFen);
  expect(session.analysis.fen).toBe(canonical.canonicalFen);
  expect(session.analysis.dirty).toBe(false);
});

test('tap selection selects, switches own pieces, and clears on the same piece', async ({ page }) => {
  await openReader(page);
  await selectAnalysis(page);
  await tapSquare(page, 'e2');
  expect((await inspect(page)).analysis.selectedSquare).toBe('e2');
  await expect(page.locator('.caissa-board__square[data-square="e2"]')).toHaveAttribute('aria-selected', 'true');
  await tapSquare(page, 'd2');
  expect((await inspect(page)).analysis.selectedSquare).toBe('d2');
  await tapSquare(page, 'd2');
  expect((await inspect(page)).analysis.selectedSquare).toBeNull();
});

test('a legal tap move updates only the sandbox position', async ({ page }) => {
  await openReader(page);
  await selectAnalysis(page);
  const source = await inspect(page);
  await tapSquare(page, 'e2');
  await tapSquare(page, 'e4');
  const moved = await inspect(page);
  expect(moved.analysis.history).toHaveLength(1);
  expect(moved.analysis.history[0].san).toBe('e4');
  expect(moved.analysis.dirty).toBe(true);
  expect(moved.fen).not.toBe(source.canonicalFen);
  expect(moved.canonicalFen).toBe(source.canonicalFen);
});

test('an illegal tap destination leaves the chess position unchanged', async ({ page }) => {
  await openReader(page);
  await selectAnalysis(page);
  const before = await inspect(page);
  await tapSquare(page, 'e2');
  await tapSquare(page, 'e5');
  const after = await inspect(page);
  expect(after.analysis.fen).toBe(before.analysis.fen);
  expect(after.analysis.history).toHaveLength(0);
  expect(after.analysis.dirty).toBe(false);
  expect(after.analysis.selectedSquare).toBe('e2');
});

test('drag creates one legal sandbox move without a duplicate tap move', async ({ page }) => {
  await openReader(page);
  await selectAnalysis(page);
  await dragSquare(page, 'g1', 'f3');
  const state = await inspect(page);
  expect(state.analysis.history).toHaveLength(1);
  expect(state.analysis.history[0].san).toBe('Nf3');
  expect(state.board.stats.sandboxMoves).toBe(1);
});

test('promotion requires an explicit Q/R/B/N choice and supports underpromotion', async ({ page }) => {
  await openReader(page, PROMOTION);
  await selectAnalysis(page);
  await tapSquare(page, 'a7');
  page.once('dialog', dialog => dialog.dismiss());
  await tapSquare(page, 'a8');
  expect((await inspect(page)).analysis.history).toHaveLength(0);
  page.once('dialog', dialog => dialog.accept('N'));
  await tapSquare(page, 'a8');
  const state = await inspect(page);
  expect(state.analysis.history[0].promotion).toBe('n');
  await expect(page.locator('.caissa-board__piece[data-square="a8"]')).toHaveAttribute('data-piece', 'wN');
});

test('the local engine follows the sandbox FEN', async ({ page }) => {
  await page.route('**/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `onmessage = event => { if (event.data === 'uci') postMessage('uciok'); if (event.data === 'isready') postMessage('readyok'); if (String(event.data).startsWith('go ')) postMessage('bestmove 0000'); if (event.data === 'stop') postMessage('bestmove 0000'); };`
  }));
  await openReader(page);
  await page.locator('[data-pgn-mobile-menu] > summary').click();
  await page.locator('[data-pgn-mobile-action="engine"]').click();
  await expect(page.locator('[data-pgn-engine]')).toHaveAttribute('aria-pressed', 'true');
  await tapSquare(page, 'e2');
  await tapSquare(page, 'e4');
  await expect.poll(() => inspect(page).then(state => state.engine.fen)).toBe((await inspect(page)).analysis.fen);
});

test('leaving Analysis discards exploration and restores the canonical node', async ({ page }) => {
  await openReader(page);
  await selectAnalysis(page);
  const identity = await page.evaluate(() => {
    window.__sandboxRoot = document.querySelector('.caissa-board');
    window.__sandboxSquares = [...document.querySelectorAll('.caissa-board__square')];
    return true;
  });
  expect(identity).toBe(true);
  await tapSquare(page, 'e2');
  await tapSquare(page, 'e4');
  await page.getByRole('tab', { name: 'Notation' }).click();
  const state = await inspect(page);
  expect(state.analysis).toBeNull();
  expect(state.fen).toBe(state.canonicalFen);
  await expect(page.locator('#pgn-chessboard .caissa-board')).toHaveAttribute('aria-readonly', 'true');
  expect(await page.evaluate(() => window.__sandboxRoot === document.querySelector('.caissa-board') && window.__sandboxSquares.every((node, i) => node === document.querySelectorAll('.caissa-board__square')[i]))).toBe(true);
});

test('Reset position restores the Analysis source without leaving the tab', async ({ page }) => {
  await openReader(page);
  await selectAnalysis(page);
  await tapSquare(page, 'd2');
  await tapSquare(page, 'd4');
  await page.locator('[data-pgn-analysis-reset]').click();
  const state = await inspect(page);
  expect(state.activeTab).toBe('analysis');
  expect(state.analysis.fen).toBe(state.analysis.sourceFen);
  expect(state.analysis.history).toHaveLength(0);
  expect(state.analysis.dirty).toBe(false);
});

test('canonical Next discards dirty analysis then reinitializes at the new node', async ({ page }) => {
  await openReader(page);
  await selectAnalysis(page);
  await tapSquare(page, 'c2');
  await tapSquare(page, 'c4');
  await page.locator('[data-pgn-next]').click();
  const state = await inspect(page);
  expect(state.activeTab).toBe('analysis');
  expect(state.analysis.sourceNodeId).toBe(state.currentNodeId);
  expect(state.analysis.fen).toBe(state.canonicalFen);
  expect(state.analysis.history).toHaveLength(0);
  expect(state.analysis.dirty).toBe(false);
});

test('a sandbox move preserves board, squares, and every unaffected piece identity', async ({ page }) => {
  await openReader(page);
  await selectAnalysis(page);
  await page.evaluate(() => {
    window.__root = document.querySelector('.caissa-board');
    window.__squares = [...document.querySelectorAll('.caissa-board__square')];
    window.__a8 = document.querySelector('.caissa-board__piece[data-square="a8"]');
    window.__childChanges = { added: 0, removed: 0 };
    window.__observer = new MutationObserver(records => records.forEach(record => {
      window.__childChanges.added += record.addedNodes.length;
      window.__childChanges.removed += record.removedNodes.length;
    }));
    window.__observer.observe(window.__root, { childList: true, subtree: true });
  });
  await tapSquare(page, 'e2');
  await tapSquare(page, 'e4');
  const result = await page.evaluate(() => {
    window.__observer.disconnect();
    return { root: window.__root === document.querySelector('.caissa-board'), squares: window.__squares.every((node, i) => node === document.querySelectorAll('.caissa-board__square')[i]), unaffected: window.__a8 === document.querySelector('.caissa-board__piece[data-square="a8"]'), changes: window.__childChanges };
  });
  expect(result).toEqual({ root: true, squares: true, unaffected: true, changes: { added: 0, removed: 0 } });
});

test('portrait remains board-first and Analysis stays usable', async ({ page }) => {
  await openReader(page, MAINLINE, { width: 390, height: 844 });
  await selectAnalysis(page);
  const board = await page.locator('.pgn-board-stage').boundingBox();
  const panel = await page.locator('.pgn-panel').boundingBox();
  expect(Math.abs(board.width - board.height)).toBeLessThanOrEqual(1);
  expect(panel.y).toBeGreaterThanOrEqual(board.y + board.height);
  await tapSquare(page, 'e2');
  await tapSquare(page, 'e4');
  expect((await inspect(page)).analysis.history).toHaveLength(1);
});

test('required landscape viewports maximize a square board beside a contained panel', async ({ page }) => {
  await openReader(page, MAINLINE, { width: 844, height: 390 });
  for (const viewport of [{ width: 844, height: 390, minimum: 320 }, { width: 852, height: 393, minimum: 323 }, { width: 932, height: 430, minimum: 360 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const board = rect('.pgn-board-stage'); const panel = rect('.pgn-panel');
      return { board: { width: board.width, height: board.height, left: board.left, right: board.right }, panel: { left: panel.left, right: panel.right, height: panel.height, scrollHeight: document.querySelector('.pgn-panel-body').scrollHeight }, doc: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } };
    });
    expect(geometry.board.width).toBeGreaterThanOrEqual(viewport.minimum);
    expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThanOrEqual(1);
    expect(geometry.panel.left).toBeGreaterThan(geometry.board.right);
    expect(geometry.panel.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.doc).toEqual({ width: viewport.width, height: viewport.height });
  }
});

test('portrait-landscape rotation preserves a dirty sandbox and renderer identity', async ({ page }) => {
  await openReader(page);
  await selectAnalysis(page);
  await tapSquare(page, 'e2');
  await tapSquare(page, 'e4');
  await page.evaluate(() => { window.__rotationRoot = document.querySelector('.caissa-board'); window.__rotationSquares = [...document.querySelectorAll('.caissa-board__square')]; });
  const before = await inspect(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  const after = await inspect(page);
  expect(after.analysis.fen).toBe(before.analysis.fen);
  expect(after.analysis.dirty).toBe(true);
  expect(await page.evaluate(() => window.__rotationRoot === document.querySelector('.caissa-board') && window.__rotationSquares.every((node, i) => node === document.querySelectorAll('.caissa-board__square')[i]))).toBe(true);
});

test('keyboard interaction, reduced motion, and Analysis accessibility remain truthful', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openReader(page);
  await selectAnalysis(page);
  const board = page.locator('.caissa-board');
  await expect(board).toHaveAttribute('aria-description', /Use arrow keys to navigate/);
  await expect(board).toHaveAttribute('data-reduced-motion', 'true');
  await board.focus();
  await page.keyboard.press('Enter');
  expect((await inspect(page)).analysis.selectedSquare).toBe('a1');
  await page.keyboard.press('Escape');
  expect((await inspect(page)).analysis.selectedSquare).toBeNull();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  expect((await inspect(page)).analysis.history[0].san).toBe('a3');
  const results = await new AxeBuilder({ page }).include('[data-pgn-app]').analyze();
  expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
