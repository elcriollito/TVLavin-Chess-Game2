import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { instrumentPlay, monitorRuntime } from '../play/playwright-helpers.js';

const ARTIFACTS = 'artifacts';
const STUDY_FEN = '4k3/8/8/8/3Q4/8/8/4K3 b - - 0 1';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, {
        bestMove: 'e2e4',
        candidateMoves: ['e2e4 e7e5', 'd2d4 d7d5', 'g1f3 g8f6', 'c2c4 e7e5'],
        cp: 31,
        continuousDepths: [4, 8, 12],
        continuousDepthDelayMs: 100
    });
});

async function openAnalyze(page) {
    await page.goto('/analyze');
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('#analyzeChessboard .board-b72b1')).toBeVisible();
}

async function startBoardDrag(page, sourceSquare, targetSquare) {
    const source = page.locator(`#analyzeChessboard .square-${sourceSquare} img`);
    const target = page.locator(`#analyzeChessboard .square-${targetSquare}`);
    await Promise.all([expect(source).toBeVisible(), expect(target).toBeVisible()]);
    const [sourceBox, targetBox] = await Promise.all([source.boundingBox(), target.boundingBox()]);
    if (!sourceBox || !targetBox) throw new Error(`Missing drag geometry for ${sourceSquare}-${targetSquare}`);
    const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
    const end = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 5 });
    await page.mouse.move(end.x, end.y, { steps: 5 });
    await expect(page.locator('body')).toHaveClass(/caissa-analyze-board-dragging/);
    await expect(page.locator('body > .piece-417db')).toBeVisible();
    await expect(target).toHaveClass(/highlight2-9c5d2/);
}

async function finishBoardDrag(page) {
    await page.mouse.up();
    await expect(page.locator('body')).not.toHaveClass(/caissa-analyze-board-dragging/);
    await expect(page.locator('body > .piece-417db')).toBeHidden();
}

async function dragBoardPiece(page, sourceSquare, targetSquare) {
    await startBoardDrag(page, sourceSquare, targetSquare);
    await finishBoardDrag(page);
}

test('A2.2 Analysis drag is physical while legal move, notation, cursor and engine stay authoritative', async ({ page, browserName }) => {
    const runtime = monitorRuntime(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openAnalyze(page);
    await page.locator('#analyzeEngineToggle').click();
    await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4);
    const before = await page.evaluate(() => {
        window.__a22Game = AnalyzeSection.loadedGame.game;
        window.__a22Board = AnalyzeSection.board;
        window.__a22Engine = AnalyzeSection.analysisEngine;
        return window.__caissaPlayHarness.snapshot();
    });

    await startBoardDrag(page, 'e2', 'e4');
    if (browserName === 'chromium') {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/analyze-v2-a22-analysis-board-dragging-1600x1000.png` });
    }
    await finishBoardDrag(page);
    await dragBoardPiece(page, 'e7', 'e5');
    await dragBoardPiece(page, 'g1', 'f3');
    await expect.poll(() => page.evaluate(() => AnalyzeSection.liveCurrentFen === AnalyzeSection.loadedGame.game.fen())).toBe(true);

    const legal = await page.evaluate(() => ({
        history: AnalyzeSection.loadedGame.game.history(),
        loadedMoves: AnalyzeSection.getLoadedMoves(),
        cursor: AnalyzeSection.currentMoveIndex,
        sameGame: AnalyzeSection.loadedGame.game === window.__a22Game,
        sameBoard: AnalyzeSection.board === window.__a22Board,
        sameEngine: AnalyzeSection.analysisEngine === window.__a22Engine,
        workerCount: window.__caissaPlayHarness.snapshot().workersCreated,
        boardCount: window.__caissaPlayHarness.snapshot().boardConstructions,
        fen: AnalyzeSection.loadedGame.game.fen(),
        engineFen: AnalyzeSection.liveCurrentFen
    }));
    expect(legal.history).toEqual(['e4', 'e5', 'Nf3']);
    expect(legal.loadedMoves).toEqual(legal.history);
    expect(legal.cursor).toBe(2);
    expect(legal.sameGame && legal.sameBoard && legal.sameEngine).toBe(true);
    expect(legal.workerCount).toBe(before.workersCreated);
    expect(legal.boardCount).toBe(before.boardConstructions);
    expect(legal.engineFen).toBe(legal.fen);

    const fenBeforeIllegal = legal.fen;
    await dragBoardPiece(page, 'g8', 'g6');
    expect(await page.evaluate(() => ({
        fen: AnalyzeSection.loadedGame.game.fen(),
        history: AnalyzeSection.loadedGame.game.history(),
        ghostVisible: Array.from(document.querySelectorAll('body > .piece-417db'))
            .some(piece => getComputedStyle(piece).display !== 'none'),
        dragging: document.body.classList.contains('caissa-analyze-board-dragging')
    }))).toEqual({ fen: fenBeforeIllegal, history: ['e4', 'e5', 'Nf3'], ghostVisible: false, dragging: false });
    runtime.assertClean();
});

test('A2.2 Setup reuses the physical board drag but mutates only the temporary draft', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openAnalyze(page);
    const authority = await page.evaluate(() => {
        window.__a22SetupGame = AnalyzeSection.loadedGame.game;
        return AnalyzeSection.loadedGame.game.fen();
    });
    await page.locator('#analyzeNewBtn').click();
    await expect(page.locator('#analyzeV2PanelSetup')).toBeVisible();
    await startBoardDrag(page, 'd2', 'd4');
    if (browserName === 'chromium') {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/analyze-v2-a22-setup-board-dragging-1366x768.png` });
    }
    await finishBoardDrag(page);
    expect(await page.evaluate((initialFen) => ({
        draftFrom: AnalyzeSection.setupDraft.getPiece('d2'),
        draftTo: AnalyzeSection.setupDraft.getPiece('d4'),
        sameAuthority: AnalyzeSection.loadedGame.game === window.__a22SetupGame,
        authorityFen: AnalyzeSection.loadedGame.game.fen(),
        initialFen,
        fenInput: document.getElementById('analyzeSetupFen').value,
        draftFen: AnalyzeSection.setupDraft.toFen()
    }), authority)).toEqual({
        draftFrom: null,
        draftTo: 'wP',
        sameAuthority: true,
        authorityFen: authority,
        initialFen: authority,
        fenInput: await page.evaluate(() => AnalyzeSection.setupDraft.toFen()),
        draftFen: await page.evaluate(() => AnalyzeSection.setupDraft.toFen())
    });
});

test('A2.2/A3.1 New opens a clean Setup draft and Cancel preserves the session', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnalyze(page);
    await page.evaluate(() => AnalyzeSection.playStudyMove('e2', 'e4'));
    const before = await page.evaluate(() => {
        window.__a22NewGame = AnalyzeSection.loadedGame.game;
        window.__a22NewSession = AnalyzeSection.session;
        return AnalyzeSection.loadedGame.game.fen();
    });
    await page.locator('#analyzeNewBtn').click();
    await expect(page.locator('#analyzeV2PanelSetup')).toBeVisible();
    expect(await page.evaluate(() => ({
        draftFen: AnalyzeSection.setupDraft.toFen(),
        sameGame: AnalyzeSection.loadedGame.game === window.__a22NewGame,
        sameSession: AnalyzeSection.session === window.__a22NewSession,
        engineOn: AnalyzeSection.liveEngineEnabled
    }))).toEqual({
        draftFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        sameGame: true,
        sameSession: true,
        engineOn: false
    });
    if (browserName === 'chromium') {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/analyze-v2-a22-new-to-setup-390x844.png` });
    }
    await page.getByRole('button', { name: 'Cancel setup and return to Analysis' }).click();
    expect(await page.evaluate(() => ({
        fen: AnalyzeSection.loadedGame.game.fen(),
        sameGame: AnalyzeSection.loadedGame.game === window.__a22NewGame,
        sameSession: AnalyzeSection.session === window.__a22NewSession,
        draft: AnalyzeSection.setupDraft
    }))).toEqual({ fen: before, sameGame: true, sameSession: true, draft: null });
});

test('A2.2 Save downloads the authoritative PGN with metadata and no extra Chess owner', async ({ page }) => {
    await openAnalyze(page);
    await page.evaluate(() => {
        AnalyzeSection.loadGameFromPgn(
            '[Event "A2.2 Local Analysis"]\n[Site "Local Browser"]\n[Round "7"]\n'
                + '[White "Alexander"]\n[Black "CAISSA"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *',
            'A2.2 fixture'
        );
        AnalyzeSection.jumpToMove(0);
        window.__a22SaveFen = AnalyzeSection.loadedGame.game.fen();
        window.__a22ChessConstructions = 0;
        window.Chess = new Proxy(window.Chess, {
            construct(target, args, newTarget) {
                window.__a22ChessConstructions += 1;
                return Reflect.construct(target, args, newTarget);
            }
        });
        window.addEventListener('caissa:analyze-pgn-download', event => {
            window.__a22DownloadDetail = event.detail;
        }, { once: true });
    });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#analyzeSaveBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^caissa-analysis-.*\.pgn$/);
    const saved = await page.evaluate(() => ({
        detail: window.__a22DownloadDetail,
        chessConstructions: window.__a22ChessConstructions,
        currentHistory: AnalyzeSection.loadedGame.game.history(),
        loadedMoves: AnalyzeSection.getLoadedMoves(),
        cursor: AnalyzeSection.currentMoveIndex,
        fen: AnalyzeSection.loadedGame.game.fen(),
        expectedFen: window.__a22SaveFen,
        headers: AnalyzeSection.loadedGame.game.header()
    }));
    expect(saved.chessConstructions).toBe(0);
    expect(saved.currentHistory).toEqual(['e4']);
    expect(saved.loadedMoves).toEqual(['e4', 'e5', 'Nf3']);
    expect(saved.cursor).toBe(0);
    expect(saved.fen).toBe(saved.expectedFen);
    expect(saved.headers).toMatchObject({ Site: 'Local Browser', Round: '7' });
    expect(saved.detail.pgn).toContain('[Event "A2.2 Local Analysis"]');
    expect(saved.detail.pgn).toContain('[White "Alexander"]');
    expect(saved.detail.pgn).toContain('[Black "CAISSA"]');
    expect(saved.detail.pgn).toContain('[Site "Local Browser"]');
    expect(saved.detail.pgn).toContain('[Round "7"]');
    expect(saved.detail.pgn).toContain('[Result "*"]');
    expect(saved.detail.pgn).toMatch(/1\. e4 e5 2\. Nf3 \*/);
    expect(saved.detail.filename).toBe(download.suggestedFilename());
});

test('A2.2 successful FEN and PGN Load auto-enable one engine; failed Load never does', async ({ page, browserName }) => {
    const runtime = monitorRuntime(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openAnalyze(page);
    expect(await page.evaluate(() => AnalyzeSection.liveEngineEnabled)).toBe(false);
    const baselineWorkers = await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated);
    await page.locator('#analyzeNewBtn').click();
    await page.getByRole('button', { name: 'Clear board' }).click();
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('#analyzeV2PanelSetup')).toBeVisible();
    expect(await page.evaluate(() => ({
        engineOn: AnalyzeSection.liveEngineEnabled,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }))).toEqual({ engineOn: false, workers: baselineWorkers });

    await page.locator('#analyzeSetupFen').fill(STUDY_FEN);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('#analyzeEngineToggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => AnalyzeSection.liveCurrentFen === AnalyzeSection.loadedGame.game.fen())).toBe(true);
    const fenCommit = await page.evaluate(() => {
        window.__a22AutoEngine = AnalyzeSection.analysisEngine;
        return {
            fen: AnalyzeSection.loadedGame.game.fen(),
            initialFen: AnalyzeSection.loadedGame.initialFen,
            engineFen: AnalyzeSection.liveCurrentFen,
            owner: AnalyzeSection.liveEngineOwner,
            workers: window.__caissaPlayHarness.snapshot().workersCreated,
            pgn: AnalyzeSection.buildAnalysisPgn()
        };
    });
    expect(fenCommit).toMatchObject({
        fen: STUDY_FEN,
        initialFen: STUDY_FEN,
        engineFen: STUDY_FEN,
        owner: 'analyze-live',
        workers: baselineWorkers + 1
    });
    expect(fenCommit.pgn).toContain('[SetUp "1"]');
    expect(fenCommit.pgn).toContain(`[FEN "${STUDY_FEN}"]`);
    if (browserName === 'chromium') {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/analyze-v2-a22-load-analysis-engine-on-1600x1000.png` });
    }

    await page.locator('#analyzeEngineToggle').click();
    await page.locator('#analyzeNewBtn').click();
    await page.locator('#analyzePgnInput').fill('[Event "A2.2 PGN"]\n[White "White"]\n[Black "Black"]\n[Result "*"]\n\n1. d4 d5 *');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('#analyzeEngineToggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4);
    expect(await page.evaluate(() => ({
        sameEngine: AnalyzeSection.analysisEngine === window.__a22AutoEngine,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        history: AnalyzeSection.loadedGame.game.history()
    }))).toEqual({ sameEngine: true, workers: baselineWorkers + 1, history: ['d4', 'd5'] });
    runtime.assertClean();
});

for (const viewport of [
    { width: 1600, height: 1000, name: '1600x1000' },
    { width: 1366, height: 768, name: '1366x768' },
    { width: 390, height: 844, name: '390x844' }
]) {
    test(`A2.2 footer actions and workspace remain contained at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openAnalyze(page);
        await expect(page.locator('#analyzeNewBtn')).toBeEnabled();
        await expect(page.locator('#analyzeSaveBtn')).toBeEnabled();
        await expect(page.locator('#analyzeReviewBtn')).toBeEnabled();
        const geometry = await page.evaluate(() => ({
            documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            shellOverflow: document.querySelector('.caissa-analyze-v2').scrollWidth
                - document.querySelector('.caissa-analyze-v2').clientWidth
        }));
        expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
        expect(geometry.shellOverflow).toBeLessThanOrEqual(1);
    });
}

test('V2.0.1 Review completes through the existing Stockfish analysis owner', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openAnalyze(page);
    const before = await page.evaluate(() => {
        AnalyzeSection.loadGameFromPgn(
            '[Event "Review pipeline"]\n[White "Alexander"]\n[Black "CAISSA"]\n[Result "*"]\n\n1. e4 e5 *',
            'Review pipeline fixture'
        );
        return window.__caissaPlayHarness.snapshot();
    });

    await page.locator('#analyzeReviewBtn').click();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.analysisPhase), { timeout: 10_000 }).toBe('complete');
    const after = await page.evaluate(() => ({
        harness: window.__caissaPlayHarness.snapshot(),
        results: AnalyzeSection.analysisResults.length,
        engine: AnalyzeSection.analysisEngine,
        owner: AnalyzeSection.liveEngineOwner,
        moves: AnalyzeSection.loadedGame.game.history()
    }));
    expect(after.results).toBe(2);
    expect(after.moves).toEqual(['e4', 'e5']);
    expect(after.harness.workersCreated - before.workersCreated).toBe(1);
    expect(after.harness.workersTerminated - before.workersTerminated).toBe(0);
    expect(after.engine).not.toBeNull();
    expect(after.owner).toBeNull();
    await expect(page.locator('#analyzeReviewBtn')).toHaveAttribute('aria-pressed', 'true');
    runtime.assertClean();
});

test('V2.0.1 live to 33-ply Review to live is sequential on the same SF18 worker', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openAnalyze(page);
    await page.evaluate(() => {
        AnalyzeSection.loadGameFromPgn(
            '[Event "Long review"]\n[White "Alexander"]\n[Black "CAISSA"]\n[Result "*"]\n\n'
                + '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 '
                + '7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 '
                + '13. Nc3 Bb7 14. Bg5 b4 15. Nb1 h6 16. Bh4 Re8 17. Nbd2 *',
            '33-ply review fixture'
        );
        AnalyzeSection.jumpToMove(11);
        window.__reviewProgress = [];
        const originalProgress = AnalyzeSection.updateReviewProgress;
        AnalyzeSection.updateReviewProgress = function (reviewed, total) {
            window.__reviewProgress.push([reviewed, total]);
            return originalProgress.call(this, reviewed, total);
        };
    });
    await page.locator('#analyzeEngineToggle').click();
    await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4);
    const before = await page.evaluate(() => {
        window.__reviewEngine = AnalyzeSection.analysisEngine;
        window.__reviewGame = AnalyzeSection.loadedGame.game;
        window.__reviewBoard = AnalyzeSection.board;
        return { harness: window.__caissaPlayHarness.snapshot(), cursor: AnalyzeSection.currentMoveIndex };
    });

    await page.locator('#analyzeReviewBtn').click();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.analysisPhase), { timeout: 15_000 }).toBe('complete');
    await expect.poll(() => page.evaluate(() => AnalyzeSection.liveEngineOwner), { timeout: 5_000 }).toBe('analyze-live');
    await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4);

    const after = await page.evaluate(() => ({
        harness: window.__caissaPlayHarness.snapshot(),
        sameEngine: AnalyzeSection.analysisEngine === window.__reviewEngine,
        sameGame: AnalyzeSection.loadedGame.game === window.__reviewGame,
        sameBoard: AnalyzeSection.board === window.__reviewBoard,
        cursor: AnalyzeSection.currentMoveIndex,
        results: AnalyzeSection.analysisResults.length,
        metrics: AnalyzeSection.lastReviewMetrics,
        progress: window.__reviewProgress,
        displayedHistoryLength: AnalyzeSection.loadedGame.game.history().length,
        sourceHistoryLength: AnalyzeSection.getLoadedMoves().length
    }));
    const commands = after.harness.workerMessages.slice(before.harness.workerMessages.length);
    expect(after.sameEngine && after.sameGame && after.sameBoard).toBe(true);
    expect(after.cursor).toBe(before.cursor);
    expect(after.displayedHistoryLength).toBe(12);
    expect(after.sourceHistoryLength).toBe(33);
    expect(after.results).toBe(33);
    expect(after.metrics).toMatchObject({
        status: 'complete', plies: 33, positions: 34, completedPositions: 34,
        depth: 12, retryDepth: 8, timeouts: 0, retries: 0
    });
    expect(after.progress.some(([reviewed, total]) => reviewed > 0 && reviewed < total)).toBe(true);
    expect(after.progress.at(-1)).toEqual([33, 33]);
    expect(after.harness.workersCreated).toBe(before.harness.workersCreated);
    expect(after.harness.workersTerminated).toBe(before.harness.workersTerminated);
    expect(commands.filter(command => command === 'go depth 12')).toHaveLength(34);
    expect(commands).not.toContain('go depth 8');
    expect(commands.at(-1)).toBe('go infinite');
    expect(commands.slice(-3)[0]).toBe('setoption name MultiPV value 4');
    expect(commands.filter(command => command === 'setoption name MultiPV value 1').length).toBeGreaterThanOrEqual(34);
    await expect(page.locator('.caissa-analyze-v2__notation')).not.toContainText('+0.');
    await expect(page.locator('#analyzeReviewBtn')).toHaveAttribute('aria-pressed', 'true');
    runtime.assertClean();
});

test('V2.0.1 Review timeout fails explicitly, restores live, and can be retried', async ({ page }) => {
    await openAnalyze(page);
    await page.evaluate(() => AnalyzeSection.loadGameFromPgn(
        '[Event "Review recovery"]\n[White "Alexander"]\n[Black "CAISSA"]\n[Result "*"]\n\n1. e4 e5 *',
        'Review recovery fixture'
    ));
    await page.locator('#analyzeEngineToggle').click();
    await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4);
    const before = await page.evaluate(() => {
        window.__reviewRecoveryEngine = AnalyzeSection.analysisEngine;
        AnalyzeSection.reviewPositionTimeoutMs = 60;
        window.__caissaPlayHarness.configure({ autoReply: false });
        return window.__caissaPlayHarness.snapshot();
    });

    await page.locator('#analyzeReviewBtn').click();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.analysisPhase), { timeout: 5_000 }).toBe('failed');
    await expect.poll(() => page.evaluate(() => AnalyzeSection.liveEngineOwner), { timeout: 5_000 }).toBe('analyze-live');
    await expect(page.locator('#analyzeReviewBtn')).toContainText('Retry Review');
    await expect(page.locator('#analyzeReviewBtn')).not.toHaveClass(/caissa-ui-button-loading/);
    const failed = await page.evaluate(() => ({
        harness: window.__caissaPlayHarness.snapshot(),
        sameEngine: AnalyzeSection.analysisEngine === window.__reviewRecoveryEngine,
        live: AnalyzeSection.liveEngineEnabled,
        analyzing: AnalyzeSection.isAnalyzing,
        metrics: AnalyzeSection.lastReviewMetrics
    }));
    expect(failed.sameEngine).toBe(true);
    expect(failed.live).toBe(true);
    expect(failed.analyzing).toBe(false);
    expect(failed.metrics).toMatchObject({ status: 'failed', timeouts: 2, retries: 1 });
    expect(failed.harness.workersCreated).toBe(before.workersCreated);
    expect(failed.harness.workersTerminated).toBe(before.workersTerminated);
    expect(failed.harness.workerMessages.at(-1)).toBe('go infinite');

    await page.evaluate(() => window.__caissaPlayHarness.configure({ autoReply: true }));
    await page.locator('#analyzeReviewBtn').click();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.analysisPhase), { timeout: 5_000 }).toBe('complete');
    await expect(page.locator('#analyzeReviewBtn')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => AnalyzeSection.analysisEngine === window.__reviewRecoveryEngine)).toBe(true);
});

test('V2.0.1 changing workspace cancels Review without stale annotations', async ({ page }) => {
    await openAnalyze(page);
    await page.evaluate(() => {
        AnalyzeSection.loadGameFromPgn(
            '[Event "Review cancellation"]\n[White "Alexander"]\n[Black "CAISSA"]\n[Result "*"]\n\n'
                + '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *',
            'Review cancellation fixture'
        );
        window.__caissaPlayHarness.configure({ delayMs: 250 });
    });
    await page.locator('#analyzeEngineToggle').click();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.liveEngineOwner)).toBe('analyze-live');
    const beforeWorkers = await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated);
    await page.locator('#analyzeReviewBtn').click();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.analysisPhase)).toBe('analyzing');
    await page.locator('#analyzeV2TabGames').click();
    await expect(page.locator('#analyzeV2PanelGames')).toBeVisible();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.analysisPhase)).toBe('cancelled');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => ({
        analyzing: AnalyzeSection.isAnalyzing,
        results: AnalyzeSection.analysisResults.length,
        live: AnalyzeSection.liveEngineEnabled,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }))).toEqual({ analyzing: false, results: 0, live: false, workers: beforeWorkers });
    await page.locator('#analyzeV2TabAnalysis').click();
    await expect(page.locator('#analyzeReviewBtn')).toContainText('Review');
    await expect(page.locator('#analyzeReviewBtn')).not.toHaveClass(/caissa-ui-button-loading/);
});

test('V2.0.1 Review action stays on the existing pipeline and notation shows symbols only', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openAnalyze(page);
    await page.evaluate(() => {
        AnalyzeSection.loadGameFromPgn(
            '[Event "Review symbols"]\n[White "Alexander"]\n[Black "CAISSA"]\n[Result "*"]\n\n'
                + '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *',
            'Review symbols fixture'
        );
        window.__reviewOwners = {
            game: AnalyzeSection.loadedGame.game,
            board: AnalyzeSection.board,
            engine: AnalyzeSection.analysisEngine
        };
        window.__reviewStartCalls = 0;
        window.__reviewOriginalStart = AnalyzeSection.startAnalysis;
        AnalyzeSection.startAnalysis = async () => { window.__reviewStartCalls += 1; };
    });

    await page.locator('#analyzeReviewBtn').click();
    await expect.poll(() => page.evaluate(() => window.__reviewStartCalls)).toBe(1);
    await page.evaluate(() => {
        AnalyzeSection.startAnalysis = window.__reviewOriginalStart;
        AnalyzeSection.analysisPhase = 'complete';
        AnalyzeSection.analysisResults = [
            { quality: 'Book', annotation: '', isBestMove: false, evalAfter: 0.11 },
            { quality: 'Acceptable', annotation: '', isBestMove: true, evalAfter: 0.22 },
            { quality: 'Acceptable', annotation: '!!', isBestMove: false, evalAfter: 0.33 },
            { quality: 'Acceptable', annotation: '!?', isBestMove: false, evalAfter: 0.44 },
            { quality: 'Inaccuracy', annotation: '?!', isBestMove: false, evalAfter: 0.55 },
            { quality: 'Mistake', annotation: '?', isBestMove: false, evalAfter: 0.66 },
            { quality: 'Blunder', annotation: '??', isBestMove: false, evalAfter: 0.77 },
            { quality: 'Acceptable', annotation: '', isBestMove: false, evalAfter: 0.88 }
        ];
        AnalyzeSection.updateMoveList();
    });

    await expect(page.locator('.caissa-analyze-v2__notation .analyze-move-annotation')).toHaveText([
        '📖', '!', '!!', '!?', '?!', '?', '??'
    ]);
    await expect(page.locator('#analyzeReviewBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#analyzeReviewBtn')).toHaveClass(/is-active/);
    await expect(page.locator('#analyzeReviewSummary')).toBeHidden();
    await expect(page.locator('#analyzeCriticalMoments')).toBeHidden();
    await expect(page.locator('.caissa-analyze-v2__notation')).not.toContainText('+0.');
    if (browserName === 'chromium') {
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/analyze-v2-review-symbols-1600x1000.png` });
    }

    await page.locator('.move-white[data-index="4"]').click();
    expect(await page.evaluate(() => ({
        cursor: AnalyzeSection.currentMoveIndex,
        sameGame: AnalyzeSection.loadedGame.game === window.__reviewOwners.game,
        sameBoard: AnalyzeSection.board === window.__reviewOwners.board,
        sameEngine: AnalyzeSection.analysisEngine === window.__reviewOwners.engine
    }))).toEqual({ cursor: 4, sameGame: true, sameBoard: true, sameEngine: true });
});
