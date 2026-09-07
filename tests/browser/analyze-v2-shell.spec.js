import { test, expect } from '@playwright/test';

const desktopProfiles = [
    { name: 'visual-review-1600x1000', width: 1600, height: 1000 },
    { name: 'visual-review-1366x768', width: 1366, height: 768 }
];

for (const profile of desktopProfiles) {
    test(`A1 renders a clean two-region desktop shell at ${profile.name}`, async ({ page }) => {
        await page.setViewportSize({ width: profile.width, height: profile.height });
        await page.goto('/analyze');

        const shell = page.locator('[data-caissa-analyze-v2]');
        const stage = shell.locator('.caissa-analyze-v2__stage');
        const workspace = shell.locator('.caissa-analyze-v2__workspace');
        const board = shell.locator('#analyzeChessboard .board-b72b1');
        await expect(shell).toBeVisible();
        await expect(stage).toBeVisible();
        await expect(workspace).toBeVisible();
        await expect(board).toBeVisible();
        await expect(shell.locator('#analyzeChessboard .board-b72b1')).toHaveCount(1);

        const geometry = await page.evaluate(() => {
            const rect = (selector) => {
                const box = document.querySelector(selector).getBoundingClientRect();
                return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
            };
            return {
                stage: rect('.caissa-analyze-v2__stage'),
                workspace: rect('.caissa-analyze-v2__workspace'),
                board: rect('#analyzeChessboard'),
                innerBoard: rect('#analyzeChessboard .board-b72b1'),
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
        });
        expect(geometry.stage.right).toBeLessThanOrEqual(geometry.workspace.left);
        expect(geometry.board.width).toBeGreaterThan(geometry.workspace.width);
        expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThanOrEqual(2);
        expect(Math.abs(geometry.innerBoard.width - geometry.board.width)).toBeLessThanOrEqual(2);
        expect(Math.abs(geometry.innerBoard.height - geometry.board.height)).toBeLessThanOrEqual(2);
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        await expect(shell.locator('.caissa-analyze-v2__footer')).toBeVisible();
        await expect(shell.locator('.analyze-board-navigation button')).toHaveCount(4);
    });
}

test('A1 tabs switch presentation panels without replacing Analyze owners', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/analyze');
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();

    await page.evaluate(() => {
        window.__a1Owners = {
            analyze: window.AnalyzeSection,
            sessionApi: window.CaissaAnalyzeSession,
            board: window.AnalyzeSection?.board,
            game: window.AnalyzeSection?.loadedGame?.game,
            engine: window.AnalyzeSection?.analysisEngine
        };
    });

    await page.getByRole('tab', { name: 'Games' }).click();
    await expect(page.locator('#analyzeV2PanelGames')).toBeVisible();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();

    await page.getByRole('tab', { name: 'Setup Position' }).click();
    await expect(page.locator('#analyzeV2PanelSetup')).toBeVisible();
    await expect(page.locator('#analyzeV2PanelSetup')).toContainText('without introducing a second FEN owner');

    await page.getByRole('tab', { name: 'Analysis' }).click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    const ownersPreserved = await page.evaluate(() => ({
        analyze: window.AnalyzeSection === window.__a1Owners.analyze,
        sessionApi: window.CaissaAnalyzeSession === window.__a1Owners.sessionApi,
        board: window.AnalyzeSection?.board === window.__a1Owners.board,
        game: window.AnalyzeSection?.loadedGame?.game === window.__a1Owners.game,
        engine: window.AnalyzeSection?.analysisEngine === window.__a1Owners.engine
    }));
    expect(ownersPreserved).toEqual({ analyze: true, sessionApi: true, board: true, game: true, engine: true });
});

test('A1 keeps the existing PGN session and review cursor pipeline authoritative', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/analyze');
    await page.getByRole('tab', { name: 'Games' }).click();
    await page.locator('.analyze-tab[data-source="pgn"]').click();
    await page.locator('#analyzePgnInput').fill([
        '[Event "A1 owner check"]',
        '[White "Alexander"]',
        '[Black "CAISSA"]',
        '[Result "*"]',
        '',
        '1. e4 e5 *'
    ].join('\n'));
    await page.locator('#analyzeLoadPgnBtn').click();
    await page.getByRole('tab', { name: 'Analysis' }).click();

    const authority = await page.evaluate(() => ({
        sessionOwnsLoadedGame: window.AnalyzeSection.session?.game === window.AnalyzeSection.loadedGame?.game,
        source: window.AnalyzeSection.loadedGame?.source,
        moveCount: window.AnalyzeSection.loadedGame?.game?.history?.().length,
        currentMoveIndex: window.AnalyzeSection.currentMoveIndex,
        analyzeBoards: document.querySelectorAll('#analyzeChessboard .board-b72b1').length,
        analysisEngine: window.AnalyzeSection.analysisEngine
    }));
    expect(authority).toEqual({
        sessionOwnsLoadedGame: true,
        source: 'Manual PGN',
        moveCount: 2,
        currentMoveIndex: 1,
        analyzeBoards: 1,
        analysisEngine: null
    });
});
