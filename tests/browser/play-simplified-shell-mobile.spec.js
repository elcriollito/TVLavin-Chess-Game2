import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import {
    instrumentPlay, loadPosition, playMove, snapshot, startGame
} from '../play/playwright-helpers.js';

const viewports = [
    [320, 568, 'phone-compact'], [360, 640, 'phone-standard'],
    [375, 667, 'phone-standard'], [390, 844, 'phone-standard'],
    [393, 852, 'phone-standard'], [412, 915, 'phone-standard'],
    [430, 932, 'phone-standard'], [540, 720, 'phone-standard'],
    [768, 1024, 'tablet-portrait-stacked'], [820, 1180, 'tablet-portrait-stacked'],
    [1024, 768, 'tablet-landscape-split']
];

test.beforeEach(async ({ page }) => instrumentPlay(page));

async function openShell(page, width, height) {
    await page.setViewportSize({ width, height });
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().geometry?.width)).toBe(width);
}

test('required phone and tablet geometry is bounded, board-first, and reachable', async ({ page }) => {
    await openShell(page, 320, 568);
    for (const [width, height, layout] of viewports) {
        await page.setViewportSize({ width, height });
        await expect.poll(() => page.evaluate(() =>
            window.CaissaSimplifiedPlayShellInstance.getSnapshot().geometry?.width)).toBe(width);
        const geometry = await page.evaluate(() => {
            const box = selector => document.querySelector(selector).getBoundingClientRect();
            const board = box('#chessboard');
            const rail = box('#evalBar');
            const play = document.querySelector('#playSection');
            const footer = document.querySelector('.caissa-simplified-shell__footer');
            const context = document.querySelector('.caissa-simplified-shell__context');
            const modes = document.querySelector('.caissa-simplified-shell__modes');
            const boardBeforeModes = board.top < modes.getBoundingClientRect().top;
            footer.scrollIntoView({ block: 'center' });
            return {
                board: { width: board.width, height: board.height },
                rail: { width: rail.width, height: rail.height },
                overlap: !(rail.right <= board.left || rail.left >= board.right),
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                footerReachable: footer.getBoundingClientRect().bottom <= innerHeight,
                playScrollable: play.scrollHeight > play.clientHeight,
                contextNestedScroll: context.scrollHeight > context.clientHeight,
                boardBeforeModes,
                snapshot: window.CaissaSimplifiedPlayShellInstance.getSnapshot()
            };
        });
        expect(geometry.snapshot.layoutMode, `${width}x${height}`).toBe(layout);
        expect(Math.abs(geometry.board.width - geometry.board.height), `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(geometry.board.width, `${width}x${height}`).toBeGreaterThanOrEqual(width === 320 ? 288 : 300);
        expect(geometry.rail.width, `${width}x${height}`).toBe(geometry.snapshot.geometry.railWidth);
        expect(Math.abs(geometry.rail.height - geometry.board.height), `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(geometry.overlap, `${width}x${height}`).toBe(false);
        expect(geometry.overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(geometry.footerReachable, `${width}x${height}`).toBe(true);
        if (layout.includes('phone') || layout.includes('portrait')) {
            expect(geometry.playScrollable, `${width}x${height}`).toBe(true);
            expect(geometry.contextNestedScroll, `${width}x${height}`).toBe(false);
            expect(geometry.boardBeforeModes, `${width}x${height}`).toBe(true);
            expect(geometry.snapshot.scrollOwner).toBe('document');
        } else {
            expect(geometry.snapshot.scrollOwner).toBe('panel');
        }
    }
});

test('portrait landscape portrait preserves game identity and requests one resize per stable geometry', async ({ page }) => {
    await openShell(page, 390, 844);
    await startGame(page);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(1);
    const before = await snapshot(page);
    const adapterId = await page.evaluate(() => window.App.boardAdapter.getSnapshot().adapterId);
    const resizeBefore = await page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().diagnostics.boardResizeRequests);

    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().layoutMode)).toBe('phone-landscape');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().layoutMode)).toBe('phone-standard');

    const after = await snapshot(page);
    const shell = await page.evaluate(() => window.CaissaSimplifiedPlayShellInstance.getSnapshot());
    expect(after.fen).toBe(before.fen);
    expect(after.history).toEqual(before.history);
    expect(await page.evaluate(() => window.App.boardAdapter.getSnapshot().adapterId)).toBe(adapterId);
    expect(shell.diagnostics.boardResizeRequests - resizeBefore).toBe(2);
    expect(after.harness.boardConstructions).toBe(1);
    expect(after.harness.workersCreated).toBe(1);
});

test('drawer, promotion, New Game, Settings, Help, and Back coexist with the shell', async ({ page }) => {
    await openShell(page, 390, 844);
    const toggle = page.locator('#mobileNavToggle');
    await toggle.click();
    await expect(page.locator('.app-container')).toHaveClass(/nav-open/);
    await expect(page.locator('.main-navigation')).toHaveCSS('z-index', '1001');
    await toggle.click();
    await expect(page.locator('.app-container')).not.toHaveClass(/nav-open/);
    await expect(toggle).toBeFocused();

    await startGame(page);
    expect(await loadPosition(page, positions.whitePromotion.fen)).toBe(true);
    expect(await playMove(page, positions.whitePromotion.from, positions.whitePromotion.to)).toBe(true);
    await expect(page.locator('#promotionModal')).toHaveClass(/show/);
    await page.evaluate(() => window.handlePromotion('q'));

    await page.getByRole('button', { name: 'Start New Game' }).click();
    await expect(page.locator('#newGameModal')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await page.locator('#btnSettings').click();
    await expect(page.locator('#menuModal')).toHaveClass(/show/);
    await page.keyboard.press('Escape');

    await toggle.click();
    await expect(page.locator('.app-container')).toHaveClass(/nav-open/);
    await page.getByRole('link', { name: 'Help' }).click();
    await expect(page.locator('.caissa-simplified-shell')).toBeHidden();
    await page.goBack();
    await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
    expect(await page.locator('#chessboard').count()).toBe(1);
});

for (const [name, width, height] of [
    ['compact phone', 320, 568], ['standard phone', 390, 844],
    ['tablet portrait', 768, 1024], ['tablet landscape', 1024, 768]
]) {
    test(`${name} accepts one legal move and one deterministic engine response`, async ({ page }) => {
        await openShell(page, width, height);
        await startGame(page, { mode: 'engine' });
        expect(await playMove(page, 'e2', 'e4')).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
        const resources = await page.evaluate(() => ({
            boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
            rails: document.querySelectorAll('#playSection #evalBar').length,
            clocks: document.querySelectorAll('#topClockWhite,#topClockBlack').length,
            harness: window.__caissaPlayHarness.snapshot()
        }));
        expect(resources).toMatchObject({ boards: 1, rails: 1, clocks: 2 });
        expect(resources.harness.workersCreated).toBe(1);
        expect(resources.harness.boardConstructions).toBe(1);
    });
}

// Physical-device follow-up: iPhone Safari dynamic address bar and landscape,
// Android Chrome with keyboard open, iPad portrait/landscape, notch/home
// indicator, pinch zoom, reduced motion, and larger text/browser zoom.
