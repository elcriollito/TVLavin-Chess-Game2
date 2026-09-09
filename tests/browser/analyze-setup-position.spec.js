import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { instrumentPlay, monitorRuntime } from '../play/playwright-helpers.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const STUDY_FEN = '4k3/8/8/8/3Q4/8/8/4K3 b - - 0 1';
const ARTIFACTS = 'artifacts';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, {
        bestMove: 'e2e4', candidateMoves: ['e2e4 e7e5', 'd2d4 d7d5', 'g1f3 g8f6', 'c2c4 e7e5'],
        cp: 32, continuousDepths: [4, 8, 12], continuousDepthDelayMs: 120
    });
});

async function openSetup(page, { engine = false } = {}) {
    await page.goto('/analyze');
    if (engine) {
        await page.locator('#analyzeEngineToggle').click();
        await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4);
    }
    await page.getByRole('tab', { name: 'Setup Position' }).click();
    await expect(page.locator('#analyzeV2PanelSetup')).toBeVisible();
}

test('A2 draft edits the existing board without mutating the authoritative session', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openSetup(page, { engine: true });
    const initial = await page.evaluate(() => {
        window.__a2Game = AnalyzeSection.loadedGame.game;
        window.__a2Engine = AnalyzeSection.analysisEngine;
        return {
            fen: AnalyzeSection.loadedGame.game.fen(),
            boardConstructions: window.__caissaPlayHarness.snapshot().boardConstructions,
            workers: window.__caissaPlayHarness.snapshot().workersCreated,
            activeOperations: AnalyzeSection.analysisEngine.inspectAttribution().activeOperationCount
        };
    });
    expect(initial.activeOperations).toBe(0);

    await page.getByRole('button', { name: 'Select white queen' }).click();
    await page.locator('#analyzeChessboard .square-e4').click();
    expect(await page.evaluate(() => AnalyzeSection.setupDraft.getPiece('e4'))).toBe('wQ');
    expect(await page.evaluate(() => AnalyzeSection.loadedGame.game.get('e4'))).toBeNull();

    await page.getByRole('button', { name: 'Select white queen' }).click();
    await page.locator('#analyzeChessboard .square-e4 img').dragTo(page.locator('#analyzeSetupMessage'));
    expect(await page.evaluate(() => AnalyzeSection.setupDraft.getPiece('e4'))).toBeNull();

    await page.getByRole('button', { name: 'Clear board' }).click();
    await expect(page.locator('#analyzeSetupFen')).toHaveValue('8/8/8/8/8/8/8/8 w - - 0 1');
    await page.getByRole('button', { name: 'Reset starting position' }).click();
    await expect(page.locator('#analyzeSetupFen')).toHaveValue(START_FEN);

    expect(await page.evaluate(() => AnalyzeSection.board.orientation())).toBe('white');
    await page.getByRole('button', { name: 'Flip board' }).click();
    expect(await page.evaluate(() => AnalyzeSection.board.orientation())).toBe('black');

    await page.locator('#analyzeSetupTurn').selectOption('b');
    await expect(page.locator('#analyzeSetupFen')).toHaveValue(/ b KQkq /);
    await page.locator('[data-setup-castling="K"]').uncheck();
    await expect(page.locator('#analyzeSetupFen')).toHaveValue(/ b Qkq /);

    await page.locator('#analyzeSetupFen').fill(STUDY_FEN);
    await expect(page.locator('#analyzeSetupMessage')).toContainText('FEN applied');
    expect(await page.evaluate(() => AnalyzeSection.setupDraft.getPiece('d4'))).toBe('wQ');
    await page.locator('#analyzeSetupFen').fill('invalid FEN');
    await expect(page.locator('#analyzeSetupMessage')).toContainText('six fields');
    expect(await page.evaluate(() => AnalyzeSection.setupDraft.getPiece('d4'))).toBe('wQ');

    await page.getByRole('button', { name: 'Cancel setup and return to Analysis' }).click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4);
    const canceled = await page.evaluate(() => ({
        sameGame: AnalyzeSection.loadedGame.game === window.__a2Game,
        sameEngine: AnalyzeSection.analysisEngine === window.__a2Engine,
        fen: AnalyzeSection.loadedGame.game.fen(),
        boardFen: AnalyzeSection.board.fen(),
        boardConstructions: window.__caissaPlayHarness.snapshot().boardConstructions,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        activeOperations: AnalyzeSection.analysisEngine.inspectAttribution().activeOperationCount
    }));
    expect(canceled).toEqual({
        sameGame: true, sameEngine: true, fen: initial.fen, boardFen: initial.fen.split(' ')[0],
        boardConstructions: initial.boardConstructions, workers: initial.workers, activeOperations: 1
    });
    expect(runtime.errors).toEqual([]);
});

test('A2 direct workspace navigation cancels the uncommitted draft', async ({ page }) => {
    await openSetup(page);
    const initialFen = await page.evaluate(() => AnalyzeSection.loadedGame.game.fen());
    await page.getByRole('button', { name: 'Clear board' }).click();
    await page.evaluate(() => CaissaAnalyzeV2Shell.selectView('games'));
    await expect(page.locator('#analyzeV2PanelGames')).toBeVisible();
    expect(await page.evaluate(() => ({
        setupActive: AnalyzeSection.setupModeActive,
        fen: AnalyzeSection.loadedGame.game.fen(),
        boardFen: AnalyzeSection.board.fen()
    }))).toEqual({ setupActive: false, fen: initialFen, boardFen: initialFen.split(' ')[0] });
});

test('A2 valid FEN commits once through CaissaAnalyzeSession and resumes the same engine owner', async ({ page }) => {
    await openSetup(page, { engine: true });
    await page.evaluate(() => {
        window.__a2OriginalChess = window.Chess;
        window.__a2ChessConstructions = 0;
        window.Chess = new Proxy(window.Chess, {
            construct(target, args, newTarget) {
                window.__a2ChessConstructions += 1;
                return Reflect.construct(target, args, newTarget);
            }
        });
        window.__a2OldGame = AnalyzeSection.loadedGame.game;
        window.__a2Owner = AnalyzeSection.analysisEngine;
        window.__a2Boards = window.__caissaPlayHarness.snapshot().boardConstructions;
        window.__a2Workers = window.__caissaPlayHarness.snapshot().workersCreated;
    });
    await page.locator('#analyzeSetupFen').fill(STUDY_FEN);
    expect(await page.evaluate(() => window.__a2ChessConstructions)).toBe(0);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    const committed = await page.evaluate(() => ({
        chessConstructionsAtCommit: window.__a2ChessConstructions,
        replacedGame: AnalyzeSection.loadedGame.game !== window.__a2OldGame,
        sameEngine: AnalyzeSection.analysisEngine === window.__a2Owner,
        initialFen: AnalyzeSection.loadedGame.initialFen,
        fen: AnalyzeSection.loadedGame.game.fen(),
        source: AnalyzeSection.loadedGame.source,
        boards: window.__caissaPlayHarness.snapshot().boardConstructions,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }));
    expect(committed).toEqual({
        chessConstructionsAtCommit: 1, replacedGame: true, sameEngine: true,
        initialFen: STUDY_FEN, fen: STUDY_FEN, source: 'Setup Position',
        boards: await page.evaluate(() => window.__a2Boards),
        workers: await page.evaluate(() => window.__a2Workers)
    });
    await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4);
});

test('A2 PGN takes priority and commits once through the existing loadGameFromPgn pipeline', async ({ page }) => {
    await openSetup(page);
    await page.evaluate(() => {
        const original = AnalyzeSection.loadGameFromPgn;
        window.__a2PgnLoads = 0;
        AnalyzeSection.loadGameFromPgn = function (...args) {
            window.__a2PgnLoads += 1;
            return original.apply(this, args);
        };
    });
    await page.locator('#analyzeSetupFen').fill(STUDY_FEN);
    await page.locator('#analyzePgnInput').fill('[Event "A2"]\n[White "White"]\n[Black "Black"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *');
    await expect(page.locator('#analyzeSetupMessage')).toContainText('take priority');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    expect(await page.evaluate((studyFen) => ({
        calls: window.__a2PgnLoads,
        source: AnalyzeSection.loadedGame.source,
        history: AnalyzeSection.loadedGame.game.history(),
        cursor: AnalyzeSection.currentMoveIndex,
        notFenDraft: AnalyzeSection.loadedGame.game.fen() !== studyFen
    }), STUDY_FEN)).toEqual({
        calls: 1, source: 'Manual PGN', history: ['e4', 'e5', 'Nf3', 'Nc6'], cursor: 3, notFenDraft: true
    });
});

test('A2 invalid FEN stays in Setup with an inline error and no authority mutation', async ({ page }) => {
    await openSetup(page);
    const before = await page.evaluate(() => {
        window.__a2InvalidGame = AnalyzeSection.loadedGame.game;
        return AnalyzeSection.loadedGame.game.fen();
    });
    await page.getByRole('button', { name: 'Clear board' }).click();
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('#analyzeV2PanelSetup')).toBeVisible();
    await expect(page.locator('#analyzeSetupMessage')).toContainText('exactly one White king and one Black king');
    expect(await page.evaluate(() => ({
        sameGame: AnalyzeSection.loadedGame.game === window.__a2InvalidGame,
        fen: AnalyzeSection.loadedGame.game.fen()
    }))).toEqual({ sameGame: true, fen: before });
});

for (const viewport of [
    { width: 1600, height: 1000, name: '1600x1000' },
    { width: 1366, height: 768, name: '1366x768' },
    { width: 390, height: 844, name: '390x844' }
]) {
    test(`A2 Setup Position remains contained at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openSetup(page);
        const containment = await page.evaluate(() => {
            const panel = document.getElementById('analyzeV2PanelSetup');
            const viewportNode = document.querySelector('.caissa-analyze-v2__viewport');
            return {
                documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                panelOverflow: panel.scrollWidth - panel.clientWidth,
                nestedVerticalScroll: panel.scrollHeight > panel.clientHeight
                    && viewportNode.scrollHeight > viewportNode.clientHeight
            };
        });
        expect(containment.documentOverflow).toBeLessThanOrEqual(1);
        expect(containment.panelOverflow).toBeLessThanOrEqual(1);
        expect(containment.nestedVerticalScroll).toBe(false);
        if (viewport.width > 500) {
            mkdirSync(ARTIFACTS, { recursive: true });
            await page.screenshot({ path: `${ARTIFACTS}/analyze-v2-a2-setup-${viewport.name}.png`, fullPage: false });
        }
    });
}
