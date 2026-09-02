import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const viewports = [
    [320, 568, true], [360, 640, true], [390, 844, true],
    [768, 1024, true], [1024, 768, false], [1440, 900, false]
];

test.beforeEach(async ({ page }) => instrumentPlay(page));
test.use({ hasTouch: true });

async function openBeta(page, width, height, path = '/play/beta') {
    await page.setViewportSize({ width, height });
    await page.goto(path);
    await expect(page.locator('[data-entry-experience="beta"]')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
}

test('current beta owns phone, tablet and desktop geometry without overflow', async ({ page }) => {
    for (const [width, height, stacked] of viewports) {
        await openBeta(page, width, height);
        const geometry = await page.evaluate(() => {
            const box = selector => document.querySelector(selector).getBoundingClientRect();
            const board = box('#chessboard');
            const panel = box('.caissa-simplified-shell__context');
            const action = box('[data-games-primary]');
            const css = [...document.styleSheets].flatMap(sheet => {
                try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; }
            }).join('\n');
            return {
                board, panel, action,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                safeTop: /safe-area-inset-top/.test(css),
                safeBottom: /safe-area-inset-bottom/.test(css)
            };
        });
        expect(Math.abs(geometry.board.width - geometry.board.height), `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(geometry.board.width, `${width}x${height}`).toBeGreaterThanOrEqual(width === 320 ? 272 : 300);
        expect(geometry.overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(geometry.action.width, `${width}x${height}`).toBeGreaterThanOrEqual(44);
        expect(geometry.safeTop).toBe(true);
        expect(geometry.safeBottom).toBe(true);
        if (stacked) expect(geometry.panel.top, `${width}x${height}`).toBeGreaterThan(geometry.board.top);
        else expect(geometry.panel.left, `${width}x${height}`).toBeGreaterThan(geometry.board.left);
    }
});

test('rotation-equivalent resize preserves one board and one accepted Games lifecycle', async ({ page }) => {
    await openBeta(page, 390, 844);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.diagnostics.successfulStarts)).toBe(1);
    const before = await page.evaluate(() => ({
        fen: window.App.game.fen(),
        boards: document.querySelectorAll('#chessboard .board-b72b1').length,
        lifecycle: window.CaissaGameLifecycle.getSnapshot().sessionId
    }));
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => page.evaluate(() => document.documentElement.clientWidth)).toBe(844);
    await page.setViewportSize({ width: 390, height: 844 });
    const after = await page.evaluate(() => ({
        fen: window.App.game.fen(),
        boards: document.querySelectorAll('#chessboard .board-b72b1').length,
        lifecycle: window.CaissaGameLifecycle.getSnapshot().sessionId,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(after).toEqual({ ...before, overflow: 0 });
});

test('touch Play activation creates one accepted start and one clock owner', async ({ page }) => {
    await openBeta(page, 390, 844);
    const before = await page.evaluate(() => window.CaissaGameLifecycle.inspect().counters.sessions);
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.diagnostics.successfulStarts)).toBe(1);
    expect(await page.evaluate(() => ({
        starts: window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.diagnostics.successfulStarts,
        lifecycleSessions: window.CaissaGameLifecycle.inspect().counters.sessions,
        clockRunning: window.CaissaClockService.getSnapshot().running,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        boards: document.querySelectorAll('#chessboard .board-b72b1').length
    }))).toMatchObject({ starts: 1, lifecycleSessions: before + 1, clockRunning: true, boards: 1 });
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBeLessThanOrEqual(1);
});

test('current mode, focus, promotion, PostGame and Mentor surfaces remain mobile-safe', async ({ page }) => {
    await openBeta(page, 390, 844);
    await expect(page.getByRole('tab')).toHaveText(['Play Game', 'Play Bots', 'Play Coach']);
    await expect(page.getByRole('tab', { name: /Players/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Play Coach' }).click();
    await expect(page.getByText('Play Coach')).toBeVisible();
    await page.getByRole('tab', { name: 'Play Game' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('#chessboard')).toBeFocused();
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('[data-post-game-result]')).toBeVisible();
    await expect(page.locator('html')).not.toHaveCSS('overflow-x', 'scroll');
    await page.locator('[data-post-game-action="mentor-review"]').click();
    await expect(page.locator('[data-native-mentor-review]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('Bots Worker is lazy, singular, and torn down on route exit', async ({ page }) => {
    await openBeta(page, 390, 844, '/play/beta/bots');
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(0);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(1);
    await page.getByRole('tab', { name: 'Play Coach' }).click();
    await expect(page).toHaveURL(/\/play\/beta\/coach$/);
    await expect.poll(() => page.evaluate(() => window.CaissaWorkerLifecycle?.inspect?.().activeWorkers || 0)).toBe(0);
});

test('forced colors, reduced motion and 200 percent reflow preserve touch access', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await openBeta(page, 640, 900);
    await page.addStyleTag({ content: 'html { zoom: 2; }' });
    const proof = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        targets: [...document.querySelectorAll('[data-entry-experience="beta"] button, [data-entry-experience="beta"] label')]
            .filter(node => node.getClientRects().length).every(node => node.getBoundingClientRect().width >= 44),
        forced: matchMedia('(forced-colors: active)').matches,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
    }));
    expect(proof).toEqual({ overflow: 0, targets: true, forced: true, reduced: true });
});
