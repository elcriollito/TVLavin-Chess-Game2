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

test('canonical Endgame Trainer uses catalog themes, generated counts and strict intersections', async ({ page }) => {
    const requests = [];
    await page.setViewportSize({ width: 1366, height: 768 });
    await openTrainer(page, requests);

    await expect(page.getByRole('heading', { name: 'CAISSA Endgame Trainer' })).toBeVisible();
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
    expect(board?.width).toBeGreaterThan(560);
    expect(Math.abs((square?.width || 0) - (board?.width || 0) / 8)).toBeLessThanOrEqual(1);
    expect(board?.x).toBeLessThan(workspace?.x ?? 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname));
    expect(resources).not.toEqual(expect.arrayContaining([
        '/assets/vendor/jquery/jquery-3.6.0.min.js',
        '/assets/vendor/chessboard.js/chessboard-1.0.0.min.js',
        '/js/endgame-trainer/endgame-trainer-page.js',
        '/js/endgame-trainer/endgame-trainer-runtime.js',
    ]));
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
