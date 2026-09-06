import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

const ARTIFACT_DIR = 'artifacts/play-game-v1-new-game-reset-hotfix';

test.beforeEach(async ({ page }) => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await instrumentPlay(page, { autoReply: false });
});

async function openSummary(page) {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await page.evaluate(() => window.__caissaPlayHarness.configure({ autoReply: true,
        resetSearchSequence: true, scores: [30, 40, 110, 190, -190],
        bestMoves: ['e7e5', 'b8c6', 'g8f6', 'f8b4'] }));
    for (let turn = 0; turn < 3; turn += 1) {
        const count = await page.evaluate(() => window.App.game.history().length);
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(count + 2);
    }
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-games-panel[data-games-phase="game-over"]')).toBeVisible();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('.caissa-games-analysis__review')).toBeEnabled({ timeout: 25_000 });
}

async function enterGuidedReview(page) {
    await page.locator('.caissa-games-analysis__review').click();
    await expect(page.locator('.caissa-games-panel')).toHaveAttribute('data-games-phase', 'guided-review');
    await expect(page.locator('[data-bots-guided-review]')).toBeVisible();
}

async function assertCleanSetup(page, screenshot) {
    const panel = page.locator('.caissa-games-panel');
    await expect(panel).toHaveAttribute('data-games-phase', 'setup');
    await expect(panel.locator('.caissa-games-panel__title')).toHaveText('Welcome to Play');
    await expect(panel.locator('[data-games-setup-content]')).toBeVisible();
    await expect(panel.locator('[data-games-time]')).toHaveCount(7);
    await expect(panel.locator('[data-games-color]')).toHaveCount(3);
    await expect(panel.locator('[data-games-strength]')).toBeVisible();
    await expect(panel.locator('[data-games-primary]')).toBeVisible();
    await expect(panel.locator('[data-games-primary]')).toHaveText('Play');
    await expect(page.locator('[data-bots-guided-review], [data-bots-analysis-exploration], .caissa-games-analysis')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/GAME MOVES \(STUDY\)/i);
    await expect(page.locator('body')).not.toContainText(/ANALYSIS VARIATION/i);
    const state = await page.evaluate(() => ({
        inlineOpen: window.CaissaPlayV2InlineAnalyze.isOpen(),
        summaryMounted: window.CaissaGamesAnalysisSummaryPresentation.getSnapshot().mounted,
        guidedMounted: window.CaissaGamesGuidedReviewPresentation.getSnapshot().mounted,
        explorationActive: window.CaissaBotsAnalysisExploration.isActive(),
        gamesPhase: window.CaissaGamesPanelInstance.getSnapshot().phase,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(state).toEqual({ inlineOpen: false, summaryMounted: false, guidedMounted: false,
        explorationActive: false, gamesPhase: 'setup', horizontalOverflow: 0 });
    if (screenshot) await page.screenshot({ path: `${ARTIFACT_DIR}/${screenshot}`, fullPage: true });
}

test('Analysis Summary New Game returns to one clean Setup', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openSummary(page);
    await page.locator('.caissa-games-analysis__new-game').click();
    await assertCleanSetup(page, 'new-game-reset-desktop-1600x1000.png');
});

test('Guided Review New Game returns to the same clean Setup', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openSummary(page);
    await enterGuidedReview(page);
    await page.locator('.caissa-bots-guided__new-game').click();
    await assertCleanSetup(page);
});

test('Study New Game destroys its temporary owner and stale presentation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSummary(page);
    await enterGuidedReview(page);
    await page.locator('.caissa-bots-guided__analysis').click();
    await expect(page.locator('.caissa-games-panel')).toHaveAttribute('data-games-phase', 'analysis-exploration');
    await page.evaluate(() => window.CaissaBotsAnalysisExploration.goToSource(0));
    await page.locator('#chessboard .square-e2').click();
    await page.locator('#chessboard .square-e4').click();
    await expect.poll(() => page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().temporaryPlyCount)).toBe(1);
    await page.evaluate(() => document.querySelector('.caissa-bots-guided__new-game').click());
    await assertCleanSetup(page, 'new-game-reset-mobile-390x844.png');
});
