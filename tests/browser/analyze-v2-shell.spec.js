import { test, expect } from '@playwright/test';
import { instrumentPlay, monitorRuntime } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { bestMove: 'e2e4', candidateMoves: ['e2e4'], cp: 72, depth: 12, delayMs: 5 });
});

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

test('A1.1 presents minimal analysis and preserves the single engine owner', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/analyze');

    const panel = page.locator('#analyzeV2PanelAnalysis');
    await expect(panel.locator('#analyzeV2OpeningLabel')).toHaveText('Starting Position');
    await expect(panel.locator('#analyzeEngineToggle')).toHaveText('Engine Off');
    await expect(panel.locator('#analyzeV2EngineLines')).toBeEmpty();
    await expect(panel.locator('#analyzeStartBtn')).toBeHidden();
    await expect(panel.locator('#analyzeMoveEvidence')).toBeHidden();
    await expect(panel.locator('#analyzeReviewSummary')).toBeHidden();
    await expect(panel.locator('#analyzeCriticalMoments')).toBeHidden();
    await expect(page.locator('.caissa-analyze-v2__actions button')).toHaveCount(4);
    await expect(page.locator('.caissa-analyze-v2__actions')).toContainText('New');
    await expect(page.locator('.caissa-analyze-v2__actions')).toContainText('Save');
    await expect(page.locator('.caissa-analyze-v2__actions')).toContainText('Review');

    const beforeEngine = await page.evaluate(() => ({
        owner: window.AnalyzeSection.analysisEngine,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }));
    expect(beforeEngine.owner).toBeNull();
    await panel.locator('#analyzeEngineToggle').click();
    await expect(panel.locator('#analyzeEngineToggle')).toHaveText('Engine On');
    await expect(panel.locator('.caissa-analyze-v2__engine-line')).toHaveCount(1);
    await expect(panel.locator('.caissa-analyze-v2__engine-line')).toContainText('+0.72');
    await expect(panel.locator('#analyzeV2EngineMeta')).toContainText('depth=12');

    const firstEngineExists = await page.evaluate(() => {
        window.__a11EngineOwner = window.AnalyzeSection.analysisEngine;
        return Boolean(window.__a11EngineOwner);
    });
    expect(firstEngineExists).toBe(true);
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(beforeEngine.workers + 1);
    await panel.locator('#analyzeEngineToggle').click();
    await expect(panel.locator('#analyzeEngineToggle')).toHaveText('Engine Off');
    await panel.locator('#analyzeEngineToggle').click();
    await expect(panel.locator('.caissa-analyze-v2__engine-line')).toHaveCount(1);
    const engineProof = await page.evaluate(() => ({
        sameOwner: window.AnalyzeSection.analysisEngine === window.__a11EngineOwner,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }));
    expect(engineProof).toEqual({ sameOwner: true, workers: beforeEngine.workers + 1 });
    await panel.locator('#analyzeEngineToggle').click();

    const positions = await page.evaluate(() => {
        const start = window.AnalyzeSection.getGame().fen();
        const moves = [
            ['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5'],
            ['c7', 'c6'], ['d5', 'c6'], ['b8', 'c6']
        ];
        const outcomes = moves.map(([from, to]) => window.AnalyzeSection.playStudyMove(from, to));
        return {
            start,
            end: window.AnalyzeSection.getGame().fen(),
            outcomes,
            history: window.AnalyzeSection.getGame().history(),
            cursor: window.AnalyzeSection.currentMoveIndex
        };
    });
    expect(positions.outcomes).toEqual([true, true, true, true, true, true]);
    expect(positions.history).toEqual(['e4', 'd5', 'exd5', 'c6', 'dxc6', 'Nxc6']);
    expect(positions.cursor).toBe(5);
    await expect(panel.locator('#analyzeMoveList')).toContainText('Nxc6');
    await expect(panel.locator('#analyzeV2OpeningLabel')).toHaveText('Scandinavian Defense');

    await page.locator('#analyzeNavFirst').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.getGame().fen())).toBe(positions.start);
    await page.locator('#analyzeNavNext').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(0);
    await page.locator('#analyzeNavLast').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.getGame().fen())).toBe(positions.end);
    await page.locator('#analyzeNavPrev').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(4);

    const authority = await page.evaluate(() => ({
        sessionOwnsGame: window.AnalyzeSection.session.game === window.AnalyzeSection.loadedGame.game,
        boardCount: document.querySelectorAll('#analyzeChessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }));
    expect(authority).toEqual({ sessionOwnsGame: true, boardCount: 1, workers: beforeEngine.workers + 1 });
    runtime.assertClean();
});
