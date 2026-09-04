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
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e2', to: 'e4' });
});

test('capture targets use the adapter capture ring and clear with selection', async ({ page }) => {
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
    expect(parseFloat(style.border)).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => window.handlePlayBoardSquareSelection('c3'));
    await expect(page.locator('#chessboard .caissa-board-legal-target')).toHaveCount(0);
});

test('last move follows move completion, navigation, Undo, reset, Flip, resize and Settings', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    await startGame(page);

    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e2', to: 'e4' });
    await expect(page.locator('#chessboard .caissa-board-last-move')).toHaveCount(2);
    expect(await playMove(page, 'e7', 'e5')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e7', to: 'e5' });

    await page.evaluate(() => window.navigateToPrevious());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e2', to: 'e4' });
    await page.evaluate(() => window.navigateToStart());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove)).toBeNull();
    await page.evaluate(() => window.navigateToEnd());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: 'e7', to: 'e5' });

    await page.evaluate(() => window.undoMove());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove)).toBeNull();

    expect(await playMove(page, 'd2', 'd4')).toBe(true);
    await page.evaluate(() => { window.flipBoard(); window.App.board.resize(); });
    await expect(page.locator('#chessboard')).toHaveAttribute('data-orientation', 'black');
    await expect(page.locator('#chessboard .square-d2')).toHaveClass(/caissa-board-last-move/);
    await expect(page.locator('#chessboard .square-d4')).toHaveClass(/caissa-board-last-move/);

    await setSetting(page, 'last-move', false);
    expect(await page.locator('#chessboard .square-d4').evaluate(node =>
        getComputedStyle(node, '::before').display)).toBe('none');
    await setSetting(page, 'last-move', true);
    expect(await page.locator('#chessboard .square-d4').evaluate(node =>
        getComputedStyle(node, '::before').display)).not.toBe('none');

    await page.evaluate(() => window.prepareNativePlaySetup());
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove)).toBeNull();
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
    });
}

test('Coach Review projects currentMoveIndex and preserves fenBefore presentation semantics', async ({ page }) => {
    await instrumentPlay(page, { autoReply: true, bestMoves: ['e7e5'], delayMs: 10 });
    await startMode(page, MODES[2]);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.moveHistory.length)).toBe(2);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect.poll(() => page.evaluate(() => typeof window.AnalyzeSection)).toBe('object');
    await expect(page.locator('[data-caissa-coach-review-summary]')).toBeVisible();
    const moves = await page.evaluate(() => window.AnalyzeSection.getLoadedMoves({ verbose: true })
        .map(move => ({ from: move.from, to: move.to, san: move.san })));

    await page.evaluate(() => window.AnalyzeSection.jumpToMove(-1));
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove)).toBeNull();
    await page.evaluate(() => window.AnalyzeSection.jumpToMove(0));
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: moves[0].from, to: moves[0].to });
    await page.evaluate(() => window.AnalyzeSection.jumpToMove(1));
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: moves[1].from, to: moves[1].to });
    await page.evaluate(() => window.AnalyzeSection.jumpToMove(0));
    await page.evaluate(() => window.AnalyzeSection.jumpToMove(1));
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: moves[1].from, to: moves[1].to });

    await page.evaluate((firstSan) => {
        const analysis = window.AnalyzeSection;
        const replay = new window.Chess();
        replay.move(firstSan);
        analysis.analysisPhase = 'complete';
        analysis.analysisResults[1] = {
            quality: 'Mistake', fenBefore: replay.fen(), move: analysis.getLoadedMoves()[1],
            bestMoveSan: '', beforePlayerEval: 0.2, afterPlayerEval: -1, loss: 1.2,
            mateBefore: null, mateAfter: null
        };
        analysis.jumpToMove(1);
    }, moves[0].san);
    expect(await page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove))
        .toEqual({ from: moves[0].from, to: moves[0].to });
});
