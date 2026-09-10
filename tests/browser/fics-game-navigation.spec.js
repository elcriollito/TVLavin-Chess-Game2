import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Chess } from 'chess.js';

const START_FEN = new Chess().fen();

function gameLine(sans, initialFen = START_FEN) {
    const game = new Chess(initialFen);
    return sans.map((san, index) => {
        const played = game.move(san);
        if (!played) throw new Error(`Invalid fixture move: ${san}`);
        return {
            moveNumber: Math.floor(index / 2) + Number(initialFen.split(' ')[5] || 1),
            color: played.color === 'w' ? 'white' : 'black', san: played.san, fen: game.fen()
        };
    });
}

async function openFics(page, viewport = { width: 1600, height: 1000 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { window.CAISSA_FICS_AUTO_GUEST_ENABLED = false; });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
}

async function installGame(page, options = {}) {
    const moves = options.moves || gameLine(['e4', 'e5', 'Nf3', 'Nc6']);
    const initialFen = options.initialFen || START_FEN;
    const mode = options.mode || 'playing';
    const ended = mode === 'ended';
    const observing = options.observing === true || mode === 'observing';
    await page.evaluate(({ moves, initialFen, mode, ended, observing, gameNumber }) => {
        const client = window.CaissaFICSClient;
        window.__rd8Wire = [];
        client.ws = { readyState: WebSocket.OPEN, send(value) { window.__rd8Wire.push(value); }, close() {} };
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected', loginMode: 'guest',
            ficsUsername: 'GuestRD8', sessionGeneration: 18, gameActive: mode === 'playing',
            myColor: mode === 'playing' ? 'white' : null, moveHistory: moves.map(move => ({ ...move })),
            pgnStartFen: initialFen, pgnResult: ended ? '1-0' : '*',
            pendingMove: null, pendingPromotionMove: null, pendingGameActions: { resign: false, draw: false },
            liveGame: {
                ...client.createEmptyLiveGameState(mode), gameNumber, whiteName: 'Alpha', blackName: 'Beta',
                userColor: mode === 'playing' ? 'white' : null, relation: mode === 'playing' ? 1 : 0,
                sideToMove: moves.at(-1)?.fen?.split(' ')[1] || 'w', whiteClock: 280, blackClock: 276,
                currentFen: moves.at(-1)?.fen || initialFen, gameActive: mode === 'playing',
                observedGame: observing, status: mode, result: ended ? '1-0' : null,
                resultModel: ended ? { result: '1-0', winner: 'Alpha', loser: 'Beta',
                    terminationReason: 'CHECKMATE', terminal: true, summary: 'Alpha won by checkmate.' } : null
            }
        });
        client.chess?.load?.(client.liveGame.currentFen);
        const board = client.board;
        const originalPosition = board.position.bind(board);
        window.__rd8Board = board;
        window.__rd8BoardPositions = [];
        board.position = (fen, animate) => {
            window.__rd8BoardPositions.push(fen);
            return originalPosition(fen, animate);
        };
        client.updatePlayerBars();
        window.CaissaFICSShell.refresh();
    }, { moves, initialFen, mode, ended, observing, gameNumber: options.gameNumber || 801 });
    return { moves, initialFen };
}

test('Game tab is absent in lobby, contextual in game states, and replaces the old return control', async ({ page }) => {
    await openFics(page);
    await expect(page.getByRole('tab', { name: 'Game' })).toBeHidden();
    const { moves } = await installGame(page);
    await expect(page.getByRole('tab', { name: 'Game' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Game' })).toHaveAttribute('aria-selected', 'true');
    const before = await page.evaluate(() => JSON.stringify({
        liveGame: window.CaissaFICSClient.liveGame, moves: window.CaissaFICSClient.moveHistory,
        board: window.CaissaFICSClient.board === window.__rd8Board
    }));
    for (const view of ['Tables', 'Players', 'Seek']) {
        await page.getByRole('tab', { name: view }).click();
        await expect(page.getByRole('tab', { name: 'Game' })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Return to active FICS game/ })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Game' }).click();
    await expect(page.locator('[data-fics-body-view="game"]')).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify({
        liveGame: window.CaissaFICSClient.liveGame, moves: window.CaissaFICSClient.moveHistory,
        board: window.CaissaFICSClient.board === window.__rd8Board
    }))).toBe(before);
    expect(moves).toHaveLength(4);
});

test('notation click and keyboard navigate existing board while active move input fails closed', async ({ page }) => {
    await openFics(page);
    const { moves, initialFen } = await installGame(page);
    const canonicalBefore = await page.evaluate(() => JSON.stringify(window.CaissaFICSClient.liveGame));

    await page.locator('[data-fics-game-ply="2"]').click();
    await expect(page.locator('[data-fics-game-ply="2"]')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByText(/Reviewing move 2 of 4/)).toBeVisible();
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot().currentPly)).toBe(2);
    expect(await page.evaluate(() => window.__rd8BoardPositions.at(-1))).toBe(moves[1].fen);
    expect(await page.evaluate(() => window.CaissaFICSClient.canSubmitGraphicalMove())).toBe(false);
    expect(await page.evaluate(() => window.CaissaFICSClient.onDrop('g1', 'f3'))).toBe('snapback');
    expect(await page.evaluate(() => window.__rd8Wire)).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(window.CaissaFICSClient.liveGame))).toBe(canonicalBefore);

    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot().currentPly)).toBe(1);
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot().currentPly)).toBe(2);
    await page.keyboard.press('Home');
    expect(await page.evaluate(() => window.__rd8BoardPositions.at(-1))).toBe(initialFen);
    await page.keyboard.press('End');
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot().currentPly)).toBe(4);
    expect(await page.evaluate(() => window.CaissaFICSClient.canSubmitGraphicalMove())).toBe(true);

    await page.keyboard.press('ArrowLeft');
    await page.locator('#ficsConsoleToggle').click();
    await page.locator('#ficsCommandInput').focus();
    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot().currentPly)).toBe(3);
    await page.locator('.fics-rd7-session-button').click();
    await page.getByRole('menuitem', { name: 'Connect as User' }).click();
    await page.locator('#ficsAccountUsername').focus();
    await page.keyboard.press('Home');
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot().currentPly)).toBe(3);
});

test('live cursor auto-follows, historical cursor stays put, and Live returns to newest move', async ({ page }) => {
    await openFics(page);
    const line = gameLine(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    await installGame(page, { moves: line.slice(0, 4) });
    await page.evaluate(move => {
        const client = window.CaissaFICSClient;
        client.moveHistory.push(move);
        client.liveGame.currentFen = move.fen;
        client.liveGame.sideToMove = move.fen.split(' ')[1];
        window.CaissaFICSShell.refresh();
    }, line[4]);
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot().currentPly)).toBe(5);

    await page.keyboard.press('ArrowLeft');
    await page.evaluate(move => {
        const client = window.CaissaFICSClient;
        client.moveHistory.push(move);
        client.liveGame.currentFen = move.fen;
        client.liveGame.sideToMove = move.fen.split(' ')[1];
        client.board.position(move.fen, false);
        window.CaissaFICSShell.refresh();
    }, line[5]);
    const reviewing = await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot());
    expect(reviewing).toMatchObject({ currentPly: 4, latestPly: 6, isReviewingHistory: true, newerMoves: 2 });
    expect(await page.evaluate(() => window.__rd8BoardPositions.at(-1))).toBe(line[3].fen);
    await expect(page.getByText(/2 newer moves/)).toBeVisible();
    await page.getByRole('button', { name: 'Return to live position' }).click();
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot())).toMatchObject({
        currentPly: 6, latestPly: 6, isReviewingHistory: false, followingLive: true
    });
    expect(await page.evaluate(() => window.__rd8BoardPositions.at(-1))).toBe(line[5].fen);
});

test('captured FEN navigation preserves castling promotion en passant check and checkmate positions', async ({ page }) => {
    await openFics(page);
    const scenarios = [
        { name: 'castling', initialFen: START_FEN, moves: gameLine(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']) },
        { name: 'promotion', initialFen: '7k/P7/8/8/8/8/8/7K w - - 0 1',
            moves: gameLine(['a8=Q+'], '7k/P7/8/8/8/8/8/7K w - - 0 1') },
        { name: 'en-passant', initialFen: START_FEN, moves: gameLine(['e4', 'a6', 'e5', 'd5', 'exd6']) },
        { name: 'checkmate', initialFen: START_FEN, moves: gameLine(['f3', 'e5', 'g4', 'Qh4#']) }
    ];
    for (let index = 0; index < scenarios.length; index += 1) {
        const scenario = scenarios[index];
        await installGame(page, { ...scenario, gameNumber: 820 + index });
        const target = Math.max(1, scenario.moves.length - 1);
        await page.locator(`[data-fics-game-ply="${target}"]`).click();
        expect(await page.evaluate(() => window.__rd8BoardPositions.at(-1)), scenario.name)
            .toBe(scenario.moves[target - 1].fen);
        await page.keyboard.press('End');
        expect(await page.evaluate(() => window.__rd8BoardPositions.at(-1)), `${scenario.name} final`)
            .toBe(scenario.moves.at(-1).fen);
    }
});

test('Game Over Analyze hands complete PGN to current Analyze ingestion and dismissal hides Game only', async ({ page }) => {
    await openFics(page);
    await installGame(page, { mode: 'ended', moves: gameLine(['f3', 'e5', 'g4', 'Qh4#']) });
    await expect(page.getByRole('tab', { name: 'Game' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Alpha won by checkmate.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analyze', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection?.loadedGame?.source)).toBe('FICS handoff');
    expect(await page.evaluate(() => ({
        status: window.AnalyzeSection.loadedGame.recordStatus,
        white: window.AnalyzeSection.loadedGame.white,
        black: window.AnalyzeSection.loadedGame.black,
        result: window.AnalyzeSection.loadedGame.result,
        moves: window.AnalyzeSection.loadedGame.movesSan.length
    }))).toEqual({ status: 'complete', white: 'Alpha', black: 'Beta', result: '1-0', moves: 4 });
});

test('contextual Game and replay affordance remain accessible and responsive', async ({ page }) => {
    await openFics(page, { width: 390, height: 844 });
    await installGame(page, { mode: 'ended', moves: gameLine(['e4', 'e5', 'Nf3', 'Nc6']) });
    await expect(page.getByRole('tab', { name: 'Game' })).toBeVisible();
    await page.locator('[data-fics-game-ply="2"]').click();
    await expect(page.getByRole('button', { name: 'Return to final position' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analyze', exact: true })).toBeVisible();
    const geometry = await page.evaluate(() => {
        const section = document.getElementById('ficsSection');
        return { overflow: section.scrollWidth - section.clientWidth,
            tabs: [...document.querySelectorAll('.fics-rd2-tab:not([hidden])')].map(node => node.textContent.trim()) };
    });
    expect(geometry).toEqual({ overflow: 0, tabs: ['Tables', 'Players', 'Seek', 'Game'] });
    const axe = await new AxeBuilder({ page }).include('.fics-rd2-workspace').analyze();
    expect(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
