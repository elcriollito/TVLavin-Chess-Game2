import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove, snapshot, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('portrait-landscape-reflow transition preserves game, board, focus, panel, and resources', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/games?simplified=1');
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const primary = page.locator('[data-games-primary]');
    await primary.focus();
    const before = await snapshot(page);
    const identity = await page.evaluate(() => ({
        board: window.App.boardAdapter.getSnapshot().adapterId,
        listeners: window.CaissaEventLifecycle.inspect().activeListeners,
        lifecycle: window.CaissaGameLifecycle.getSnapshot().sessionId
    }));

    for (const viewport of [{ width: 844, height: 390 }, { width: 640, height: 720 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await expect.poll(() => page.evaluate(() =>
            window.CaissaSimplifiedPlayShellInstance.getSnapshot().geometry.width)).toBe(viewport.width);
    }

    const after = await snapshot(page);
    const proof = await page.evaluate(() => ({
        board: window.App.boardAdapter.getSnapshot().adapterId,
        listeners: window.CaissaEventLifecycle.inspect().activeListeners,
        lifecycle: window.CaissaGameLifecycle.getSnapshot().sessionId,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        liveRegions: document.querySelectorAll('.caissa-simplified-shell [aria-live]').length,
        mode: window.CaissaSimplifiedPlayShellInstance.getSnapshot().mode
    }));
    expect(after.fen).toBe(before.fen);
    expect(after.history).toEqual(before.history);
    expect(after.whiteTimeMs).toBe(before.whiteTimeMs);
    expect(after.blackTimeMs).toBe(before.blackTimeMs);
    expect(proof).toMatchObject({ ...identity, workers: 1, boards: 1, liveRegions: 2, mode: 'games' });
    await expect(primary).toBeFocused();
});
