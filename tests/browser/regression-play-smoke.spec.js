import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';
import { positions } from '../play/fixtures/positions.js';

test('compact final regression smoke crosses every critical Play handoff', async ({ page, browserName }) => {
    await instrumentPlay(page, { autoReply: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.locator('[data-games-primary]').click();

    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeEnabled();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    expect(new URL(page.url()).searchParams.get('handoff')).toBeTruthy();
    await page.goBack();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await page.locator('[data-post-game-action="mentor-review"]').click();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaPostGameExperienceInstance.getSnapshot().mentor.request?.requestId)).toBeTruthy();

    await page.evaluate(() => window.newGame({ mode: 'analysis', color: 'white', timeControl: 0 }));

    for (const mode of ['bots', 'coach', 'players']) {
        await page.evaluate(value => window.CaissaPlayRouteController.navigate(`/play/${value}?simplified=1`), mode);
        await expect(page.locator(`[data-shell-mode="${mode}"]`)).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('.caissa-simplified-shell__context')).toBeVisible();
    }
    await expect(page.locator('[data-players-panel]')).toContainText('unavailable');

    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/games?simplified=1'));
    await loadPosition(page, positions.whitePromotion.fen);
    await playMove(page, positions.whitePromotion.from, positions.whitePromotion.to);
    await expect(page.locator('#promotionModal')).toHaveClass(/show/);
    await page.evaluate(() => window.handlePromotion('q'));
    await page.evaluate(() => window.CaissaPlayThemes.applyTheme('caissa-light'));

    const proof = await page.evaluate(() => ({
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        liveRegions: document.querySelectorAll('.caissa-simplified-shell [aria-live]').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        theme: document.body.dataset.caissaPlayTheme,
        humanGames: window.CaissaHumanPlayInfrastructure.getSnapshot().diagnostics.humanGamesStarted
    }));
    expect(proof).toMatchObject({ boards: 1, workers: 1, liveRegions: 2, theme: 'caissa-light', humanGames: 0 });
    expect(proof.overflow, browserName).toBeLessThanOrEqual(2);
    const axe = await new AxeBuilder({ page }).include('.caissa-simplified-shell').analyze();
    expect(axe.violations).toEqual([]);
});
