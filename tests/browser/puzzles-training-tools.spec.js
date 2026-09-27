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

test('4TN7E preserves en passant, follows review positions, and isolates engine exploration', async ({ page }) => {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.__puzzleWorkerLifecycle = { created: 0, terminated: 0 };
        window.Worker = class TrackedWorker extends NativeWorker {
            constructor(...args) {
                super(...args);
                window.__puzzleWorkerLifecycle.created += 1;
            }
            terminate() {
                window.__puzzleWorkerLifecycle.terminated += 1;
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

    await page.locator('#engine-match-start').click();
    await expect(page.locator('#engine-match-moves li').first()).toBeVisible({ timeout: 15_000 });
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
