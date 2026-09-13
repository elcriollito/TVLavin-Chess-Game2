import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, monitorRuntime } from '../play/playwright-helpers.js';

const LONG_PGN = `[Event "M2-002 navigation"]
[White "Alexander"]
[Black "CAISSA"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5
7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. Nc3 Qc7
13. Be3 Bb7 14. Rc1 Rfe8 *`;

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, {
        bestMove: 'e2e4', candidateMoves: ['e2e4 e7e5', 'd2d4 d7d5'],
        cp: 28, continuousDepths: [4, 8, 12], continuousDepthDelayMs: 80
    });
});

async function openAnalyze(page, viewport = { width: 1366, height: 768 }) {
    await page.setViewportSize(viewport);
    await page.goto('/analyze');
    await expect(page.locator('#analyzeChessboard .caissa-board')).toBeVisible();
}

async function tapSquare(page, square) {
    await page.locator(`#analyzeChessboard .caissa-board__square[data-square="${square}"]`).click();
}

test('M2-002 tap-first input, persistent identities, navigation, promotion, overlays and engine remain canonical', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openAnalyze(page);

    const initialFen = await page.evaluate(() => {
        window.__m2Root = document.querySelector('#analyzeChessboard .caissa-board');
        window.__m2Squares = [...document.querySelectorAll('#analyzeChessboard .caissa-board__square')];
        return AnalyzeSection.getGame().fen();
    });

    await tapSquare(page, 'e2');
    await expect(page.locator('.caissa-board__square[data-square="e2"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.caissa-board__highlight--legal[data-square="e4"]')).toBeVisible();
    await tapSquare(page, 'g1');
    await expect(page.locator('.caissa-board__square[data-square="g1"]')).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => AnalyzeSection.getGame().fen())).toBe(initialFen);
    await tapSquare(page, 'g1');
    await expect(page.locator('.caissa-board__square[aria-selected="true"]')).toHaveCount(0);

    await tapSquare(page, 'e2');
    await tapSquare(page, 'e5');
    expect(await page.evaluate(() => AnalyzeSection.getGame().fen())).toBe(initialFen);
    await tapSquare(page, 'e2');
    await tapSquare(page, 'e4');
    expect(await page.evaluate(() => AnalyzeSection.getGame().history())).toEqual(['e4']);
    expect(await page.evaluate(() => ({
        canonical: AnalyzeSection.getGame().fen(),
        renderer: AnalyzeSection.board.getPosition().renderedFen,
        cursor: AnalyzeSection.currentMoveIndex,
        strategy: AnalyzeSection.board.inspect().strategy,
        oneRoot: document.querySelectorAll('#analyzeChessboard .caissa-board').length,
        legacyRoots: document.querySelectorAll('#analyzeChessboard .board-b72b1').length
    }))).toMatchObject({ cursor: 0, strategy: 'move', oneRoot: 1, legacyRoots: 0 });

    await page.evaluate((pgn) => AnalyzeSection.loadGameFromPgn(pgn, 'M2-002 fixture'), LONG_PGN);
    await page.evaluate(() => AnalyzeSection.jumpToMove(-1));
    const quiet = await page.evaluate(() => {
        const mover = document.querySelector('.caissa-board__piece[data-square="e2"]');
        const unaffected = document.querySelector('.caissa-board__piece[data-square="a1"]');
        const before = AnalyzeSection.board.inspect().metrics.renderer;
        AnalyzeSection.jumpToMove(0);
        const after = AnalyzeSection.board.inspect().metrics.renderer;
        return {
            rootStable: document.querySelector('#analyzeChessboard .caissa-board') === window.__m2Root,
            squaresStable: [...document.querySelectorAll('#analyzeChessboard .caissa-board__square')]
                .every((node, index) => node === window.__m2Squares[index]),
            moverStable: document.querySelector('.caissa-board__piece[data-square="e4"]') === mover,
            unaffectedStable: document.querySelector('.caissa-board__piece[data-square="a1"]') === unaffected,
            added: after.nodesAdded - before.nodesAdded,
            removed: after.nodesRemoved - before.nodesRemoved,
            coherent: AnalyzeSection.getGame().fen() === AnalyzeSection.board.getPosition().renderedFen
        };
    });
    expect(quiet).toEqual({ rootStable: true, squaresStable: true, moverStable: true,
        unaffectedStable: true, added: 0, removed: 0, coherent: true });

    await page.evaluate(() => {
        AnalyzeSection.loadGameFromPgn('[Result "*"]\n\n1. e4 d5 2. exd5 *', 'capture fixture');
        AnalyzeSection.jumpToMove(1);
        window.__m2Attacker = document.querySelector('.caissa-board__piece[data-square="e4"]');
        window.__m2Victim = document.querySelector('.caissa-board__piece[data-square="d5"]');
        window.__m2CaptureMetrics = AnalyzeSection.board.inspect().metrics.renderer;
        AnalyzeSection.jumpToMove(2);
    });
    expect(await page.evaluate(() => {
        const after = AnalyzeSection.board.inspect().metrics.renderer;
        return {
            attackerStable: document.querySelector('.caissa-board__piece[data-square="d5"]') === window.__m2Attacker,
            victimRemoved: !window.__m2Victim.isConnected,
            added: after.nodesAdded - window.__m2CaptureMetrics.nodesAdded,
            removed: after.nodesRemoved - window.__m2CaptureMetrics.nodesRemoved
        };
    })).toEqual({ attackerStable: true, victimRemoved: true, added: 0, removed: 1 });

    await page.evaluate((pgn) => {
        AnalyzeSection.loadGameFromPgn(pgn, 'castle fixture');
        AnalyzeSection.jumpToMove(7);
        window.__m2King = document.querySelector('.caissa-board__piece[data-square="e1"]');
        window.__m2Rook = document.querySelector('.caissa-board__piece[data-square="h1"]');
        AnalyzeSection.jumpToMove(8);
    }, LONG_PGN);
    expect(await page.evaluate(() => ({
        kingStable: document.querySelector('.caissa-board__piece[data-square="g1"]') === window.__m2King,
        rookStable: document.querySelector('.caissa-board__piece[data-square="f1"]') === window.__m2Rook
    }))).toEqual({ kingStable: true, rookStable: true });

    await page.evaluate((pgn) => {
        AnalyzeSection.loadGameFromPgn(pgn, 'stress fixture');
        AnalyzeSection.analysisPhase = 'complete';
        AnalyzeSection.analysisResults = AnalyzeSection.getLoadedMoves().map((move, index) => ({
            move,
            moveIndex: index,
            quality: index === 10 ? 'Inaccuracy' : index === 11 ? 'Mistake' : index === 12 ? 'Blunder' : 'Good',
            annotation: index === 10 ? '?!' : index === 11 ? '?' : index === 12 ? '??' : '',
            beforePlayerEval: 0.4,
            afterPlayerEval: index === 12 ? -3.2 : 0.3,
            mateBefore: null,
            mateAfter: null,
            loss: index === 12 ? 3.6 : 0.1,
            recommendationAvailable: false,
            isBestMove: false
        }));
        AnalyzeSection.jumpToMove(12);
    }, LONG_PGN);
    await expect(page.locator('.caissa-board__highlight--error')).toHaveCount(1);
    await expect(page.locator('#analyzeMoveList [data-index="12"]')).toHaveClass(/active/);
    const historical = await page.evaluate(() => {
        const before = { fen: AnalyzeSection.getGame().fen(), moves: [...AnalyzeSection.loadedGame.movesSan] };
        const accepted = AnalyzeSection.playStudyMove('b3', 'f7');
        return { accepted, sameFen: AnalyzeSection.getGame().fen() === before.fen,
            sameMoves: JSON.stringify(AnalyzeSection.loadedGame.movesSan) === JSON.stringify(before.moves) };
    });
    expect(historical).toEqual({ accepted: false, sameFen: true, sameMoves: true });

    const stress = await page.evaluate(() => {
        AnalyzeSection.analysisPhase = 'idle';
        AnalyzeSection.analysisResults = [];
        const run = (count) => {
            const before = AnalyzeSection.board.inspect().stats.positionSets;
            const states = [];
            for (let i = 0; i < count; i += 1) {
                const index = i % AnalyzeSection.getLoadedMoves().length;
                AnalyzeSection.jumpToMove(index);
                states.push(AnalyzeSection.currentMoveIndex === index
                    && AnalyzeSection.getGame().fen() === AnalyzeSection.board.getPosition().renderedFen
                    && document.querySelector('#analyzeMoveList .active')?.dataset.index === String(index));
            }
            return { passed: states.every(Boolean), updates: AnalyzeSection.board.inspect().stats.positionSets - before };
        };
        const twenty = run(20);
        const fifty = run(50);
        const hundred = run(100);
        const position = AnalyzeSection.board.getPosition();
        const beforeIdentical = AnalyzeSection.board.inspect().metrics.renderer;
        AnalyzeSection.projectAnalyzeBoard({ fen: AnalyzeSection.getGame().fen(), reason: 'identical-test' });
        const afterIdentical = AnalyzeSection.board.inspect().metrics.renderer;
        return {
            twenty, fifty, hundred,
            pending: position.pending,
            rootStable: document.querySelector('#analyzeChessboard .caissa-board') === window.__m2Root,
            squaresStable: [...document.querySelectorAll('#analyzeChessboard .caissa-board__square')]
                .every((node, index) => node === window.__m2Squares[index]),
            identical: {
                adds: afterIdentical.nodesAdded - beforeIdentical.nodesAdded,
                removes: afterIdentical.nodesRemoved - beforeIdentical.nodesRemoved,
                attributes: afterIdentical.attributeMutations - beforeIdentical.attributeMutations,
                styles: afterIdentical.styleMutations - beforeIdentical.styleMutations
            }
        };
    });
    expect(stress).toEqual({
        twenty: { passed: true, updates: 20 }, fifty: { passed: true, updates: 50 },
        hundred: { passed: true, updates: 100 }, pending: false, rootStable: true, squaresStable: true,
        identical: { adds: 0, removes: 0, attributes: 0, styles: 0 }
    });

    await page.locator('#analyzeEngineToggle').click();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.liveCurrentFen)).toBe(
        await page.evaluate(() => AnalyzeSection.getGame().fen())
    );
    await page.locator('#analyzeNavPrev').click();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.liveCurrentFen)).toBe(
        await page.evaluate(() => AnalyzeSection.getGame().fen())
    );
    expect(await page.evaluate(() => AnalyzeSection.liveCurrentFen === AnalyzeSection.board.getPosition().renderedFen)).toBe(true);

    await page.getByRole('tab', { name: 'Setup Position' }).click();
    await page.locator('#analyzeSetupFen').fill('7k/P7/8/8/8/8/8/7K w - - 0 1');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    const pawnId = await page.locator('.caissa-board__piece[data-square="a7"]').getAttribute('data-piece-id');
    await tapSquare(page, 'a7');
    await tapSquare(page, 'a8');
    await expect(page.locator('#promotionModal')).toHaveClass(/show/);
    await page.getByRole('button', { name: 'Promote to Queen' }).click();
    await expect(page.locator('.caissa-board__piece[data-square="a8"][data-piece="wQ"]')).toBeVisible();
    expect(await page.locator('.caissa-board__piece[data-square="a8"]').getAttribute('data-piece-id')).not.toBe(pawnId);
    expect(await page.evaluate(() => ({
        history: AnalyzeSection.getGame().history(),
        canonical: AnalyzeSection.getGame().fen(),
        renderer: AnalyzeSection.board.getPosition().renderedFen,
        engine: AnalyzeSection.liveCurrentFen
    }))).toMatchObject({ history: ['a8=Q+'] });
    await expect.poll(() => page.evaluate(() => AnalyzeSection.liveCurrentFen === AnalyzeSection.getGame().fen())).toBe(true);
    runtime.assertClean();
});

for (const viewport of [
    { width: 390, height: 844 }, { width: 430, height: 932 },
    { width: 844, height: 390 }, { width: 932, height: 430 }
]) {
    test(`M2-002 mobile composition is deliberate at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await openAnalyze(page, viewport);
        const state = await page.evaluate(() => {
            const rect = selector => {
                const box = document.querySelector(selector).getBoundingClientRect();
                return { top: box.top, bottom: box.bottom, left: box.left, right: box.right,
                    width: box.width, height: box.height };
            };
            const board = rect('#analyzeChessboard');
            const nav = rect('.analyze-board-controls');
            const tabs = rect('.caissa-analyze-v2__tabs');
            const engine = rect('.caissa-analyze-v2__engine-strip');
            const notation = rect('#analyzeMoveList');
            return {
                board, nav, tabs, engine, notation,
                portrait: innerHeight > innerWidth,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                rootCount: document.querySelectorAll('#analyzeChessboard .caissa-board').length,
                squareCount: document.querySelectorAll('#analyzeChessboard .caissa-board__square').length,
                boardVisible: board.top >= 0 && board.bottom <= innerHeight + 1,
                navVisible: nav.top >= 0 && nav.bottom <= innerHeight + 1,
                square: Math.abs(board.width - board.height) <= 2,
                workspaceOverflow: getComputedStyle(document.querySelector('.caissa-analyze-v2__tabpanel')).overflowY
            };
        });
        expect(state.overflow).toBeLessThanOrEqual(1);
        expect(state.rootCount).toBe(1);
        expect(state.squareCount).toBe(64);
        expect(state.square).toBe(true);
        expect(state.boardVisible).toBe(true);
        expect(state.navVisible).toBe(true);
        if (state.portrait) {
            expect(state.board.bottom).toBeLessThanOrEqual(state.nav.top + 1);
            expect(state.nav.bottom).toBeLessThanOrEqual(state.tabs.top + 1);
            expect(state.tabs.bottom).toBeLessThanOrEqual(state.engine.top + 1);
            expect(state.engine.bottom).toBeLessThanOrEqual(state.notation.top + 1);
        } else {
            expect(state.board.right).toBeLessThanOrEqual(state.tabs.left + 1);
            expect(state.workspaceOverflow).toBe('auto');
        }
    });
}

test('M2-002 rotation, keyboard, reduced motion and accessibility preserve the persistent root', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAnalyze(page, { width: 390, height: 844 });
    await page.evaluate(() => {
        window.__m2RotationRoot = document.querySelector('#analyzeChessboard .caissa-board');
        window.__m2RotationSquares = [...document.querySelectorAll('#analyzeChessboard .caissa-board__square')];
        window.__m2RotationPieces = [...document.querySelectorAll('#analyzeChessboard .caissa-board__piece')];
    });
    await expect(page.locator('#analyzeChessboard .caissa-board')).toHaveAttribute('aria-label', 'CAISSA Analyze interactive chessboard');
    await expect(page.locator('#analyzeChessboard .caissa-board')).toHaveAttribute('aria-readonly', 'false');
    await expect(page.locator('#analyzeChessboard .caissa-board')).toHaveAttribute('data-reduced-motion', 'true');
    await expect(page.locator('.caissa-board__square[data-square="e2"]')).toHaveAttribute('aria-label', /white pawn on e2/i);

    const root = page.locator('#analyzeChessboard .caissa-board');
    await root.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('.caissa-board__square[data-square="b1"]')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('.caissa-board__square[aria-selected="true"]')).toHaveCount(0);

    const portraitGeometryChanges = await page.evaluate(() =>
        AnalyzeSection.board.inspect().metrics.renderer.geometryChanges);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => page.evaluate(() => document.getElementById('analyzeChessboard').getBoundingClientRect().width)).toBeGreaterThan(250);
    await expect.poll(() => page.evaluate(() => AnalyzeSection.board.inspect().metrics.renderer.geometryChanges))
        .toBe(portraitGeometryChanges + 1);
    const landscapeGeometryChanges = portraitGeometryChanges + 1;
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => AnalyzeSection.board.inspect().metrics.renderer.geometryChanges))
        .toBe(landscapeGeometryChanges + 1);
    expect(await page.evaluate(() => ({
        root: document.querySelector('#analyzeChessboard .caissa-board') === window.__m2RotationRoot,
        squares: [...document.querySelectorAll('#analyzeChessboard .caissa-board__square')]
            .every((node, index) => node === window.__m2RotationSquares[index]),
        pieces: [...document.querySelectorAll('#analyzeChessboard .caissa-board__piece')]
            .every((node, index) => node === window.__m2RotationPieces[index]),
        count: document.querySelectorAll('#analyzeChessboard .caissa-board').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))).toEqual({ root: true, squares: true, pieces: true, count: 1, overflow: 0 });

    await tapSquare(page, 'e2');
    await tapSquare(page, 'e4');
    expect(await page.evaluate(() => AnalyzeSection.getGame().history())).toEqual(['e4']);
    const axe = await new AxeBuilder({ page }).include('#analyzeSection').analyze();
    expect(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
