import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove, snapshot, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

async function openShell(page) {
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toBeVisible();
}

test('legacy Play remains default while the explicit QA flag activates one shell', async ({ page }) => {
    await page.goto('/play');
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('.caissa-simplified-shell')).toBeHidden();
    await expect(page.locator('.main-content.cais-grid')).toBeVisible();
    await openShell(page);
    await expect(page.locator('.caissa-simplified-shell')).toHaveCount(1);
    await expect(page.locator('[data-qa-preview="true"]')).toContainText('QA Preview');
});

test('shell has semantic regions, truthful modes, and exactly one set of runtime resources', async ({ page }) => {
    await openShell(page);
    await expect(page.getByRole('navigation', { name: 'Play modes' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');
    for (const mode of ['Bots', 'Coach', 'Players']) {
        await expect(page.getByRole('tab', { name: mode })).toBeDisabled();
    }
    const resources = await page.evaluate(() => ({
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        squares: document.querySelectorAll('#playSection #chessboard .square-55d63').length,
        rails: document.querySelectorAll('#playSection #evalBar').length,
        clocks: document.querySelectorAll('#topClockWhite,#topClockBlack').length,
        newGame: document.querySelectorAll('#navNewGameBtn').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        adapters: window.App.boardAdapter ? 1 : 0,
        shell: window.CaissaSimplifiedPlayShellInstance.getSnapshot()
    }));
    expect(resources).toMatchObject({ boards: 1, squares: 64, rails: 1, clocks: 2, newGame: 1, workers: 1, adapters: 1 });
    expect(resources.shell).toMatchObject({ active: true, qaOnly: true, mode: 'games', listenerCount: 1 });
});

test('activate, deactivate, Back, and Forward preserve state, orientation, controls, and identity', async ({ page }) => {
    await page.goto('/play');
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    await page.evaluate(() => window.flipBoard());
    const before = await snapshot(page);
    const identity = await page.evaluate(() => window.App.boardAdapter.getSnapshot().adapterId);
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/games?simplified=1'));
    await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.caissa-simplified-shell')).toBeHidden();
    await expect(page.locator('.main-content.cais-grid')).toBeVisible();
    await page.goForward();
    await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
    const after = await snapshot(page);
    expect(after.fen).toBe(before.fen);
    expect(after.history).toEqual(before.history);
    expect(after.isFlipped).toBe(true);
    expect(await page.evaluate(() => window.App.boardAdapter.getSnapshot().adapterId)).toBe(identity);
    expect(after.harness.boardConstructions).toBe(1);
    await expect(page.getByRole('button', { name: 'Start New Game' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('QA shell preserves move, New Game, flip, and Analyze handoff behavior', async ({ page }) => {
    await openShell(page);
    await startGame(page);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await page.evaluate(() => window.flipBoard());
    await expect(page.locator('#chessboard')).toHaveAttribute('data-orientation', 'black');
    await page.getByRole('button', { name: 'Start New Game' }).click();
    await expect(page.locator('#newGameModal')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await page.locator('[data-section="analyze"]').first().click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    expect(new URL(page.url()).searchParams.get('handoff')).toBeTruthy();
    await page.goBack();
    await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
});

const viewports = [
    [320, 568, 'mobile-stack'], [375, 667, 'mobile-stack'], [390, 844, 'mobile-stack'],
    [412, 915, 'mobile-stack'], [768, 1024, 'tablet-stack'], [1024, 768, 'tablet-stack'],
    [1366, 768, 'desktop-split'], [1440, 900, 'desktop-split'], [1920, 1080, 'desktop-split']
];

test('QA shell is bounded and reachable across all required viewports', async ({ page }) => {
    for (const [width, height, layout] of viewports) {
        await page.setViewportSize({ width, height });
        await openShell(page);
        const geometry = await page.evaluate(() => {
            const board = document.querySelector('#chessboard').getBoundingClientRect();
            const rail = document.querySelector('#evalBar').getBoundingClientRect();
            const context = document.querySelector('.caissa-simplified-shell__context').getBoundingClientRect();
            const footer = document.querySelector('.caissa-simplified-shell__footer').getBoundingClientRect();
            const modes = document.querySelector('.caissa-simplified-shell__modes').getBoundingClientRect();
            return {
                board: { width: board.width, height: board.height },
                overlap: !(rail.right <= board.left || rail.left >= board.right),
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                context: context.width > 0 && context.height > 0,
                footer: footer.width > 0 && footer.height > 0,
                modes: modes.width > 0 && modes.height > 0,
                layout: window.CaissaSimplifiedPlayShellInstance.getSnapshot().layoutMode
            };
        });
        expect(Math.abs(geometry.board.width - geometry.board.height), `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(geometry.board.width, `${width}x${height}`).toBeGreaterThan(180);
        expect(geometry.overlap, `${width}x${height}`).toBe(false);
        expect(geometry.overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(geometry.context && geometry.footer && geometry.modes).toBe(true);
        expect(geometry.layout).toBe(layout);
    }
});
