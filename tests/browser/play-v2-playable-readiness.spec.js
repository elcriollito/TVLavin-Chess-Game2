import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('authorized Games entry becomes ready only with every passive local probe', async ({ page }) => {
    await page.goto('/play/beta/games');
    await expect(page.locator('[data-games-primary]')).toBeEnabled();
    const proof = await page.evaluate(() => ({
        contract: window.CaissaPlayV2PlayableReadiness.contractId,
        classifications: window.CaissaPlayV2PlayableReadiness.classifications,
        readiness: window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.playableReadiness,
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        gameActive: window.App.gameActive,
        clockRunning: window.CaissaClockService.getSnapshot().running,
        records: window.CaissaGameRecordPersistence.listCompleted().value.length
    }));
    expect(proof.contract).toBe('PlayV2PlayableReadiness@1.0.0');
    expect(proof.classifications).toEqual({ games: 'required', bots: 'uncertified', coach: 'blocked', mentor: 'blocked', players: 'blocked' });
    expect(proof.readiness.state).toBe('ready'); expect(proof.readiness.result.failed).toEqual([]);
    expect(proof).toMatchObject({ boards: 1, gameActive: false, clockRunning: false, records: 0 });
});

test('missing clock disables Play, reaches one bounded error, and recovers without fallback', async ({ page }) => {
    await page.goto('/play/beta/games');
    await page.evaluate(() => {
        window.__clockOwner = window.CaissaClockService; window.CaissaClockService = null;
        window.CaissaSimplifiedPlayShellInstance.getGamesPanel?.();
        document.querySelector('[data-games-color="black"]').click();
    });
    await expect(page.locator('[data-games-primary]')).toBeDisabled();
    await expect(page.getByText('Preparing the local game...', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled({ timeout: 3000 });
    expect(await page.evaluate(() => ({ active: window.App.gameActive,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        fallback: window.CaissaPlayV2PlayableReadiness.classifications }))).toMatchObject({ active: false, workers: 1 });
    await page.evaluate(() => { window.CaissaClockService = window.__clockOwner; delete window.__clockOwner; });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});

test('refresh, back-forward, and route exit rebuild readiness without stale playing state', async ({ page }) => {
    await page.goto('/play/beta/games'); await expect(page.locator('[data-games-primary]')).toBeEnabled();
    await page.reload(); await expect(page.locator('[data-games-primary]')).toBeEnabled();
    await page.goto('/play/beta/bots'); await page.goBack();
    await expect(page).toHaveURL(/\/play\/beta\/games$/); await expect(page.locator('[data-games-primary]')).toBeEnabled();
    const state = await page.evaluate(() => window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.playableReadiness.state);
    expect(state).toBe('ready');
});
