import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const evidenceDirectory = join(process.cwd(), 'docs', 'visual-evidence');

async function openPuzzle(page, id) {
    await page.goto(`/puzzles?puzzle=${id}`);
    await expect(page.locator('#puzzle-id')).toHaveText(`Puzzle ${id}`);
    await page.locator('#tab-training').click();
}

async function playMove(page, from, to) {
    await page.locator(`#caissa-board-1-square-${from}`).click();
    await expect(page.locator(`.caissa-board__highlight--selected[data-square="${from}"]`)).toBeVisible();
    await page.locator(`#caissa-board-1-square-${to}`).click();
}

test.beforeAll(async () => {
    await mkdir(evidenceDirectory, { recursive: true });
});

test('full-catalog folder and theme counts distinguish totals from the active range', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/puzzles');

    const motifsFolder = page.locator('#categories button').filter({ hasText: /^Motifs/ });
    await expect(motifsFolder.locator('small')).toHaveText('2,145,051 total · 265,849 available at your level');
    await motifsFolder.click();
    await expect(page.locator('#subthemes button').first().locator('small'))
        .toHaveText('2,145,051 total · 265,849 available at your level');
    await expect(page.locator('#subthemes button').filter({ hasText: /^Fork/ }).locator('small'))
        .toHaveText('781,805 total · 84,128 available at your level');

    await page.locator('#tab-stats').click();
    await page.locator('#target-rating').fill('2200');
    await page.locator('#difficulty').selectOption('easier');
    await expect(motifsFolder.locator('small')).toHaveText('2,145,051 total · 160,199 available at your level');
    await page.locator('#tab-themes').click();
    await expect(page.locator('#subthemes button').filter({ hasText: /^Fork/ }).locator('small'))
        .toHaveText('781,805 total · 48,431 available at your level');
    await page.screenshot({ path: join(evidenceDirectory, 'puzzles-full-counts-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(motifsFolder.locator('small')).toBeVisible();
    await page.screenshot({ path: join(evidenceDirectory, 'puzzles-full-counts-mobile.png'), fullPage: true });
});

test('4TN7E preserves en passant, follows review positions, and isolates engine exploration', async ({ page }) => {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.__puzzleWorkerLifecycle = { created: 0, terminated: 0 };
        window.Worker = class TrackedWorker extends NativeWorker {
            constructor(...args) {
                super(...args);
                this.__isPuzzleStockfishWorker = String(args[0]).includes('/assets/vendor/stockfish/');
                if (this.__isPuzzleStockfishWorker) window.__puzzleWorkerLifecycle.created += 1;
            }
            terminate() {
                if (this.__isPuzzleStockfishWorker) window.__puzzleWorkerLifecycle.terminated += 1;
                return super.terminate();
            }
        };
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPuzzle(page, '4TN7E');

    await expect(page.locator('.caissa-board__highlight--last[data-square="a2"]')).toBeVisible();
    await expect(page.locator('.caissa-board__highlight--last[data-square="a4"]')).toBeVisible();
    await expect(page.locator('#move-list')).toContainText(/33\.\s*a4/);
    await expect(page.locator('#engine-toggle')).toBeDisabled();
    await expect(page.locator('#engine-match-start')).toBeDisabled();

    await playMove(page, 'b4', 'a3');
    await expect(page.locator('#puzzle-feedback')).toContainText('Good move');
    await playMove(page, 'c6', 'c5');
    await expect(page.locator('#puzzle-prompt')).toHaveText('Puzzle solved');
    await expect(page.locator('#session-count')).toContainText('1 solved');

    await page.locator('#engine-toggle').click();
    await expect(page.locator('#engine-toggle')).toHaveText('Stop analysis');
    await expect(page.locator('#engine-eval')).toContainText('Depth', { timeout: 15_000 });
    await expect(page.locator('#engine-best-move')).toContainText('Best move:');
    await expect(page.locator('#engine-variation')).toContainText('Variation:');
    await page.locator('#engine-toggle').click();
    await expect(page.locator('#engine-toggle')).toHaveText('Analyze with Stockfish');
    await expect(page.locator('#engine-eval')).toBeEmpty();
    await page.locator('#engine-toggle').click();
    await expect(page.locator('#engine-eval')).toContainText('Depth', { timeout: 15_000 });

    await page.locator('#review-start').click();
    await expect(page.locator('#review-position')).toHaveText('Move 0 of 3');
    await expect(page.locator('.caissa-board__highlight--last[data-square="a2"]')).toBeVisible();
    await expect(page.locator('.caissa-board__highlight--last[data-square="a4"]')).toBeVisible();
    await expect(page.locator('#engine-best-move')).toContainText('bxa3', { timeout: 15_000 });

    await page.locator('#tab-stats').click();
    const ratingBefore = await page.locator('#session-rating').textContent();
    const solvedBefore = await page.locator('#stats-solved').textContent();
    await page.locator('#tab-training').click();
    await page.locator('#review-next').click();
    await expect(page.locator('#review-position')).toHaveText('Move 1 of 3');
    await expect(page.locator('.caissa-board__highlight--last[data-square="b4"]')).toBeVisible();
    await expect(page.locator('.caissa-board__highlight--last[data-square="a3"]')).toBeVisible();

    await page.locator('#engine-match-start').scrollIntoViewIfNeeded();
    const viewportBeforeMatch = await page.evaluate(() => window.scrollY);
    const boardBeforeMatch = await page.locator('#puzzle-board').boundingBox();
    await page.locator('#engine-match-start').click();
    await expect(page.locator('#engine-match-moves li').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#engine-match-moves li').nth(1)).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.scrollY)).toBe(viewportBeforeMatch);
    expect((await page.locator('#puzzle-board').boundingBox())?.y).toBe(boardBeforeMatch?.y);
    await page.locator('#engine-match-pause').click();
    const pausedCount = await page.locator('#engine-match-moves li').count();
    await page.waitForTimeout(900);
    await expect(page.locator('#engine-match-moves li')).toHaveCount(pausedCount);
    await page.locator('#engine-match-stop').click();
    await expect(page.locator('#review-position')).toHaveText('Move 1 of 3');

    await page.locator('#tab-stats').click();
    await expect(page.locator('#session-rating')).toHaveText(ratingBefore ?? '');
    await expect(page.locator('#stats-solved')).toHaveText(solvedBefore ?? '');
    await page.locator('#tab-training').click();
    await page.locator('#review-start').click();

    await page.locator('#engine-toggle').click();
    await expect(page.locator('#engine-eval')).toContainText('Depth', { timeout: 15_000 });
    await page.screenshot({ path: join(evidenceDirectory, 'puzzles-training-engine.png'), fullPage: true });

    await page.locator('#next-puzzle').click();
    await expect(page.locator('#puzzle-id')).not.toHaveText('Puzzle 4TN7E');
    await expect(page.locator('#engine-toggle')).toBeDisabled();
    await expect(page.locator('#engine-toggle')).toHaveText('Analyze with Stockfish');
    const workerLifecycle = await page.evaluate(() => window.__puzzleWorkerLifecycle);
    expect(workerLifecycle.created).toBeGreaterThan(0);
    expect(workerLifecycle.terminated).toBe(workerLifecycle.created);
});

test('a failed puzzle unlocks analysis without counting as solved', async ({ page }) => {
    await openPuzzle(page, '4TN7E');
    await playMove(page, 'b4', 'b3');
    await expect(page.locator('#puzzle-feedback')).toContainText('That is not the solution');
    await expect(page.locator('#engine-toggle')).toBeEnabled();
    await expect(page.locator('#engine-match-start')).toBeEnabled();
    await expect(page.locator('#session-count')).toContainText('0 solved');
});

test('signed-in progress survives an offline retry without duplicating the outcome', async ({ page }) => {
    const postedOutcomes = [];
    let rejectNextWrite = true;
    let storedProgress = { rating: 1800, solved: 0, failed: 0 };

    await page.route('**/js/caissa-auth.js*', route => route.fulfill({
        contentType: 'application/javascript',
        body: `window.CAISSA_AUTH = {
            isSignedIn: true, isLoaded: true, userId: 'browser-qa-user', status: 'authenticated',
            whenReady: async () => window.CAISSA_AUTH,
            getToken: async () => 'browser-qa-token',
            onAuthStateChange: () => () => {},
            getState: () => ({ isSignedIn: true, isLoaded: true, userId: 'browser-qa-user' })
        };`,
    }));
    await page.route('**/api/puzzles/progress', async route => {
        const request = route.request();
        if (request.method() === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ progress: storedProgress, persistent: true }) });
            return;
        }
        const outcome = request.postDataJSON();
        postedOutcomes.push(outcome);
        if (rejectNextWrite) {
            rejectNextWrite = false;
            await route.fulfill({ status: 503, contentType: 'application/json',
                body: JSON.stringify({ code: 'PROGRESS_UNAVAILABLE' }) });
            return;
        }
        storedProgress = { rating: 1811, solved: 1, failed: 0 };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            progress: { ...storedProgress, change: 11, duplicate: false }, persistent: true,
        }) });
    });

    await openPuzzle(page, '4TN7E');
    await playMove(page, 'b4', 'a3');
    await playMove(page, 'c6', 'c5');
    await page.locator('#tab-stats').click();
    await expect(page.locator('#progress-storage')).toContainText('unsaved result may be pending');
    expect(await page.evaluate(() => Object.keys(localStorage)
        .filter(key => key.startsWith('caissa:puzzles:pending:v1:')).length)).toBe(1);

    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('#progress-storage')).toContainText('saved to your account');
    await expect(page.locator('#session-rating')).toHaveText('1811');
    await expect(page.locator('#stats-solved')).toHaveText('1');
    expect(postedOutcomes).toHaveLength(2);
    expect(postedOutcomes[1].operationId).toBe(postedOutcomes[0].operationId);
    expect(await page.evaluate(() => Object.keys(localStorage)
        .filter(key => key.startsWith('caissa:puzzles:pending:v1:')).length)).toBe(0);

    await page.reload();
    await page.locator('#tab-stats').click();
    await expect(page.locator('#progress-storage')).toContainText('saved to your account');
    await expect(page.locator('#session-rating')).toHaveText('1811');
    await expect(page.locator('#stats-solved')).toHaveText('1');
    expect(postedOutcomes).toHaveLength(2);
});

test('promotion is visual, accessible, keyboard operable, and responsive', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPuzzle(page, 'zUEZB');
    await playMove(page, 'b2', 'b1');

    const dialog = page.locator('#promotion-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-piece-color', 'black');
    for (const name of ['queen', 'rook', 'bishop', 'knight']) {
        await expect(page.getByRole('button', { name: `Promote to black ${name}` })).toBeVisible();
    }
    await page.screenshot({ path: join(evidenceDirectory, 'puzzles-promotion-mobile.png') });

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('#move-list')).toContainText('b1=N+');
    await expect(page.locator('#puzzle-feedback')).not.toContainText('Puzzle failed');
});

test('desktop pointer promotion uses the selected piece without an incidental miss', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPuzzle(page, 'zUEZB');
    await playMove(page, 'b2', 'b1');
    await page.getByRole('button', { name: 'Promote to black knight' }).click();
    await expect(page.locator('#promotion-dialog')).not.toBeVisible();
    await expect(page.locator('#move-list')).toContainText('b1=N+');
    await expect(page.locator('#puzzle-feedback')).not.toContainText('That is not the solution');
});

test('touch can execute a white en-passant capture from the preserved FEN target', async ({ browser }) => {
    const context = await browser.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();
    try {
        await openPuzzle(page, 'G0HRE');
        await expect(page.locator('.caissa-board__highlight--last[data-square="f7"]')).toBeVisible();
        await expect(page.locator('.caissa-board__highlight--last[data-square="f5"]')).toBeVisible();
        await page.locator('#caissa-board-1-square-e5').tap();
        await page.locator('#caissa-board-1-square-f6').tap();
        await expect(page.locator('#puzzle-feedback')).toContainText('Good move');
    } finally {
        await context.close();
    }
});
