import { test, expect } from '@playwright/test';
import { instrumentPlay, monitorRuntime, openPlay, playMove, snapshot, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('blocking: cold deep link mounts one white-oriented primary board without runtime errors', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openPlay(page);
    const state = await snapshot(page);
    expect(state.harness.boardConstructions).toBe(1);
    expect(await page.locator('#playSection #chessboard .board-b72b1').count()).toBe(1);
    expect(await page.locator('#playSection #chessboard [class*="square-"]').count()).toBe(64);
    expect(state.fen).toContain(' w KQkq ');
    expect(state.isFlipped).toBe(false);
    runtime.assertClean();
});

test('blocking: canonical navigation, repeated entry, leave, and return preserve one board', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
    await page.locator('[data-section="play"]').first().click();
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toBeVisible();
    for (let cycle = 0; cycle < 3; cycle += 1) {
        await page.locator('[data-section="academy"]').first().click();
        await expect(page.locator('#academySection')).toHaveClass(/active/);
        await page.locator('[data-section="play"]').first().click();
        await expect(page.locator('#playSection')).toHaveClass(/active/);
    }
    expect((await snapshot(page)).harness.boardConstructions).toBe(1);
    expect(await page.locator('#playSection #chessboard .board-b72b1').count()).toBe(1);
});

test('blocking: canonical section navigation creates history and Back restores Classic', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-section="play"]').first().click();
    expect(new URL(page.url()).pathname).toBe('/play');
    await page.goBack();
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
});

test('blocking: legal move updates board state, history, and PGN; illegal move is rejected unchanged', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    let state = await snapshot(page);
    expect(state.history).toEqual(['e4']);
    expect(state.moveHistory).toEqual(['e4']);
    expect(state.pgn).toContain('1. e4');
    const before = state.fen;
    expect(await playMove(page, 'e7', 'e4')).toBe(false);
    state = await snapshot(page);
    expect(state.fen).toBe(before);
    expect(state.history).toEqual(['e4']);
});

test('tap-to-move marks destinations, clears selection, and accepts a legal move on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlay(page);
    await startGame(page);
    await page.evaluate(() => window.handleMobileBoardTap({
        target: document.querySelector('#playSection #chessboard .square-e2'),
        preventDefault() {}
    }));
    await expect(page.locator('#playSection #chessboard .square-e2')).toHaveClass(/mobile-tap-source/);
    await expect(page.locator('#playSection #chessboard .square-e4')).toHaveClass(/mobile-tap-target/);
    await page.evaluate(() => window.handleMobileBoardTap({
        target: document.querySelector('#playSection #chessboard .square-e4'),
        preventDefault() {}
    }));
    expect((await snapshot(page)).history).toEqual(['e4']);
    expect(await page.locator('#playSection #chessboard .mobile-tap-source').count()).toBe(0);
});

test('drag callback contract accepts a legal move and snapbacks an illegal move', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    const result = await page.evaluate(() => ({
        canDrag: window.onDragStart('e2', 'wP'),
        legal: window.onDrop('e2', 'e4'),
        illegal: window.onDrop('e7', 'e4')
    }));
    expect(result.canDrag).toBe(true);
    expect(result.legal).toBeUndefined();
    expect(result.illegal).toBe('snapback');
});
