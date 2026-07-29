import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay, playMove, snapshot, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
});

test('blocking: Analyze transition preserves Play while Analyze owns independent state', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const before = await snapshot(page);
    await page.evaluate(() => { window.__playGameIdentity = window.App.game; });
    await page.locator('[data-section="analyze"]').first().click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.getGame()?.fen())).toBe(before.fen);
    await page.evaluate(() => window.AnalyzeSection.jumpToMove(-1));
    const isolated = await page.evaluate(() => ({
        samePlayGame: window.App.game === window.__playGameIdentity,
        playFen: window.App.game.fen(),
        analyzeFen: window.AnalyzeSection.getGame().fen(),
        playBoardInPlay: !!document.querySelector('#playSection #chessboard'),
        analyzeBoard: !!window.AnalyzeSection.board,
        boards: window.__caissaPlayHarness.snapshot().boardConstructions,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }));
    expect(isolated).toMatchObject({
        samePlayGame: true, playFen: before.fen, playBoardInPlay: true, analyzeBoard: true,
        boards: 2, workers: 1
    });
    expect(isolated.analyzeFen).not.toBe(before.fen);
    await page.goBack();
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    const after = await snapshot(page);
    expect(after.fen).toBe(before.fen);
    expect(after.history).toEqual(before.history);
});

test('blocking: repeated Play cycles retain one board and one worker without duplicate moves', async ({ page }) => {
    await openPlay(page);
    for (let cycle = 0; cycle < 3; cycle += 1) {
        await startGame(page);
        await playMove(page, 'e2', 'e4');
        await page.locator('[data-section="academy"]').first().click();
        await page.locator('[data-section="play"]').first().click();
        await expect(page.locator('#playSection')).toHaveClass(/active/);
    }
    const state = await snapshot(page);
    expect(state.harness.boardConstructions).toBe(1);
    expect(state.harness.workersCreated).toBe(1);
    expect(state.history).toEqual(['e4']);
});

test('accessibility foundation: controls and Play board are named and keyboard focusable', async ({ page }) => {
    await openPlay(page);
    for (const name of ['Start New Game', 'Resign', 'Undo', 'Hint', 'Download', 'Settings']) {
        await expect(page.getByRole('button', { name, exact: true }).first()).toBeAttached();
    }
    await page.getByRole('button', { name: 'Start New Game', exact: true }).first().focus();
    await expect(page.getByRole('button', { name: 'Start New Game', exact: true }).first()).toBeFocused();
    const boardSemantics = await page.locator('#playSection #chessboard').evaluate(element => ({
        role: element.getAttribute('role'),
        label: element.getAttribute('aria-label'),
        tabIndex: element.getAttribute('tabindex')
    }));
    expect(boardSemantics).toEqual({ role: 'application', label: 'Play chessboard', tabIndex: '0' });
    await page.locator('#playSection #chessboard').focus();
    await expect(page.locator('#playSection #chessboard')).toBeFocused();
});

test.skip('square-by-square keyboard chess play — adapter currently provides board-level focus only', async () => {});

test('repeated entry does not increase observable event-listener registrations', async ({ page }) => {
    await openPlay(page);
    let before = (await snapshot(page)).harness.listenerRegistrations;
    let stableSamples = 0;
    for (let attempt = 0; attempt < 40 && stableSamples < 4; attempt += 1) {
        await page.waitForTimeout(50);
        const current = (await snapshot(page)).harness.listenerRegistrations;
        if (JSON.stringify(current) === JSON.stringify(before)) stableSamples += 1;
        else stableSamples = 0;
        before = current;
    }
    await page.locator('[data-section="academy"]').first().click();
    await page.locator('[data-section="play"]').first().click();
    const after = (await snapshot(page)).harness.listenerRegistrations;
    expect(after).toEqual(before);
});

test.skip('modal focus trap and visible-focus styling — no reliable legacy focus-trap contract', async () => {});

test('Analyze refresh replays the bounded session handoff without exposing raw game data', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const expectedFen = (await snapshot(page)).fen;
    await page.locator('[data-section="analyze"]').first().click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.getGame()?.fen())).toBe(expectedFen);
    const transport = await page.evaluate(() => ({
        keys: Object.keys(sessionStorage),
        token: sessionStorage.getItem('caissa:analyze:active:v1'),
        url: location.href
    }));
    expect(transport.token).toMatch(/^[A-Za-z0-9_-]{12,120}$/);
    expect(transport.keys.filter(key => key.startsWith('caissa:analyze:handoff:v1:')).length).toBe(1);
    const analyzeUrl = new URL(transport.url);
    expect([...analyzeUrl.searchParams.keys()].sort()).toEqual(['handoff', 'section']);
    expect(analyzeUrl.searchParams.has('fen')).toBe(false);
    expect(analyzeUrl.searchParams.has('pgn')).toBe(false);
    await page.reload();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.getGame()?.fen())).toBe(expectedFen);
});

test('corrupt handoff fails safely without changing Play', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const before = await snapshot(page);
    await page.evaluate(() => {
        sessionStorage.setItem('caissa:analyze:active:v1', 'corrupt_token_12');
        sessionStorage.setItem('caissa:analyze:handoff:v1:corrupt_token_12', '{');
        window.CaissaNavigation.navigateToSection('academy');
        window.CaissaNavigation.navigateToSection('analyze');
    });
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await page.evaluate(() => window.CaissaNavigation.navigateToSection('play'));
    expect((await snapshot(page)).fen).toBe(before.fen);
});
