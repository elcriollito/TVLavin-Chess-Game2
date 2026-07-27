import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay, playMove, snapshot, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
});

test('blocking: Analyze transition exposes current shared-global mutation behavior', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const playFen = (await snapshot(page)).fen;
    await page.locator('[data-section="analyze"]').first().click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.App.gameMode)).toBe('analysis');
    const analyzeFen = await page.evaluate(() => window.App.game.fen());
    expect(analyzeFen).not.toBe(playFen);
    await page.evaluate(() => window.CaissaNavigation.navigateToSection('play'));
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    expect((await snapshot(page)).fen).toBe(analyzeFen);
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

test('accessibility characterization: primary controls are named and keyboard reachable', async ({ page }) => {
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
    expect(boardSemantics).toEqual({ role: null, label: null, tabIndex: null });
});

test('repeated entry does not increase observable event-listener registrations', async ({ page }) => {
    await openPlay(page);
    const before = (await snapshot(page)).harness.listenerRegistrations;
    await page.locator('[data-section="academy"]').first().click();
    await page.locator('[data-section="play"]').first().click();
    const after = (await snapshot(page)).harness.listenerRegistrations;
    expect(after).toEqual(before);
});

test.skip('modal focus trap and visible-focus styling — no reliable legacy focus-trap contract', async () => {});
