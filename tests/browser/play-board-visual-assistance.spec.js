import { test, expect } from '@playwright/test';
import {
    instrumentPlay, loadPosition, monitorRuntime, openPlay, playMove, startGame
} from '../play/playwright-helpers.js';

const MODES = [
    { name: 'Play Game', route: '/play/games', start: '[data-games-primary]' },
    { name: 'Play Bots', route: '/play/bots', start: '[data-bot-primary]' },
    { name: 'Play Coach', route: '/play/coach', start: '[data-coach-primary]' }
];

async function startMode(page, mode) {
    await page.goto(mode.route);
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toBeVisible();
    await page.locator(mode.start).click();
    await expect.poll(() => page.evaluate(() => window.App.gameActive)).toBe(true);
}

async function selectSquare(page, square) {
    await page.evaluate(value => window.handlePlayBoardSquareSelection(value), square);
}

async function setSetting(page, setting, enabled) {
    const input = page.locator(`[data-play-setting="${setting}"]`);
    await input.evaluate((node, checked) => {
        node.checked = checked;
        node.dispatchEvent(new Event('change', { bubbles: true }));
    }, enabled);
}

for (const viewport of [
    { name: 'desktop', size: { width: 1440, height: 900 } },
    { name: 'mobile', size: { width: 390, height: 844 } }
]) {
    for (const mode of MODES) {
        test(`${mode.name} ${viewport.name} uses adapter legal targets and Settings suppresses every marker`, async ({ page }) => {
            await instrumentPlay(page, { autoReply: false });
            const runtime = monitorRuntime(page);
            await page.setViewportSize(viewport.size);
            await startMode(page, mode);

            await selectSquare(page, 'e2');
            await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().legalTargets))
                .toEqual(['e3', 'e4']);
            await expect(page.locator('#chessboard .square-e3')).toHaveClass(/caissa-board-legal-target/);
            await expect(page.locator('#chessboard .square-e4')).toHaveClass(/caissa-board-legal-target/);
            expect(await page.locator('#chessboard .mobile-tap-target').count()).toBe(0);
            expect(await page.locator('#chessboard .square-e4').evaluate(node =>
                getComputedStyle(node, '::after').display)).not.toBe('none');

            await setSetting(page, 'legal-moves', false);
            await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().legalTargets)).toEqual([]);
            expect(await page.locator('#chessboard .caissa-board-legal-target').count()).toBe(0);

            await setSetting(page, 'legal-moves', true);
            await expect(page.locator('#chessboard .square-e4')).toHaveClass(/caissa-board-legal-target/);
            await page.waitForTimeout(300);
            await selectSquare(page, 'e2');
            await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().legalTargets)).toEqual([]);
            runtime.assertClean();
        });
    }
}

test('real board pointer selection reaches the adapter before chessboard drag handling', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Headed Chromium owns the physical pointer QA for this contract.');
    await instrumentPlay(page, { autoReply: false });
    await startMode(page, MODES[0]);
    const square = page.locator('#playSection #chessboard .square-e2');
    const box = await square.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().legalTargets))
        .toEqual(['e3', 'e4']);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().legalTargets))
        .toEqual(['e3', 'e4']);
    await page.locator('#playSection #chessboard .square-e4').click();
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4']);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove)).toBeNull();
});

test('capture targets use the adapter capture ring and clear with selection', async ({ page, browserName }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    await startGame(page);
    await loadPosition(page, '4k3/8/8/8/3p4/2B5/8/4K3 w - - 0 1');
    await page.evaluate(() => window.handlePlayBoardSquareSelection('c3'));
    await expect(page.locator('#chessboard .square-d4')).toHaveClass(/caissa-board-legal-capture/);
    const style = await page.locator('#chessboard .square-d4').evaluate(node => ({
        display: getComputedStyle(node, '::after').display,
        background: getComputedStyle(node, '::after').backgroundColor,
        border: getComputedStyle(node, '::after').borderTopWidth
    }));
    expect(style.display).not.toBe('none');
    expect(['', 'rgba(0, 0, 0, 0)', 'transparent']).toContain(style.background);
    if (browserName === 'chromium') expect(parseFloat(style.border)).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => window.handlePlayBoardSquareSelection('c3'));
    await expect(page.locator('#chessboard .caissa-board-legal-target')).toHaveCount(0);
});

test('Coach Hint remains independently visible when ordinary legal moves are off', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    const runtime = monitorRuntime(page);
    await startMode(page, MODES[2]);

    await setSetting(page, 'legal-moves', false);
    await page.evaluate(() => {
        window.App.currentEvaluation = { fen: window.App.game.fen(), bestMove: 'e2e4' };
    });
    await page.locator('[data-active-game-action="coach-hint"]').click();
    await expect(page.locator('body')).toHaveClass(/caissa-coach-hint-active/);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().legalTargets))
        .toEqual(['e4']);
    await expect(page.locator('#chessboard .caissa-board-legal-target')).toHaveCount(1);
    expect(await page.locator('#chessboard .square-e2').evaluate(node =>
        getComputedStyle(node, '::after').display)).not.toBe('none');
    expect(await page.locator('#chessboard .square-e4').evaluate(node =>
        getComputedStyle(node, '::after').display)).not.toBe('none');

    await setSetting(page, 'legal-moves', false);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().legalTargets))
        .toEqual(['e4']);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect(page.locator('body')).not.toHaveClass(/caissa-coach-hint-active/);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().legalTargets)).toEqual([]);
    runtime.assertClean();
});

test('Coach Hint stays stronger than ordinary legal targets when Legal Moves is on', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await startMode(page, MODES[2]);
    await selectSquare(page, 'e2');
    const ordinary = await page.locator('#chessboard .square-e4').evaluate(node => ({
        width: parseFloat(getComputedStyle(node, '::after').width),
        border: parseFloat(getComputedStyle(node, '::after').borderTopWidth) || 0
    }));
    await selectSquare(page, 'e2');
    await page.evaluate(() => {
        window.App.boardAdapter.setLastMove({ from: 'e2', to: 'e4' });
        window.App.currentEvaluation = { fen: window.App.game.fen(), bestMove: 'e2e4' };
    });
    await page.locator('[data-active-game-action="coach-hint"]').click();
    const hint = await page.locator('#chessboard .square-e4').evaluate(node => ({
        width: parseFloat(getComputedStyle(node, '::after').width),
        border: parseFloat(getComputedStyle(node, '::after').borderTopWidth) || 0,
        zIndex: Number(getComputedStyle(node, '::after').zIndex),
        lastMoveZIndex: Number(getComputedStyle(node, '::before').zIndex)
    }));
    if (Number.isFinite(ordinary.width)) expect(hint.width).toBeGreaterThan(ordinary.width);
    expect(hint.border).toBeGreaterThan(ordinary.border);
    expect(hint.zIndex).toBeGreaterThan(hint.lastMoveZIndex);
});

test('opponent last move follows active play, navigation, Undo, reset, Flip, resize and Settings', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    await startGame(page);

    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove)).toBeNull();
    await expect(page.locator('#chessboard .caissa-board-last-move')).toHaveCount(0);
    expect(await playMove(page, 'e7', 'e5')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e7', to: 'e5' });
    expect(await playMove(page, 'g1', 'f3')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e7', to: 'e5' });
    expect(await playMove(page, 'b8', 'c6')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'b8', to: 'c6' });

    await page.evaluate(() => window.navigateToPrevious());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e7', to: 'e5' });
    await page.evaluate(() => window.navigateToStart());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove)).toBeNull();
    await page.evaluate(() => window.navigateToEnd());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'b8', to: 'c6' });

    await page.evaluate(() => window.undoMove());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e7', to: 'e5' });
    await page.evaluate(() => { window.flipBoard(); window.App.board.resize(); });
    await expect(page.locator('#chessboard')).toHaveAttribute('data-orientation', 'black');
    await expect(page.locator('#chessboard .square-e7')).toHaveClass(/caissa-board-last-move/);
    await expect(page.locator('#chessboard .square-e5')).toHaveClass(/caissa-board-last-move/);

    await setSetting(page, 'last-move', false);
    expect(await page.locator('#chessboard .square-e5').evaluate(node =>
        getComputedStyle(node, '::before').display)).toBe('none');
    await setSetting(page, 'last-move', true);
    expect(await page.locator('#chessboard .square-e5').evaluate(node =>
        getComputedStyle(node, '::before').display)).not.toBe('none');

    await page.evaluate(() => window.prepareNativePlaySetup());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove)).toBeNull();
});

test('opponent last move uses playerColor when the user plays Black', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await page.goto('/play/coach');
    await page.locator('[data-color-token="black"]').click();
    await page.locator('[data-coach-primary]').click();
    await expect.poll(() => page.evaluate(() => window.App.gameActive)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.playerColor)).toBe('black');
    await page.waitForFunction(() => window.__caissaPlayHarness.snapshot().workerMessages
        .some(message => message.startsWith('go')));
    await page.evaluate(() => window.__caissaPlayHarness.emit(
        window.__caissaPlayHarness.state.workers.length - 1, 'bestmove e2e4'));
    await expect.poll(() => page.evaluate(() => window.App.moveHistory.length)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e2', to: 'e4' });
    expect(await playMove(page, 'e7', 'e5')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e2', to: 'e4' });
});

for (const mode of MODES.slice(1)) {
    test(`${mode.name} reply becomes the authoritative last move`, async ({ page }) => {
        await instrumentPlay(page, { autoReply: true, bestMoves: ['e7e5'], delayMs: 10 });
        await startMode(page, mode);
        expect(await playMove(page, 'e2', 'e4')).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.moveHistory.length)).toBe(2);
        const expected = await page.evaluate(() => {
            const move = window.App.moveHistory.at(-1);
            return { from: move.from, to: move.to };
        });
        await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
            .toEqual(expected);
        const destination = page.locator(`#chessboard .square-${expected.to}`);
        const destinationPiece = destination.locator('.piece-417db');
        await expect(destinationPiece).toBeVisible();
        const squareZ = await destination.evaluate(node => Number(getComputedStyle(node, '::before').zIndex));
        const pieceStyle = await destinationPiece.evaluate(node => {
            const style = getComputedStyle(node);
            return { zIndex: Number(style.zIndex), opacity: style.opacity, filter: style.filter };
        });
        expect(pieceStyle.zIndex).toBeGreaterThan(squareZ);
        expect(pieceStyle.opacity).toBe('1');
        expect(['none', '']).toContain(pieceStyle.filter);
    });
}

test('Coach Review projects one authoritative selected-ply board contract', async ({ page }) => {
    await instrumentPlay(page, { autoReply: true, bestMoves: ['e7e5'], delayMs: 10 });
    await startMode(page, MODES[2]);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.moveHistory.length)).toBe(2);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect.poll(() => page.evaluate(() => typeof window.AnalyzeSection)).toBe('object');
    await expect(page.locator('[data-caissa-coach-review-summary]')).toBeVisible();
    const line = await page.evaluate(() => {
        const analysis = window.AnalyzeSection;
        analysis.loadGameFromPgn('1. e4 d5 2. exd5 Qxd5 3. Nc3 Qd8 4. Nf3 Nf6 5. Bb5+ Bd7 6. O-O', 'Coach sync fixture');
        const moves = analysis.getLoadedMoves({ verbose: true });
        const replay = new window.Chess();
        analysis.analysisResults = moves.map((move, index) => {
            const fenBefore = replay.fen(); replay.move(move.san); const fenAfter = replay.fen();
            return { moveIndex: index, quality: index % 3 === 0 ? 'Mistake' : 'Inaccuracy',
                annotation: index % 3 === 0 ? '?' : '?!', fenBefore, fenAfter, move: move.san,
                bestMoveSan: 'a3', recommendationAvailable: true, evalBefore: index / 10,
                evalAfter: (index + 1) / 10, loss: .8, mateBefore: null, mateAfter: null };
        });
        analysis.analysisPhase = 'complete';
        analysis.updateMoveList(); analysis.jumpToMove(0);
        return moves.map((move, index) => ({ index, from: move.from, to: move.to, san: move.san,
            fenBefore: analysis.analysisResults[index].fenBefore, fenAfter: analysis.analysisResults[index].fenAfter,
            annotation: analysis.analysisResults[index].annotation,
            quality: analysis.analysisResults[index].quality,
            evalAfter: analysis.analysisResults[index].evalAfter }));
    });

    const genericNegative = await page.evaluate(() => {
        const analysis = window.AnalyzeSection;
        document.body.classList.remove('caissa-coach-review-summary-active');
        analysis.jumpToMove(1);
        const boardFen = window.App.boardAdapter.getPosition();
        document.body.classList.add('caissa-coach-review-summary-active');
        analysis.jumpToMove(1);
        return { boardFen, fenBefore: analysis.analysisResults[1].fenBefore };
    });
    expect(genericNegative.boardFen).toBe(genericNegative.fenBefore);

    await page.getByRole('button', { name: 'Start Review' }).click();
    const assertSelectedPly = async index => {
        await page.evaluate(value => window.AnalyzeSection.jumpToMove(value), index);
        await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(index);
        const expected = line[index];
        const proof = await page.evaluate(() => {
            const analysis = window.AnalyzeSection;
            const index = analysis.currentMoveIndex;
            const result = analysis.analysisResults[index];
            const move = analysis.getLoadedMoves({ verbose: true })[index];
            const projection = analysis.getCoachReviewProjection();
            const badge = document.querySelector('[data-caissa-coach-move-annotation]');
            const activeNotation = document.querySelector('#analyzeMoveList .active');
            return { boardFen: window.App.boardAdapter.getPosition(), projection,
                lastMove: window.App.boardAdapter.getSnapshot().lastMove,
                destinationHasPiece: !!document.querySelector(`#chessboard .square-${move.to} .piece-417db`),
                badgeSquare: badge?.parentElement?.className.match(/square-([a-h][1-8])/)?.[1] || null,
                badgeText: badge?.textContent || '', activeIndex: Number(activeNotation?.dataset.index),
                head: document.querySelector('[data-coach-narration]')?.textContent || '',
                railCp: window.CaissaEvaluationRailInstance.getSnapshot().scoreCp,
                resultQuality: result.quality };
        });
        expect(proof.boardFen).toBe(expected.fenAfter);
        expect(proof.projection).toMatchObject({ fen: expected.fenAfter,
            move: { from: expected.from, to: expected.to }, authoritativeIndex: index,
            displayedMoveIndex: index, showsFenBefore: false });
        expect(proof.lastMove).toEqual({ from: expected.from, to: expected.to });
        expect(proof.destinationHasPiece).toBe(true);
        expect(proof.badgeSquare).toBe(expected.to);
        expect(proof.badgeText).toBe(expected.annotation);
        expect(proof.activeIndex).toBe(index);
        expect(proof.head).toContain(expected.san);
        expect(proof.head.toUpperCase()).toContain(expected.quality.toUpperCase());
        expect(proof.railCp).toBe(Math.round(expected.evalAfter * 100));
    };

    await assertSelectedPly(0); // White negative quiet pawn move.
    await page.locator('[data-coach-guided-next]').click();
    await assertSelectedPly(1); // Black ...d5 reproduction and two-sided Next Moment.
    await page.locator('#analyzeNavNext').click();
    await assertSelectedPly(2); // White capture.
    await page.locator('#analyzeNavNext').click();
    await assertSelectedPly(3); // Black capture.
    await page.locator('#analyzeNavPrev').click();
    await assertSelectedPly(2); // Literal Previous restores the preceding ply.
    await assertSelectedPly(10); // White castling.

    await page.locator('[data-coach-guided-analysis]').click();
    await expect(page.locator('[data-coach-analysis-exploration]')).toBeVisible();
    await page.locator('[data-coach-exploration-back]').click();
    await assertSelectedPly(10); // Exploration returns to the exact authoritative ply.

    const promotion = await page.evaluate(() => {
        const analysis = window.AnalyzeSection;
        const pgn = '[SetUp "1"]\n[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. a8=Q+';
        analysis.loadGameFromPgn(pgn, 'Coach promotion sync fixture');
        const move = analysis.getLoadedMoves({ verbose: true })[0];
        const replay = new window.Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
        const fenBefore = replay.fen(); replay.move(move.san); const fenAfter = replay.fen();
        analysis.analysisResults = [{ moveIndex: 0, quality: 'Mistake', annotation: '?', fenBefore, fenAfter,
            move: move.san, evalBefore: 0, evalAfter: -1, loss: 1, mateBefore: null, mateAfter: null }];
        analysis.analysisPhase = 'complete'; analysis.updateMoveList(); analysis.jumpToMove(0);
        return { move: { from: move.from, to: move.to }, fenAfter,
            boardFen: window.App.boardAdapter.getPosition(), lastMove: window.App.boardAdapter.getSnapshot().lastMove,
            promotedPiece: !!document.querySelector('#chessboard .square-a8 .piece-417db'),
            badgeSquare: document.querySelector('[data-caissa-coach-move-annotation]')?.parentElement
                ?.className.match(/square-([a-h][1-8])/)?.[1] || null };
    });
    expect(promotion).toMatchObject({ boardFen: promotion.fenAfter, lastMove: promotion.move,
        promotedPiece: true, badgeSquare: 'a8' });
});
