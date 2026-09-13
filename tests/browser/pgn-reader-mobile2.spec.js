import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SPECIAL_MOVES = `[Event "Persistent identity"]
[White "Alpha"]
[Black "Beta"]
[Result "*"]

1. e4 a6 2. e5 d5 3. exd6 exd6 4. Nf3 Nf6 5. Be2 Be7 6. O-O O-O *`;

const TWO_GAMES = `${SPECIAL_MOVES}

[Event "Second game"]
[White "Gamma"]
[Black "Delta"]
[Result "*"]

1. d4 d5 2. c4 *`;

function soakPgn() {
  const rounds = [];
  for (let cycle = 0; cycle < 25; cycle += 1) rounds.push(`${cycle * 2 + 1}. Nf3 Nf6 ${cycle * 2 + 2}. Ng1 Ng8`);
  return `[Event "100 position soak"]\n[White "Loop"]\n[Black "Loop"]\n[Result "*"]\n\n${rounds.join(' ')} *`;
}

async function openReader(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem('caissa_pgn_welcome_seen', '1'));
  await page.goto('/pgn-replayer');
  await expect(page.locator('#pgn-chessboard .caissa-board')).toHaveCount(1);
}

async function loadPgn(page, pgn, games = 1) {
  await page.locator('[data-pgn-file]').setInputFiles({
    name: 'mobile2.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(pgn)
  });
  await expect(page.locator('[data-pgn-message]')).toContainText(`${games} game${games === 1 ? '' : 's'} loaded locally`);
}

async function pieceAt(page, square) {
  return page.locator(`.caissa-board__piece[data-square="${square}"]`).evaluate(node => ({
    id: node.dataset.pieceId, piece: node.dataset.piece
  }));
}

async function next(page, count = 1) {
  for (let index = 0; index < count; index += 1) await page.locator('[data-pgn-next]').click();
}

test('keeps quiet, capture, en-passant and castling identities on semantic forward replay', async ({ page }) => {
  await openReader(page);
  await loadPgn(page, SPECIAL_MOVES);
  await page.evaluate(() => {
    window.__readerBoardRoot = document.querySelector('#pgn-chessboard .caissa-board');
    window.__readerSquares = [...document.querySelectorAll('.caissa-board__square')];
  });

  const whitePawn = await pieceAt(page, 'e2');
  await next(page);
  expect(await pieceAt(page, 'e4')).toEqual(whitePawn);
  await next(page, 2);
  expect(await pieceAt(page, 'e5')).toEqual(whitePawn);

  await next(page);
  const enPassantVictim = await pieceAt(page, 'd5');
  await next(page);
  expect(await pieceAt(page, 'd6')).toEqual(whitePawn);
  await expect(page.locator(`[data-piece-id="${enPassantVictim.id}"]`)).toHaveCount(0);

  const blackPawn = await pieceAt(page, 'e7');
  await next(page);
  expect(await pieceAt(page, 'd6')).toEqual(blackPawn);
  await next(page, 4);
  const king = await pieceAt(page, 'e1');
  const rook = await pieceAt(page, 'h1');
  await next(page);
  expect(await pieceAt(page, 'g1')).toEqual(king);
  expect(await pieceAt(page, 'f1')).toEqual(rook);

  const diagnostic = await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect());
  expect(diagnostic.board.stats.semanticMoves).toBe(11);
  expect(diagnostic.board.stats.semanticFallbacks).toBe(0);
  expect(diagnostic.board.metrics.renderer.squareCount).toBe(64);
  expect(await page.evaluate(() => window.__readerBoardRoot === document.querySelector('#pgn-chessboard .caissa-board')
    && window.__readerSquares.every((node, index) => node === document.querySelectorAll('.caissa-board__square')[index]))).toBe(true);
});

test('promotion replaces only the pawn and identical/arbitrary/game-switch updates retain the board shell', async ({ page }) => {
  await openReader(page, { width: 430, height: 932 });
  await loadPgn(page, `[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n[White "Promoter"]\n[Black "King"]\n[Result "*"]\n\n1. a8=Q+ *`);
  const pawn = await pieceAt(page, 'a7');
  await page.evaluate(() => {
    window.__readerBoardRoot = document.querySelector('#pgn-chessboard .caissa-board');
    window.__readerSquareA1 = document.querySelector('.caissa-board__square[data-square="a1"]');
  });
  await next(page);
  const queen = await pieceAt(page, 'a8');
  expect(queen.piece).toBe('wQ');
  expect(queen.id).not.toBe(pawn.id);
  await expect(page.locator(`[data-piece-id="${pawn.id}"]`)).toHaveCount(0);

  const before = await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().board.metrics.renderer.identicalUpdates);
  const mutations = await page.evaluate(async () => {
    const root = document.querySelector('#pgn-chessboard .caissa-board');
    let changes = 0;
    const observer = new MutationObserver(records => { changes += records.length; });
    observer.observe(root, { attributes: true, childList: true, subtree: true });
    document.querySelector('.pgn-move.is-active').click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.disconnect();
    return changes;
  });
  expect(mutations).toBe(0);
  expect(await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().board.metrics.renderer.identicalUpdates)).toBe(before + 1);

  await loadPgn(page, TWO_GAMES, 2);
  await page.getByRole('tab', { name: 'Notation' }).click();
  await page.getByRole('button', { name: /6\. O-O/ }).click();
  expect((await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect())).board.strategy).toBe('position');
  await page.getByRole('tab', { name: 'Games' }).click();
  await page.locator('[data-game-index="1"]').click();
  expect(await page.evaluate(() => window.__readerBoardRoot === document.querySelector('#pgn-chessboard .caissa-board')
    && window.__readerSquareA1 === document.querySelector('.caissa-board__square[data-square="a1"]'))).toBe(true);
});

test('flip, autoplay/pause, 20 sequential moves, 50 rapid updates and 100 positions avoid remounts', async ({ page }) => {
  await openReader(page);
  await loadPgn(page, soakPgn());
  await page.evaluate(() => {
    window.__readerBoardRoot = document.querySelector('#pgn-chessboard .caissa-board');
    window.__readerSquares = [...document.querySelectorAll('.caissa-board__square')];
    window.__readerPieceNodes = new Map([...document.querySelectorAll('.caissa-board__piece')].map(node => [node.dataset.pieceId, node]));
  });

  await next(page, 20);
  const twenty = await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect());
  expect(twenty.board.stats.semanticMoves).toBe(20);
  expect(twenty.currentNodeId).toBe('g1-n20');
  await page.locator('[data-pgn-mobile-menu] > summary').click();
  await page.locator('[data-pgn-mobile-action="flip"]').click();
  expect(await page.evaluate(() => [...document.querySelectorAll('.caissa-board__piece')]
    .every(node => window.__readerPieceNodes.get(node.dataset.pieceId) === node))).toBe(true);

  await page.locator('[data-pgn-mobile-menu] > summary').click();
  await page.locator('[data-pgn-mobile-speed]').selectOption('400');
  await page.locator('[data-pgn-mobile-menu] > summary').click();
  await page.locator('[data-pgn-play]').click();
  await expect.poll(() => page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().autoplay)).toBe(true);
  await page.waitForTimeout(850);
  await page.locator('[data-pgn-play]').click();
  expect(await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().autoplay)).toBe(false);
  const pausedNode = await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().currentNodeId);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().currentNodeId)).toBe(pausedNode);

  const rapidStartNode = await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().currentNodeId);
  for (let index = 0; index < 25; index += 1) {
    await page.locator('[data-pgn-previous]').click();
    await page.locator('[data-pgn-next]').click();
  }
  expect(await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().currentNodeId)).toBe(rapidStartNode);
  while (await page.locator('[data-pgn-next]').isEnabled()) await page.locator('[data-pgn-next]').click();
  const diagnostic = await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect());
  expect(diagnostic.board.stats.semanticMoves).toBeGreaterThanOrEqual(100);
  expect(diagnostic.currentNodeId).toBe('g1-n100');
  expect(diagnostic.board.position.renderedPlacement).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  expect(diagnostic.board.position.pending).toBe(false);
  expect(diagnostic.board.metrics.renderer.squareCount).toBe(64);
  expect(diagnostic.board.metrics.renderer.nodesAdded).toBe(0);
  expect(diagnostic.board.metrics.renderer.nodesRemoved).toBe(0);
  expect(await page.evaluate(() => window.__readerBoardRoot === document.querySelector('#pgn-chessboard .caissa-board')
    && window.__readerSquares.every((node, index) => node === document.querySelectorAll('.caissa-board__square')[index]))).toBe(true);
});

test('four required mobile viewports keep the board, controls and panel within their geometry', async ({ page }) => {
  await openReader(page, { width: 390, height: 844 });
  await loadPgn(page, TWO_GAMES, 2);
  await page.locator('[data-pgn-mobile-menu] > summary').click();
  await expect(page.locator('[data-pgn-mobile-action]:visible')).toHaveCount(9);
  await page.locator('[data-pgn-mobile-action="next-game"]').click();
  await expect(page.locator('[data-pgn-title]')).toContainText('Gamma');
  await page.locator('[data-pgn-mobile-menu] > summary').click();
  await expect(page.locator('[data-pgn-mobile-action="next-game"]')).toBeDisabled();
  await page.locator('[data-pgn-mobile-action="options"]').click();
  await expect(page.locator('[data-pgn-options-dialog]')).toBeVisible();
  await page.locator('[data-pgn-options-dialog]').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-pgn-mobile-menu] > summary')).toBeFocused();
  const viewports = [
    { width: 390, height: 844, landscape: false },
    { width: 430, height: 932, landscape: false },
    { width: 844, height: 390, landscape: true },
    { width: 932, height: 430, landscape: true }
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(120);
    const geometry = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const visible = selector => [...document.querySelectorAll(selector)].filter(node => {
        const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }).length;
      return {
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        board: box('.pgn-board-stage'), panel: box('.pgn-panel'), tabs: box('.pgn-tabs'), bar: box('.pgn-toolbar'),
        visiblePrimary: visible('.pgn-essential-navigation button, [data-pgn-mobile-menu] > summary'),
        visibleSecondary: visible('.pgn-toolbar-view > *, .pgn-toolbar-playback > [data-pgn-first], .pgn-toolbar-playback > [data-pgn-last]')
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(geometry.board.width).toBeGreaterThanOrEqual(viewport.landscape ? 230 : 360);
    expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThanOrEqual(1);
    expect(geometry.board.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.bar.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(geometry.visiblePrimary).toBe(4);
    expect(geometry.visibleSecondary).toBe(0);
    expect(geometry.tabs.top).toBeGreaterThanOrEqual(viewport.landscape ? 0 : geometry.board.bottom);
    if (viewport.landscape) {
      expect(geometry.board.right).toBeLessThan(geometry.panel.left);
      expect(geometry.board.bottom).toBeLessThanOrEqual(geometry.bar.top + 1);
      expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.bar.top + 1);
      expect(geometry.documentHeight).toBeLessThanOrEqual(viewport.height);
    }
    const targets = await page.locator('.pgn-essential-navigation button, [data-pgn-mobile-menu] > summary').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()).map(rect => ({ width: rect.width, height: rect.height })));
    expect(targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
  }
});

test('rotation preserves board identity, read-only input and keyboard replay with one effective geometry update', async ({ page }) => {
  await openReader(page, { width: 390, height: 844 });
  await loadPgn(page, SPECIAL_MOVES);
  const board = page.locator('#pgn-chessboard .caissa-board');
  await expect(board).toHaveAttribute('aria-readonly', 'true');
  await expect(board).toHaveAttribute('aria-disabled', 'true');
  await board.focus();
  const initialNode = (await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect())).currentNodeId;
  await page.keyboard.press('ArrowRight');
  expect((await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect())).currentNodeId).not.toBe(initialNode);
  const generation = (await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect())).board.metrics.renderer.generation;
  await page.evaluate(() => {
    const square = document.querySelector('.caissa-board__square[data-square="e4"]');
    square.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerId: 1, pointerType: 'touch' }));
    square.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerId: 1, pointerType: 'touch' }));
  });
  expect((await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect())).board.metrics.renderer.generation).toBe(generation);

  await page.evaluate(() => {
    window.__readerBoardRoot = document.querySelector('#pgn-chessboard .caissa-board');
    window.__readerSquareA1 = document.querySelector('.caissa-board__square[data-square="a1"]');
  });
  const beforeInspect = (await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect())).board.metrics.renderer;
  const before = beforeInspect.geometryChanges;
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().board.metrics.renderer.geometry.width))
    .not.toBe(beforeInspect.geometry.width);
  const middle = (await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect())).board.metrics.renderer.geometryChanges;
  const middleWidth = (await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect())).board.metrics.renderer.geometry.width;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect().board.metrics.renderer.geometry.width))
    .not.toBe(middleWidth);
  const after = (await page.evaluate(() => window.CaissaPgnReaderDiagnostics.inspect())).board.metrics.renderer.geometryChanges;
  expect(middle - before).toBe(1);
  expect(after - middle).toBe(1);
  expect(await page.evaluate(() => window.__readerBoardRoot === document.querySelector('#pgn-chessboard .caissa-board')
    && window.__readerSquareA1 === document.querySelector('.caissa-board__square[data-square="a1"]'))).toBe(true);
});

test('reduced motion disables piece transitions without changing replay behavior', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openReader(page);
  await loadPgn(page, SPECIAL_MOVES);
  const board = page.locator('#pgn-chessboard .caissa-board');
  await expect(board).toHaveAttribute('data-reduced-motion', 'true');
  await next(page);
  await expect(page.locator('.caissa-board__piece[data-square="e4"]')).toHaveCount(1);
  expect(await page.locator('.caissa-board__piece[data-square="e4"]').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
});

test('mobile Engine ON stays below tabs without resizing the board and OFF has useful content', async ({ page }) => {
  await page.route('**/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `onmessage = event => {
      if (event.data === 'uci') postMessage('uciok');
      if (event.data === 'isready') postMessage('readyok');
      if (String(event.data).startsWith('go ')) {
        postMessage('info depth 10 multipv 1 score cp 35 pv e2e4 e7e5 g1f3');
        postMessage('info depth 10 multipv 2 score cp 12 pv d2d4 d7d5 c2c4');
        postMessage('bestmove e2e4');
      }
      if (event.data === 'stop') postMessage('bestmove e2e4');
    };`
  }));
  await openReader(page);
  await loadPgn(page, SPECIAL_MOVES);
  const boardWidth = (await page.locator('.pgn-board-stage').boundingBox()).width;
  await page.locator('[data-pgn-mobile-menu] > summary').click();
  await page.locator('[data-pgn-mobile-action="engine"]').click();
  await expect(page.locator('[data-pgn-engine-panel]:visible .pgn-engine-line')).toHaveCount(2);
  const engineGeometry = await page.evaluate(() => {
    const tabs = document.querySelector('.pgn-tabs').getBoundingClientRect();
    const engine = document.querySelector('[data-pgn-engine-panel]').getBoundingClientRect();
    return { tabsBottom: tabs.bottom, engineTop: engine.top };
  });
  expect(engineGeometry.engineTop).toBeGreaterThanOrEqual(engineGeometry.tabsBottom);
  expect((await page.locator('.pgn-board-stage').boundingBox()).width).toBe(boardWidth);
  await expect(page.locator('.pgn-panel-actions')).toBeHidden();

  await page.locator('[data-pgn-mobile-menu] > summary').click();
  await page.locator('[data-pgn-mobile-action="engine"]').click();
  await expect(page.locator('[data-pgn-engine-panel]')).toHaveAttribute('data-state', 'off');
  await expect(page.locator('[data-pgn-engine-panel]')).toContainText('Turn Engine on to analyze');
});

test('mobile Reader has no serious or critical accessibility violations', async ({ page }) => {
  await openReader(page);
  await loadPgn(page, SPECIAL_MOVES);
  await page.locator('[data-pgn-mobile-menu] > summary').click();
  const results = await new AxeBuilder({ page }).include('[data-pgn-app]').analyze();
  expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact))).toEqual([]);
});
