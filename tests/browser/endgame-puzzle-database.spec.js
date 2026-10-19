import { expect, test } from '@playwright/test';

const ROOK_ENDGAME = Object.freeze({
    id: 'FDIZd',
    fen: '8/7k/4pK1P/3rP3/8/8/3p4/3R4 b - - 3 56',
    moves: 'h7h6 d1h1',
    rating: 1874,
    deviation: 76,
    popularity: 95,
    plays: 3842,
    themes: ['endgame', 'mate', 'mateIn1', 'oneMove', 'rookEndgame'],
    gameUrl: 'https://lichess.org/fKfhbyVv/black#112',
    openingTags: [],
});

const PROMOTION_ENDGAME = Object.freeze({
    id: 'promoN',
    fen: '7k/P7/8/8/7p/8/8/7K b - - 0 1',
    moves: 'h4h3 a7a8n',
    rating: 1800,
    deviation: 75,
    popularity: 100,
    plays: 900,
    themes: ['endgame', 'pawnEndgame', 'promotion', 'underPromotion'],
    gameUrl: 'https://lichess.org/promotion-test',
    openingTags: [],
});

const LONG_ENDGAME = Object.freeze({
    id: '005gP',
    fen: '8/8/3p4/2kP4/1p4P1/2pK4/P7/8 w - - 1 42',
    moves: 'g4g5 c5d5 g5g6 d5e6 g6g7 e6f7 a2a4 b4a3 g7g8r f7g8',
    rating: 1775,
    deviation: 75,
    popularity: 100,
    plays: 1073,
    themes: ['crushing', 'enPassant', 'endgame', 'pawnEndgame', 'veryLong'],
    gameUrl: 'https://lichess.org/I76OvKQT#83',
    openingTags: [],
});

const ANALYSIS_ENDGAME = Object.freeze({
    id: 'analysisRook',
    fen: '8/8/8/8/8/8/4k3/R5K1 b - - 0 1',
    moves: 'e2f3 a1a3',
    rating: 1800,
    deviation: 75,
    popularity: 100,
    plays: 500,
    themes: ['endgame', 'rookEndgame'],
    gameUrl: 'https://lichess.org/analysis-rook-test',
    openingTags: [],
});

const PAIRED_HISTORY_ENDGAME = Object.freeze({
    id: 'A6qdi',
    fen: '8/8/2pk4/5Ppp/1P2K3/7P/8/8 b - - 1 37',
    moves: 'g5g4 h3g4 h5g4 e4f4 c6c5 b4c5',
    rating: 1659,
    deviation: 75,
    popularity: 100,
    plays: 2593,
    themes: ['crushing', 'endgame', 'long', 'pawnEndgame'],
    gameUrl: 'https://lichess.org/QZ2xToKH/black#74',
    openingTags: [],
});

async function mockCatalog(page, requests = [], puzzle = ROOK_ENDGAME) {
    await page.route('**/api/puzzles/select?**', async route => {
        requests.push(new URL(route.request().url()));
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                source: 'full-catalog',
                sourceVersion: '2026-09-10',
                cursor: null,
                hasMore: false,
                estimatedTotal: null,
                puzzles: puzzle ? [puzzle] : [],
            }),
        });
    });
}

async function openTrainer(page, requests = [], puzzle = ROOK_ENDGAME) {
    await mockCatalog(page, requests, puzzle);
    await page.goto('/endgame-trainer');
    await expect(page.locator('#egt-puzzle-id')).toHaveText(`Puzzle ${puzzle.id}`);
}

async function playMove(page, from, to) {
    await page.locator(`#caissa-board-1-square-${from}`).click();
    await expect(page.locator(`.caissa-board__highlight--selected[data-square="${from}"]`)).toBeVisible();
    await page.locator(`#caissa-board-1-square-${to}`).click();
}

async function dragMove(page, from, to, { assertQuietDrag = false } = {}) {
    const source = await page.locator(`#caissa-board-1-square-${from}`).boundingBox();
    const target = await page.locator(`#caissa-board-1-square-${to}`).boundingBox();
    if (!source || !target) throw new Error(`Missing drag geometry for ${from}-${to}`);
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
    if (assertQuietDrag) {
        await expect(page.locator('#egt-board .caissa-board')).toHaveAttribute('data-quiet-drag-active', 'true');
        const dragged = page.locator('#egt-board .caissa-board__piece[data-dragging="true"]');
        await expect(dragged).toHaveCount(1);
        expect(await dragged.evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
    }
    await page.mouse.up();
    await expect(page.locator('#egt-board .caissa-board')).not.toHaveAttribute('data-quiet-drag-active', 'true');
}

test('canonical Endgame Trainer uses catalog themes, generated counts and strict intersections', async ({ page }) => {
    const requests = [];
    await page.setViewportSize({ width: 1366, height: 768 });
    await openTrainer(page, requests);

    await expect(page.getByRole('heading', { name: 'CAISSA Endgame Trainer' })).toBeVisible();
    await expect(page.getByText('LICHESS ENDGAME PUZZLES', { exact: true })).toHaveCount(0);
    await expect(page.locator('#egt-theme-list strong')).toHaveText([
        'All Endgames', 'Queen Endgame', 'Rook Endgame', 'Bishop Endgame', 'Knight Endgame', 'Pawn Endgame',
    ]);
    await expect(page.locator('.endgame-puzzle__attribution')).toContainText('Lichess puzzle data is CC0');
    await expect(page.locator('.endgame-puzzle__attribution a')).toHaveAttribute('href', '/puzzles');
    await expect(page.locator('#egt-theme-list button').first()).toContainText('3,061,498 total');
    await expect(page.locator('#egt-theme-list button').filter({ hasText: /^Rook Endgame/ })).toContainText('328,823 total');
    expect(requests[0].searchParams.get('themes')).toBe('endgame');
    expect(requests[0].searchParams.get('themeMode')).toBeNull();

    await page.locator('#egt-theme-list button').filter({ hasText: /^Rook Endgame/ }).click();
    await expect(page.locator('#egt-selected-theme')).toHaveText('Rook Endgame');
    await expect(page.locator('#egt-tab-training')).toHaveAttribute('aria-selected', 'true');
    expect(requests.at(-1).searchParams.get('themes')).toBe('endgame,rookEndgame');
    expect(requests.at(-1).searchParams.get('themeMode')).toBe('all');
    await expect(page.locator('#egt-theme-tags')).toContainText('Endgame');
    await expect(page.locator('#egt-theme-tags')).toContainText('Rook Endgame');

    const board = await page.locator('#egt-board').boundingBox();
    const square = await page.locator('.caissa-board__square').first().boundingBox();
    const workspace = await page.locator('.endgame-puzzle__workspace').boundingBox();
    const masthead = await page.locator('.endgame-puzzle__masthead').boundingBox();
    const layout = await page.locator('.endgame-puzzle__layout').boundingBox();
    expect(board?.width).toBeGreaterThan(560);
    expect(Math.abs((square?.width || 0) - (board?.width || 0) / 8)).toBeLessThanOrEqual(1);
    expect(board?.x).toBeLessThan(workspace?.x ?? 0);
    expect((layout?.y || 0) - ((masthead?.y || 0) + (masthead?.height || 0))).toBeLessThanOrEqual(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname));
    expect(resources).not.toEqual(expect.arrayContaining([
        '/assets/vendor/jquery/jquery-3.6.0.min.js',
        '/assets/vendor/chessboard.js/chessboard-1.0.0.min.js',
        '/js/endgame-trainer/endgame-trainer-page.js',
        '/js/endgame-trainer/endgame-trainer-runtime.js',
    ]));
});

test('move history pairs real colors and fullmove numbers with individually navigable SAN cells', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await openTrainer(page, [], PAIRED_HISTORY_ENDGAME);
    await page.locator('#egt-tab-training').click();
    await page.locator('#egt-reveal').click();

    const rows = page.locator('#egt-move-list > li');
    await expect(rows).toHaveCount(4);
    await expect(rows.locator('.move-number')).toHaveText(['37...', '38.', '39.', '40.']);
    await expect(rows.locator('button.move-cell--white')).toHaveText(['hxg4', 'Kf4', 'bxc5+']);
    await expect(rows.locator('button.move-cell--black')).toHaveText(['g4', 'hxg4', 'c5']);
    await expect(rows.nth(0).locator('.move-cell--white')).toHaveText('');
    await expect(rows.nth(3).locator('.move-cell--black')).toHaveText('');
    await expect(rows.nth(3).locator('button.move-cell--black')).toHaveCount(0);
    await expect(rows.nth(3).locator('button.move-cell--white')).toHaveAttribute('aria-current', 'move');

    await page.locator('#egt-tab-analysis').click();
    await page.locator('#egt-analysis-match-tab').click();
    await page.locator('#egt-tab-training').click();
    await rows.nth(1).locator('button.move-cell--white').click();
    await expect(page.locator('#egt-tab-analysis')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#egt-analysis-engine-tab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 3 of 7');
    await expect(page.locator('#egt-analysis-move-list button[data-analysis-cursor="2"]')).toHaveAttribute('aria-current', 'move');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="wP"][data-square="g4"]')).toHaveCount(1);

    await page.locator('#egt-analysis-move-list button.move-cell--black').filter({ hasText: 'c5' }).click();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 6 of 7');
    await expect(page.locator('#egt-analysis-move-list button[data-analysis-cursor="5"]')).toHaveAttribute('aria-current', 'move');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="bP"][data-square="c5"]')).toHaveCount(1);

    await page.locator('#egt-nav-previous').click();
    await expect(page.locator('#egt-analysis-move-list button[data-analysis-cursor="4"]')).toHaveAttribute('aria-current', 'move');
    await playMove(page, 'd6', 'e7');
    await expect(page.locator('#egt-analysis-feedback')).toContainText('New continuation started');
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 6 of 6');
    await expect(page.locator('#egt-analysis-move-list')).not.toContainText('c5');
    await expect(page.locator('#egt-analysis-move-list')).not.toContainText('bxc5+');
    await expect(page.locator('#egt-analysis-move-list button[aria-current="move"]')).toHaveText('Ke7');
    await expect(page.locator('#egt-solved')).toHaveText('0');
    await expect(page.locator('#egt-failed')).toHaveText('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('training keeps analysis locked, records a miss once, and isolates engine exploration', async ({ page }) => {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.__egtWorkers = { created: 0, terminated: 0 };
        window.Worker = class TrackedWorker extends NativeWorker {
            constructor(...args) {
                super(...args);
                if (String(args[0]).includes('/assets/vendor/stockfish/')) window.__egtWorkers.created += 1;
            }
            terminate() {
                window.__egtWorkers.terminated += 1;
                return super.terminate();
            }
        };
    });
    await openTrainer(page);
    await page.locator('#egt-tab-analysis').click();
    await expect(page.locator('#egt-analysis-lock')).toBeVisible();
    await expect(page.locator('#egt-analysis-tools')).toBeHidden();
    await expect(page.locator('#egt-analysis-navigation')).toBeHidden();

    await page.locator('#egt-tab-training').click();
    await playMove(page, 'd1', 'd2');
    await expect(page.locator('#egt-feedback')).toContainText('not the puzzle solution');
    await expect(page.locator('#egt-failed')).toHaveText('1');
    await expect(page.locator('#egt-retry')).toBeEnabled();

    await page.locator('#egt-tab-analysis').click();
    await expect(page.locator('#egt-analysis-lock')).toBeHidden();
    await expect(page.locator('#egt-analysis-tools')).toBeVisible();
    await page.locator('#egt-engine-toggle').click();
    await expect(page.locator('#egt-engine-toggle')).toHaveText('Stop engine');
    await expect(page.locator('#egt-engine-eval')).not.toHaveText('—', { timeout: 15_000 });
    await page.locator('#egt-tab-training').click();
    await expect(page.locator('#egt-engine-toggle')).toHaveText('Start engine');

    const lifecycle = await page.evaluate(() => window.__egtWorkers);
    expect(lifecycle.created).toBeGreaterThan(0);
    expect(lifecycle.terminated).toBe(lifecycle.created);
    await expect(page.locator('#egt-failed')).toHaveText('1');
    await expect(page.locator('#egt-solved')).toHaveText('0');
    await expect(page.locator('#egt-session-policy')).toContainText('Account puzzle rating is unchanged');
});

test('completed puzzles support Quiet Drag analysis for both sides with Stockfish on or off', async ({ page }) => {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.__egtAnalysisWorkers = { created: 0, terminated: 0, commands: [] };
        window.Worker = class TrackedWorker extends NativeWorker {
            constructor(...args) {
                super(...args);
                this.__isStockfish = String(args[0]).includes('/assets/vendor/stockfish/');
                if (this.__isStockfish) window.__egtAnalysisWorkers.created += 1;
            }
            postMessage(command, ...rest) {
                if (this.__isStockfish) window.__egtAnalysisWorkers.commands.push(String(command));
                return super.postMessage(command, ...rest);
            }
            terminate() {
                if (this.__isStockfish) window.__egtAnalysisWorkers.terminated += 1;
                return super.terminate();
            }
        };
    });
    await page.setViewportSize({ width: 1366, height: 900 });
    await openTrainer(page, [], ANALYSIS_ENDGAME);
    await page.locator('#egt-tab-training').click();
    await playMove(page, 'a1', 'a3');
    await expect(page.locator('#egt-prompt')).toHaveText('Puzzle solved');
    await expect(page.locator('#egt-solved')).toHaveText('1');

    await page.locator('#egt-tab-analysis').click();
    await expect(page.locator('#egt-board .caissa-board')).toHaveAttribute('aria-disabled', 'false');

    await dragMove(page, 'a3', 'a4', { assertQuietDrag: true });
    await expect(page.locator('#egt-analysis-feedback')).toContainText('Illegal move rejected');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="wR"]')).toHaveAttribute('data-square', 'a3');

    await dragMove(page, 'f3', 'e2');
    await expect(page.locator('#egt-side-to-move')).toHaveText('White to move · Analysis');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="bK"]')).toHaveAttribute('data-square', 'e2');

    await page.locator('#egt-flip').click();
    await expect(page.locator('#egt-board .caissa-board')).toHaveAttribute('data-orientation', 'black');
    await dragMove(page, 'a3', 'e3');
    await expect(page.locator('#egt-side-to-move')).toHaveText('Black to move · Analysis');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="wR"]')).toHaveAttribute('data-square', 'e3');

    await page.locator('#egt-engine-toggle').click();
    await expect(page.locator('#egt-engine-eval')).not.toHaveText('—', { timeout: 15_000 });
    await dragMove(page, 'e2', 'd2');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="bK"]')).toHaveAttribute('data-square', 'd2');
    await expect(page.locator('#egt-engine-eval')).not.toHaveText('—', { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => window.__egtAnalysisWorkers.created)).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => window.__egtAnalysisWorkers.commands.some(command => command === 'position fen 8/8/8/8/8/4R3/3k4/6K1 w - - 5 4'))).toBe(true);

    await page.locator('#egt-engine-toggle').click();
    await expect(page.locator('#egt-board .caissa-board')).toHaveAttribute('aria-disabled', 'false');
    await page.locator('#egt-engine-toggle').click();
    await expect(page.locator('#egt-engine-eval')).not.toHaveText('—', { timeout: 15_000 });
    await expect(page.locator('#egt-board .caissa-board')).toHaveAttribute('aria-disabled', 'false');
    await page.locator('#egt-engine-toggle').click();

    const lifecycle = await page.evaluate(() => window.__egtAnalysisWorkers);
    expect(lifecycle.terminated).toBe(lifecycle.created);
    await expect(page.locator('#egt-solved')).toHaveText('1');
    await expect(page.locator('#egt-failed')).toHaveText('0');
});

test('analysis navigation reconstructs FENs, resynchronizes Stockfish, and truncates after rewind', async ({ page }) => {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.__egtNavigationWorkers = { created: 0, terminated: 0, commands: [] };
        window.Worker = class TrackedWorker extends NativeWorker {
            constructor(...args) {
                super(...args);
                this.__isStockfish = String(args[0]).includes('/assets/vendor/stockfish/');
                if (this.__isStockfish) window.__egtNavigationWorkers.created += 1;
            }
            postMessage(command, ...rest) {
                if (this.__isStockfish) window.__egtNavigationWorkers.commands.push(String(command));
                return super.postMessage(command, ...rest);
            }
            terminate() {
                if (this.__isStockfish) window.__egtNavigationWorkers.terminated += 1;
                return super.terminate();
            }
        };
    });
    await openTrainer(page, [], ANALYSIS_ENDGAME);
    await page.locator('#egt-tab-training').click();
    await playMove(page, 'a1', 'a3');
    await page.locator('#egt-tab-analysis').click();

    const navigation = page.locator('#egt-analysis-navigation');
    await expect(navigation).toBeVisible();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 1 of 1');
    await expect(page.locator('#egt-nav-first')).toHaveAttribute('title', 'First position');
    await expect(page.locator('#egt-nav-play')).toHaveAttribute('aria-label', 'Play automatic replay');

    await dragMove(page, 'f3', 'e2');
    await dragMove(page, 'a3', 'e3');
    await dragMove(page, 'e2', 'd2');
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 4 of 4');
    await expect(page.locator('#egt-analysis-move-list > li')).toHaveCount(2);
    await expect(page.locator('#egt-analysis-move-list .move-number')).toHaveText(['2...', '3.']);
    await expect(page.locator('#egt-analysis-move-list button[aria-current="move"]')).toHaveText('Kd2');
    expect(await page.evaluate(() => window.__egtNavigationWorkers.created)).toBe(0);

    await page.locator('#egt-nav-first').click();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 1 of 4');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="bK"]')).toHaveAttribute('data-square', 'f3');
    await page.locator('#egt-nav-last').click();
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="bK"]')).toHaveAttribute('data-square', 'd2');
    await page.locator('#egt-nav-previous').click();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 3 of 4');
    await page.locator('#egt-nav-first').click();
    await page.locator('#egt-nav-next').click();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 2 of 4');

    await page.locator('#egt-engine-toggle').click();
    await expect(page.locator('#egt-engine-eval')).not.toHaveText('—', { timeout: 15_000 });
    const workersBeforeNavigation = await page.evaluate(() => window.__egtNavigationWorkers.created);
    await page.locator('#egt-nav-next').click();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 3 of 4');
    await expect(page.locator('#egt-engine-eval')).not.toHaveText('—', { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => window.__egtNavigationWorkers.created)).toBeGreaterThan(workersBeforeNavigation);
    expect(await page.evaluate(() => window.__egtNavigationWorkers.commands.includes(
        'position fen 8/8/8/8/8/4R3/4k3/6K1 b - - 4 3',
    ))).toBe(true);
    await page.locator('#egt-nav-last').click();
    await expect(page.locator('#egt-engine-eval')).not.toHaveText('—', { timeout: 15_000 });
    await page.locator('#egt-engine-toggle').click();
    const workersWithEngineOff = await page.evaluate(() => window.__egtNavigationWorkers.created);

    await page.locator('#egt-nav-previous').click();
    await page.locator('#egt-nav-previous').click();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 2 of 4');
    await dragMove(page, 'a3', 'a4');
    await expect(page.locator('#egt-analysis-feedback')).toContainText('New continuation started');
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 3 of 3');
    await expect(page.locator('#egt-nav-next')).toBeDisabled();
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="wR"]')).toHaveAttribute('data-square', 'a4');
    await expect(page.locator('#egt-analysis-move-list')).not.toContainText('Re3+');
    await expect(page.locator('#egt-analysis-move-list')).not.toContainText('Kd2');
    await expect(page.locator('#egt-analysis-move-list button[aria-current="move"]')).toHaveText('Ra4');
    expect(await page.evaluate(() => window.__egtNavigationWorkers.created)).toBe(workersWithEngineOff);
    const lifecycle = await page.evaluate(() => window.__egtNavigationWorkers);
    expect(lifecycle.terminated).toBe(lifecycle.created);
    await expect(page.locator('#egt-solved')).toHaveText('1');
    await expect(page.locator('#egt-failed')).toHaveText('0');
});

test('automatic replay pauses, reaches the final position, and cleans up when Analysis closes', async ({ page }) => {
    await openTrainer(page, [], ANALYSIS_ENDGAME);
    await page.locator('#egt-tab-training').click();
    await playMove(page, 'a1', 'a3');
    await page.locator('#egt-tab-analysis').click();
    await playMove(page, 'f3', 'e2');
    await playMove(page, 'a3', 'e3');
    await playMove(page, 'e2', 'd2');
    await page.locator('#egt-nav-first').click();

    await page.locator('#egt-nav-play').click();
    await expect(page.locator('#egt-nav-play')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 2 of 4', { timeout: 2_000 });
    await expect(page.locator('#egt-analysis-move-list button[aria-current="move"]')).toHaveText('Ke2');
    await page.locator('#egt-nav-play').click();
    await expect(page.locator('#egt-nav-play')).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(850);
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 2 of 4');

    await page.locator('#egt-nav-play').click();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 4 of 4', { timeout: 2_500 });
    await expect(page.locator('#egt-nav-play')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="bK"]')).toHaveAttribute('data-square', 'd2');
    await expect(page.locator('#egt-analysis-move-list button[aria-current="move"]')).toHaveText('Kd2');

    await page.locator('#egt-nav-play').click();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 1 of 4');
    await expect(page.locator('#egt-nav-play')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#egt-tab-training').click();
    await expect(page.locator('#egt-analysis-navigation')).toBeHidden();
    await page.waitForTimeout(850);
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="bK"]')).toHaveAttribute('data-square', 'f3');
    await page.locator('#egt-tab-analysis').click();
    await expect(page.locator('#egt-nav-status')).toHaveText('Position 1 of 1');
    await expect(page.locator('#egt-nav-play')).toBeDisabled();

    await playMove(page, 'f3', 'e2');
    await playMove(page, 'a3', 'e3');
    await page.locator('#egt-nav-first').click();
    await page.locator('#egt-nav-play').click();
    await expect(page.locator('#egt-nav-play')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#egt-next').click();
    await expect(page.locator('#egt-prompt')).toHaveText('Find the best move');
    await page.waitForTimeout(850);
    await expect(page.locator('#egt-analysis-navigation')).toBeHidden();
    await expect(page.locator('#egt-puzzle-id')).not.toHaveText('Puzzle analysisRook');
});

test('explicit abandonment unlocks unscored analysis without a second result', async ({ page }) => {
    await openTrainer(page, [], ANALYSIS_ENDGAME);
    await page.locator('#egt-tab-analysis').click();
    await expect(page.locator('#egt-analysis-lock')).toBeVisible();
    await page.locator('#egt-tab-training').click();
    await page.locator('#egt-abandon').click();
    await expect(page.locator('#egt-prompt')).toHaveText('Puzzle abandoned');
    await expect(page.locator('#egt-failed')).toHaveText('1');
    await page.locator('#egt-tab-analysis').click();
    await expect(page.locator('#egt-board .caissa-board')).toHaveAttribute('aria-disabled', 'false');
    await playMove(page, 'f3', 'e2');
    await expect(page.locator('#egt-failed')).toHaveText('1');
    await expect(page.locator('#egt-solved')).toHaveText('0');
});

test('mobile tap analysis remains legal and interactive after solve and flip', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTrainer(page, [], ANALYSIS_ENDGAME);
    const boardBefore = await page.locator('#egt-board').boundingBox();
    await page.locator('#egt-tab-training').click();
    await playMove(page, 'a1', 'a3');
    await page.locator('#egt-tab-analysis').click();
    await playMove(page, 'f3', 'e2');
    await expect(page.locator('#egt-side-to-move')).toHaveText('White to move · Analysis');
    await page.locator('#egt-flip').click();
    await playMove(page, 'a3', 'e3');
    await expect(page.locator('#egt-side-to-move')).toHaveText('Black to move · Analysis');
    const boardAfter = await page.locator('#egt-board').boundingBox();
    const navigation = await page.locator('#egt-analysis-navigation').boundingBox();
    const footer = await page.locator('.endgame-puzzle__workspace-foot').boundingBox();
    const moveList = await page.locator('#egt-analysis-move-list').boundingBox();
    expect(Math.abs((boardBefore?.width || 0) - (boardAfter?.width || 0))).toBeLessThanOrEqual(1);
    expect((navigation?.y || 0) + (navigation?.height || 0)).toBeLessThanOrEqual((footer?.y || 0) + 1);
    expect((moveList?.width || 0)).toBeLessThanOrEqual(366);
    await expect(page.locator('#egt-analysis-move-list button')).toHaveCount(2);
    await expect(page.locator('.endgame-puzzle__analysis-navigation-controls button')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('solution, retry, source link and next puzzle form a continuous loop', async ({ page }) => {
    await openTrainer(page);
    await page.locator('#egt-tab-training').click();
    await playMove(page, 'd1', 'h1');
    await expect(page.locator('#egt-prompt')).toHaveText('Puzzle solved');
    await expect(page.locator('#egt-solved')).toHaveText('1');
    await expect(page.locator('#egt-streak')).toHaveText('1');
    await expect(page.locator('#egt-source-game')).toHaveAttribute('href', ROOK_ENDGAME.gameUrl);

    await page.locator('#egt-retry').click();
    await expect(page.locator('#egt-prompt')).toHaveText('Practice retry');
    await expect(page.locator('#egt-solved')).toHaveText('1');
    await page.locator('#egt-next').click();
    await expect(page.locator('#egt-prompt')).toHaveText('Find the best move');
    await expect(page.locator('#egt-solved')).toHaveText('1');
});

test('underpromotion stays explicit and solves through the shared puzzle contract', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTrainer(page, [], PROMOTION_ENDGAME);
    await page.locator('#egt-tab-training').click();
    await playMove(page, 'a7', 'a8');
    const dialog = page.locator('#egt-promotion');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Promote to knight' })).toBeVisible();
    await page.getByRole('button', { name: 'Promote to knight' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#egt-move-list')).toContainText('=N');
    await expect(page.locator('#egt-prompt')).toHaveText('Puzzle solved');
    await expect(page.locator('#egt-solved')).toHaveText('1');
});

test('Engine vs Engine starts from the canonical puzzle result, not the manual analysis branch', async ({ page }) => {
    await openTrainer(page, [], ANALYSIS_ENDGAME);
    await page.locator('#egt-tab-training').click();
    await playMove(page, 'a1', 'a3');
    await page.locator('#egt-tab-analysis').click();
    await playMove(page, 'f3', 'e2');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="bK"]')).toHaveAttribute('data-square', 'e2');

    await page.locator('#egt-analysis-match-tab').click();
    await expect(page.locator('#egt-analysis-navigation')).toBeHidden();
    await expect(page.locator('#egt-board .caissa-board')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('#egt-match-start').click();
    await expect(page.locator('#egt-match-stop')).toBeEnabled();
    await page.locator('#egt-match-stop').click();
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="bK"]')).toHaveAttribute('data-square', 'f3');
    await expect(page.locator('#egt-board .caissa-board__piece[data-piece="wR"]')).toHaveAttribute('data-square', 'a3');
    await expect(page.locator('#egt-solved')).toHaveText('1');
    await expect(page.locator('#egt-failed')).toHaveText('0');
});

test('Engine vs Engine pauses, resumes, stops and restores the scored position', async ({ page }) => {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.__egtMatchWorkers = { created: 0, terminated: 0 };
        window.Worker = class TrackedWorker extends NativeWorker {
            constructor(...args) {
                super(...args);
                this.__isStockfish = String(args[0]).includes('/assets/vendor/stockfish/');
                if (this.__isStockfish) window.__egtMatchWorkers.created += 1;
            }
            terminate() {
                if (this.__isStockfish) window.__egtMatchWorkers.terminated += 1;
                return super.terminate();
            }
        };
    });
    await openTrainer(page, [], LONG_ENDGAME);
    await page.locator('#egt-tab-training').click();
    await page.locator('#egt-reveal').click();
    const expectedTurn = await page.locator('#egt-side-to-move').textContent();
    await page.locator('#egt-tab-analysis').click();
    await page.locator('#egt-analysis-match-tab').click();
    await page.locator('#egt-match-start').click();
    await expect(page.locator('#egt-match-moves li').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#egt-match-pause')).toBeEnabled();
    await page.locator('#egt-match-pause').click();
    await expect(page.locator('#egt-match-state')).toHaveText('Engine game paused');
    const pausedCount = await page.locator('#egt-match-moves li').count();
    await page.waitForTimeout(900);
    await expect(page.locator('#egt-match-moves li')).toHaveCount(pausedCount);
    await page.locator('#egt-match-pause').click();
    await expect(page.locator('#egt-match-state')).toHaveText('Engines are playing');
    await page.locator('#egt-match-stop').click();
    await expect(page.locator('#egt-match-moves li')).toHaveCount(0);
    await expect(page.locator('#egt-side-to-move')).toHaveText(expectedTurn || '');
    const lifecycle = await page.evaluate(() => window.__egtMatchWorkers);
    expect(lifecycle.created).toBe(2);
    expect(lifecycle.terminated).toBe(lifecycle.created);
    await expect(page.locator('#egt-failed')).toHaveText('1');
    await expect(page.locator('#egt-solved')).toHaveText('0');
});

test('empty catalog and initialization failure remain actionable', async ({ page }) => {
    await page.route('**/data/puzzles/lichess-curated-preview.json', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ categories: { Phases: ['endgame'] }, puzzles: [] }),
    }));
    await mockCatalog(page, [], null);
    await page.goto('/endgame-trainer');
    await expect(page.locator('#egt-prompt')).toHaveText('No puzzles in this range');
    await expect(page.locator('#egt-feedback')).toContainText('Choose another theme');
    await expect(page.locator('#egt-next')).toBeEnabled();

    await page.unrouteAll({ behavior: 'wait' });
    await page.route('**/data/puzzles/lichess-curated-preview.json', route => route.fulfill({ status: 503, body: '' }));
    await page.reload();
    await expect(page.locator('#egt-theme-status')).toHaveText('Catalog unavailable');
    await expect(page.locator('#egt-prompt')).toHaveText('Endgame Trainer is unavailable');
    await expect(page.locator('#egt-next')).toBeEnabled();
});

test('responsive board priority has no horizontal overflow or resize jitter', async ({ page }) => {
    await openTrainer(page);
    for (const viewport of [
        { width: 1600, height: 1000 },
        { width: 885, height: 611 },
        { width: 390, height: 844 },
        { width: 320, height: 700 },
    ]) {
        await page.setViewportSize(viewport);
        const first = await page.locator('#egt-board').boundingBox();
        await page.waitForTimeout(120);
        const second = await page.locator('#egt-board').boundingBox();
        expect(Math.abs((first?.width || 0) - (second?.width || 0))).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        if (viewport.width <= 980) {
            const workspace = await page.locator('.endgame-puzzle__workspace').boundingBox();
            expect((first?.y || 0) + (first?.height || 0)).toBeLessThanOrEqual((workspace?.y || 0) + 1);
        }
    }
});
