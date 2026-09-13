import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay, playMove, snapshot, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('projection owns one persistent Play renderer and exposes an immutable presentation snapshot', async ({ page }) => {
    await openPlay(page);
    const state = await page.evaluate(() => ({
        api: window.CaissaChessboardAdapter.schemaVersion,
        snapshot: window.App.boardAdapter.getSnapshot(),
        diagnostics: window.App.boardAdapter.inspect(),
        boards: window.__caissaPlayHarness.snapshot().boardConstructions
    }));
    expect(state.api).toBe('2.0.0');
    expect(state.snapshot).toMatchObject({
        mounted: true, disposed: false, containerId: 'chessboard',
        orientation: 'white', draggable: true, renderer: 'CaissaPersistentRenderer',
        dragPolicy: 'mouse'
    });
    expect(state.diagnostics.mounts).toBe(1);
    expect(state.boards).toBe(0);
    await expect(page.locator('#playSection #chessboard .caissa-board')).toHaveCount(1);
});

test('board has truthful focus, role, name, orientation and disabled semantics', async ({ page }) => {
    await openPlay(page);
    const board = page.locator('#playSection #chessboard .caissa-board');
    await expect(board).toHaveAttribute('role', 'grid');
    await expect(board).toHaveAttribute('aria-label', 'Play chessboard');
    await expect(board).toHaveAttribute('tabindex', '0');
    await expect(board).toHaveAttribute('data-orientation', 'white');
    await expect(board).toHaveAttribute('aria-disabled', 'true');
    await startGame(page);
    await expect(board).toHaveAttribute('aria-disabled', 'false');
    await board.focus();
    await expect(board).toBeFocused();
});

test('legal and illegal legacy moves render through the adapter without duplicate state', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    const before = await page.evaluate(() => window.App.boardAdapter.getSnapshot().renderSequence);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    const afterLegal = await page.evaluate(() => window.App.boardAdapter.getSnapshot().renderSequence);
    expect(afterLegal).toBeGreaterThanOrEqual(before + 1);
    const fen = (await snapshot(page)).fen;
    expect(await playMove(page, 'e7', 'e4')).toBe(false);
    expect((await snapshot(page)).fen).toBe(fen);
    expect(await page.evaluate(() => window.App.boardAdapter.getSnapshot().renderSequence)).toBe(afterLegal);
});

test('orientation changes preserve position and repeated section entry preserves one adapter', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const before = await snapshot(page);
    const adapterId = await page.evaluate(() => window.App.boardAdapter.getSnapshot().adapterId);
    await page.evaluate(() => window.flipBoard());
    expect((await snapshot(page)).fen).toBe(before.fen);
    await expect(page.locator('#playSection #chessboard .caissa-board')).toHaveAttribute('data-orientation', 'black');
    await page.evaluate(() => window.CaissaNavigation.navigateToSection('academy'));
    await page.evaluate(() => window.CaissaNavigation.navigateToSection('play'));
    expect(await page.evaluate(() => window.App.boardAdapter.getSnapshot().adapterId)).toBe(adapterId);
    expect((await snapshot(page)).harness.boardConstructions).toBe(0);
    await expect(page.locator('#playSection #chessboard .caissa-board')).toHaveCount(1);
});

test('lazy Analyze resources do not replace the persistent Play projection', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    const id = await page.evaluate(() => window.App.boardAdapter.getSnapshot().adapterId);
    await page.evaluate(() => window.CaissaPlayLazyLoader.load('analyze-deep'));
    await expect.poll(() => page.evaluate(() => typeof window.AnalyzeSection?.onEnter)).toBe('function');
    expect(await page.evaluate(() => window.App.boardAdapter.getSnapshot().adapterId)).toBe(id);
    await expect(page.locator('#playSection #chessboard .caissa-board')).toHaveCount(1);
});
