import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Chess } from 'chess.js';

const START_FEN = new Chess().fen();
const TWENTY_MOVES = Object.freeze([
    'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7',
    'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7'
]);

function line(sans, initialFen = START_FEN, gameNumber = 606) {
    const game = new Chess(initialFen);
    return sans.map((san, index) => {
        const move = game.move(san);
        if (!move) throw new Error(`Invalid BOARD-006 fixture move: ${san}`);
        return {
            fen: game.fen(), gameNumber, whiteName: 'FixtureWhite', blackName: 'FixtureBlack',
            relation: 0, userColor: null, sideToMove: game.turn(), lastMove: move.san,
            lastMoveVerbose: { from: move.from, to: move.to, flags: move.flags,
                captured: move.captured || null, promotion: move.promotion || null },
            moveNumber: Number(game.fen().split(' ')[5]), whiteClock: 600 - index,
            blackClock: 600 - index, initialTime: 10, increment: 0, observedGame: true
        };
    });
}

function snapshot(fen, gameNumber = 606) {
    return {
        fen, gameNumber, whiteName: 'FixtureWhite', blackName: 'FixtureBlack',
        relation: 0, userColor: null, sideToMove: fen.split(' ')[1], lastMove: 'none',
        lastMoveVerbose: 'none', moveNumber: Number(fen.split(' ')[5]), whiteClock: 600,
        blackClock: 600, initialTime: 10, increment: 0, observedGame: true
    };
}

async function openFics(page, { pilot, viewport = { width: 390, height: 844 } } = {}) {
    await page.setViewportSize(viewport);
    await page.addInitScript(enabled => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
        if (typeof enabled === 'boolean') window.CAISSA_FICS_PERSISTENT_BOARD_PILOT = enabled;
    }, pilot);
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true
        && document.querySelectorAll('#ficsBoardContainer .piece-417db').length === 32);
}

async function beginObserve(page, fen = START_FEN, gameNumber = 606) {
    await page.evaluate(value => {
        const client = window.CaissaFICSClient;
        window.__board006Wire = [];
        client.sendMove = move => window.__board006Wire.push(move);
        Object.assign(client, { connected: true, authenticated: true, connectionState: 'connected' });
        client.handleStyle12(value);
    }, snapshot(fen, gameNumber));
    await page.evaluate(() => window.CaissaFICSClient.waitForBoardRendererIdle());
}

async function playStates(page, states, awaitEach = true) {
    await page.evaluate(async ({ values, each }) => {
        const client = window.CaissaFICSClient;
        for (const value of values) {
            client.handleStyle12(value);
            if (each) await client.waitForBoardRendererIdle();
        }
        await client.waitForBoardRendererIdle();
    }, { values: states, each: awaitEach });
}

async function mutationCapture(page, callback) {
    await page.evaluate(() => {
        const root = document.querySelector('#ficsBoardContainer .caissa-board, #ficsBoardContainer .board-b72b1');
        window.__board006Mutations = [];
        window.__board006Observer = new MutationObserver(records => window.__board006Mutations.push(...records));
        window.__board006Observer.observe(root, { subtree: true, childList: true, attributes: true });
    });
    await callback();
    return page.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.__board006Mutations.push(...window.__board006Observer.takeRecords());
        window.__board006Observer.disconnect();
        const result = { records: 0, added: 0, removed: 0, attributes: 0 };
        for (const record of window.__board006Mutations) {
            result.records += 1;
            if (record.type === 'childList') {
                result.added += record.addedNodes.length;
                result.removed += record.removedNodes.length;
            } else result.attributes += 1;
        }
        return result;
    });
}

test('flag OFF preserves the unwrapped legacy FICS board path', async ({ page }) => {
    await openFics(page, { pilot: false });
    expect(await page.evaluate(() => window.CaissaFICSClient.boardView)).toBe(null);
    await beginObserve(page);
    await expect(page.locator('#ficsBoardContainer .board-b72b1')).toHaveCount(1);
    await expect(page.locator('#ficsBoardContainer .caissa-board')).toHaveCount(0);
    expect(await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().renderer)).toBe('legacy');
});

test('Observe activation is read-only, single-renderer, accessible, reduced-motion aware and Play-safe', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFics(page);
    await beginObserve(page);
    await expect(page.locator('#ficsBoardContainer > .caissa-board')).toHaveCount(1);
    await expect(page.locator('#ficsBoardContainer .board-b72b1')).toHaveCount(0);
    await expect(page.locator('#ficsBoardContainer .caissa-board__square')).toHaveCount(64);
    const state = await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        const root = document.querySelector('#ficsBoardContainer .caissa-board');
        const piece = root.querySelector('.caissa-board__piece');
        root.querySelector('[data-square="e2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return {
            renderer: client.getBoardRendererSnapshot(), wire: window.__board006Wire,
            boardCount: document.querySelectorAll('#ficsBoardContainer > *').length,
            role: root.getAttribute('role'), label: root.getAttribute('aria-label'),
            disabled: root.getAttribute('aria-disabled'), transition: getComputedStyle(piece).transitionDuration,
            playImportsPilot: [...document.scripts].some(script => /play.*fics-board-view|fics-board-view.*play/i.test(script.src))
        };
    });
    expect(state.renderer).toMatchObject({ renderer: 'persistent', eligible: true, readOnly: true });
    expect(state.renderer.metrics.inputEvents).toBe(0);
    expect(state.wire).toEqual([]);
    expect(state.boardCount).toBe(1);
    expect(state.role).toBe('grid');
    expect(state.label).toContain('FICS observed game chessboard');
    expect(state.disabled).toBe('true');
    expect(state.transition).toBe('0s');
    expect(state.playImportsPilot).toBe(false);
    const axe = await new AxeBuilder({ page }).include('#ficsBoardContainer').analyze();
    expect(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});

test('quiet, capture, castling and promotion retain exactly the intended DOM identities', async ({ page }) => {
    await openFics(page);
    await beginObserve(page);
    await page.evaluate(() => {
        window.__board006QuietMover = document.querySelector('.caissa-board__piece[data-square="e2"]');
        window.__board006QuietUnaffected = document.querySelector('.caissa-board__piece[data-square="a1"]');
    });
    const quietMutation = await mutationCapture(page, () => playStates(page, line(['e4']).slice(-1)));
    const quiet = await page.evaluate(() => ({
        moverPreserved: window.__board006QuietMover === document.querySelector('.caissa-board__piece[data-square="e4"]'),
        unaffectedPreserved: window.__board006QuietUnaffected === document.querySelector('.caissa-board__piece[data-square="a1"]')
    }));
    expect(quiet).toEqual({ moverPreserved: true, unaffectedPreserved: true });
    expect(quietMutation.added).toBe(0);
    expect(quietMutation.removed).toBe(0);

    await page.evaluate(() => {
        window.__board006Rook = document.querySelector('.caissa-board__piece[data-square="h1"]');
        window.__board006King = document.querySelector('.caissa-board__piece[data-square="e1"]');
    });
    await beginObserve(page, START_FEN, 607);
    await playStates(page, line(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], START_FEN, 607));
    await page.evaluate(() => {
        window.__board006Rook = document.querySelector('.caissa-board__piece[data-square="h1"]');
        window.__board006King = document.querySelector('.caissa-board__piece[data-square="e1"]');
    });
    const castleMutation = await mutationCapture(page,
        () => playStates(page, line(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O'], START_FEN, 607).slice(-1)));
    expect(await page.evaluate(() => window.__board006King === document.querySelector('.caissa-board__piece[data-square="g1"]'))).toBe(true);
    expect(await page.evaluate(() => window.__board006Rook === document.querySelector('.caissa-board__piece[data-square="f1"]'))).toBe(true);
    expect(castleMutation.added).toBe(0);
    expect(castleMutation.removed).toBe(0);

    await beginObserve(page, START_FEN, 608);
    await playStates(page, line(['e4', 'd5'], START_FEN, 608));
    await page.evaluate(() => {
        window.__board006Attacker = document.querySelector('.caissa-board__piece[data-square="e4"]');
        window.__board006Victim = document.querySelector('.caissa-board__piece[data-square="d5"]');
    });
    const captureMutation = await mutationCapture(page,
        () => playStates(page, line(['e4', 'd5', 'exd5'], START_FEN, 608).slice(-1)));
    expect(await page.evaluate(() => window.__board006Attacker === document.querySelector('.caissa-board__piece[data-square="d5"]'))).toBe(true);
    expect(await page.evaluate(() => window.__board006Victim.isConnected)).toBe(false);
    expect(captureMutation.added).toBe(0);
    expect(captureMutation.removed).toBe(1);

    const promotionStart = '7k/P7/8/8/8/8/8/7K w - - 0 1';
    await beginObserve(page, promotionStart, 609);
    await page.evaluate(() => { window.__board006Pawn = document.querySelector('.caissa-board__piece[data-square="a7"]'); });
    const promotionMutation = await mutationCapture(page,
        () => playStates(page, line(['a8=Q+'], promotionStart, 609)));
    expect(await page.evaluate(() => window.__board006Pawn.isConnected)).toBe(false);
    expect(await page.locator('.caissa-board__piece[data-square="a8"]').getAttribute('data-piece')).toBe('wQ');
    expect(promotionMutation.added).toBe(1);
    expect(promotionMutation.removed).toBe(1);
});

test('20 moves, duplicate FEN, reconnect snapshot, 50-update burst and 100-position soak converge', async ({ page, browserName }) => {
    await openFics(page);
    await beginObserve(page);
    await page.evaluate(() => {
        window.__board006SoakRoot = document.querySelector('.caissa-board');
        window.__board006SoakSquares = [...document.querySelectorAll('.caissa-board__square')];
    });
    const twentyMutation = await mutationCapture(page, () => playStates(page, line(TWENTY_MOVES)));
    const twentyFen = line(TWENTY_MOVES).at(-1).fen;
    expect(await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().position)).toBe(twentyFen.split(' ')[0]);
    expect(await page.evaluate(() => window.__board006SoakRoot === document.querySelector('.caissa-board'))).toBe(true);
    expect(await page.evaluate(() => window.__board006SoakSquares.every((node, index) => node === document.querySelectorAll('.caissa-board__square')[index]))).toBe(true);

    const duplicateBefore = await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().metrics.duplicatePositions);
    await playStates(page, [snapshot(twentyFen)]);
    expect(await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().metrics.duplicatePositions)).toBe(duplicateBefore + 1);

    const recovery = '7k/8/8/8/3Q4/8/8/K7 b - - 0 41';
    await playStates(page, [snapshot(recovery)]);
    expect(await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().position)).toBe(recovery.split(' ')[0]);

    const knightB1 = '7k/8/8/8/8/8/8/KN6 w - - 0 1';
    const knightC3 = '7k/8/8/8/8/2N5/8/K7 w - - 0 1';
    await playStates(page, [snapshot(knightB1, 610)]);
    const burstBefore = await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().metrics.coalescedVisualUpdates);
    const burst = Array.from({ length: 50 }, (_, index) => snapshot(index === 49 || index % 2 === 0 ? knightC3 : knightB1, 610));
    await playStates(page, burst, false);
    const burstAfter = await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot());
    expect(burstAfter.position).toBe(knightC3.split(' ')[0]);
    expect(burstAfter.metrics.coalescedVisualUpdates - burstBefore).toBe(49);

    const soakMetricsBefore = await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().metrics.renderer.renderer);
    await page.evaluate(() => { window.__board006Knight = document.querySelector('.caissa-board__piece[data-square="c3"]'); });
    for (let index = 0; index < 100; index += 1) {
        await playStates(page, [snapshot(index % 2 === 0 ? knightB1 : knightC3, 610)]);
    }
    const final = await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot());
    const soakMetricsAfter = final.metrics.renderer.renderer;
    expect(final.position).toBe(knightC3.split(' ')[0]);
    expect(soakMetricsAfter.nodesAdded - soakMetricsBefore.nodesAdded).toBe(0);
    expect(soakMetricsAfter.nodesRemoved - soakMetricsBefore.nodesRemoved).toBe(0);
    expect(await page.evaluate(() => window.__board006Knight === document.querySelector('.caissa-board__piece[data-square="c3"]'))).toBe(true);
    expect(twentyMutation.added).toBe(0);
    expect(twentyMutation.removed).toBe(0);
    console.log(`[BOARD-006 ${browserName}]`, JSON.stringify({
        twenty: { fen: twentyFen, mutations: twentyMutation }, burst: burstAfter.metrics,
        soak: { generation: soakMetricsAfter.generation, nodesAdded: soakMetricsAfter.nodesAdded,
            nodesRemoved: soakMetricsAfter.nodesRemoved, final: final.position }
    }));
});

test('orientation, review/Live restore and portrait/landscape geometry remain stable', async ({ page }) => {
    await openFics(page);
    await beginObserve(page);
    const states = line(['e4', 'e5', 'Nf3', 'Nc6']);
    await playStates(page, states);
    const identities = await page.evaluate(() => {
        window.__board006Root = document.querySelector('.caissa-board');
        window.__board006Squares = [...document.querySelectorAll('.caissa-board__square')];
        window.CaissaFICSClient.setBoardOrientation('black');
        return window.CaissaFICSClient.board.orientation();
    });
    expect(identities).toBe('black');
    expect(await page.evaluate(() => window.__board006Root === document.querySelector('.caissa-board'))).toBe(true);
    expect(await page.evaluate(() => window.__board006Squares.every((node, index) => node === document.querySelectorAll('.caissa-board__square')[index]))).toBe(true);
    await page.evaluate(() => window.CaissaFICSClient.setBoardOrientation('white'));

    await page.locator('[data-fics-game-ply="2"]').click();
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot().currentPly)).toBe(2);
    expect(await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().position)).toBe(states[1].fen.split(' ')[0]);
    const newer = line(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']).at(-1);
    await playStates(page, [newer]);
    expect(await page.evaluate(() => window.CaissaFICSShell.getReplaySnapshot().isReviewingHistory)).toBe(true);
    expect(await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().position)).toBe(states[1].fen.split(' ')[0]);
    await page.getByRole('button', { name: 'Return to live position' }).click();
    expect(await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().position)).toBe(newer.fen.split(' ')[0]);

    const geometry = async () => page.locator('#ficsBoardContainer').evaluate(node => {
        const rect = node.getBoundingClientRect();
        const workspace = document.querySelector('.fics-rd2-workspace');
        const workspaceRect = workspace?.getBoundingClientRect();
        return {
            left: rect.left, top: rect.top, width: rect.width, height: rect.height, scrollX, scrollY,
            viewportWidth: innerWidth, viewportHeight: innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            documentHeight: document.documentElement.scrollHeight,
            workspaceWidth: workspaceRect?.width || 0,
            rootPreserved: window.__board006Root === document.querySelector('.caissa-board'),
            squaresPreserved: window.__board006Squares.every((square, index) =>
                square === document.querySelectorAll('.caissa-board__square')[index]),
            pieces: [...document.querySelectorAll('.caissa-board__piece')]
                .map(piece => piece.getAttribute('data-piece')).sort()
        };
    });
    const portraitBefore = await geometry();
    const portraitResizeBefore = await page.evaluate(() => window.CaissaFICSShell.getSnapshot().boardResizeCount);
    await playStates(page, [line(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']).at(-1)]);
    const portraitAfter = await geometry();
    for (const key of ['left', 'top', 'width', 'height']) expect(Math.abs(portraitAfter[key] - portraitBefore[key])).toBeLessThanOrEqual(1);
    expect(portraitAfter.scrollY).toBe(portraitBefore.scrollY);
    expect(await page.evaluate(() => window.CaissaFICSShell.getSnapshot().boardResizeCount)).toBe(portraitResizeBefore);
    expect(await page.evaluate(() => window.CaissaFICSClient.board.orientation())).toBe('white');

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(250);
    const landscapeBefore = await geometry();
    expect(landscapeBefore.width).toBeGreaterThanOrEqual(320);
    expect(Math.abs(landscapeBefore.width - landscapeBefore.height)).toBeLessThanOrEqual(1);
    expect(landscapeBefore.workspaceWidth).toBeGreaterThanOrEqual(300);
    expect(landscapeBefore.documentWidth).toBe(landscapeBefore.viewportWidth);
    expect(landscapeBefore.documentHeight).toBe(landscapeBefore.viewportHeight);
    expect(landscapeBefore.scrollX).toBe(0);
    expect(landscapeBefore.scrollY).toBe(0);
    expect(landscapeBefore.rootPreserved).toBe(true);
    expect(landscapeBefore.squaresPreserved).toBe(true);
    expect(landscapeBefore.pieces).toEqual(portraitBefore.pieces);
    const landscapeResizeBefore = await page.evaluate(() => window.CaissaFICSShell.getSnapshot().boardResizeCount);
    expect(landscapeResizeBefore).toBe(portraitResizeBefore + 1);
    await playStates(page, [line(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4']).at(-1)]);
    const landscapeAfter = await geometry();
    for (const key of ['left', 'top', 'width', 'height']) expect(Math.abs(landscapeAfter[key] - landscapeBefore[key])).toBeLessThanOrEqual(1);
    expect(landscapeAfter.scrollY).toBe(landscapeBefore.scrollY);
    expect(await page.evaluate(() => window.CaissaFICSShell.getSnapshot().boardResizeCount)).toBe(landscapeResizeBefore);
    expect(await page.evaluate(() => window.CaissaFICSClient.board.orientation())).toBe('white');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const portraitRestored = await geometry();
    console.log('[BOARD-006B ROTATION]', JSON.stringify({ portraitBefore, landscapeBefore, landscapeAfter, portraitRestored }));
    for (const key of ['left', 'width', 'height']) {
        expect(Math.abs(portraitRestored[key] - portraitBefore[key])).toBeLessThanOrEqual(1);
    }
    expect(portraitRestored.top).toBeGreaterThanOrEqual(0);
    expect(portraitRestored.top + portraitRestored.height).toBeLessThanOrEqual(portraitRestored.viewportHeight);
    expect(portraitRestored.rootPreserved).toBe(true);
    expect(portraitRestored.squaresPreserved).toBe(true);
    expect(portraitRestored.pieces).toEqual(portraitBefore.pieces);
    expect(portraitRestored.documentWidth).toBe(portraitRestored.viewportWidth);
    expect(portraitRestored.scrollX).toBe(0);
    expect(portraitRestored.scrollY).toBe(0);
    expect(await page.evaluate(() => window.CaissaFICSShell.getSnapshot().boardResizeCount))
        .toBe(landscapeResizeBefore + 1);
});

test('Guest reload restores one validated Observe through one canonical socket and Leave prevents replay', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
        window.CAISSA_FICS_PERSISTENT_BOARD_PILOT = true;
        window.CAISSA_FICS_GATEWAY_URL = 'ws://fixture.test/ws';
        window.__board006Sockets = [];

        const style12 = '<12> rnbqkbnr pppppppp -------- -------- -------- -------- PPPPPPPP RNBQKBNR W -1 1 1 1 1 0 23 FixtureWhite FixtureBlack 0 3 0 39 39 180 180 1 none (0:00) none 0';
        class FixtureWebSocket {
            static CONNECTING = 0;
            static OPEN = 1;
            static CLOSING = 2;
            static CLOSED = 3;

            constructor(url) {
                this.url = url;
                this.readyState = FixtureWebSocket.CONNECTING;
                this.commands = [];
                window.__board006Sockets.push(this);
                setTimeout(() => {
                    this.readyState = FixtureWebSocket.OPEN;
                    this.onopen?.();
                    this.emit('login:\n');
                }, 0);
            }

            emit(data) {
                setTimeout(() => this.onmessage?.({ data }), 0);
            }

            send(payload) {
                const value = typeof payload === 'string' ? payload : String(payload);
                this.commands.push(value);
                if (value === 'guest') this.emit('Press return to enter the server\n');
                if (value === '') this.emit('Starting FICS session as GuestABCD\nfics%\n');
                if (value === 'games') this.emit('23 1500 FixtureWhite 1600 FixtureBlack [ 3 0 ]\n');
                if (value === 'observe 23') this.emit(`${style12}\n`);
            }

            close() {
                this.readyState = FixtureWebSocket.CLOSED;
                setTimeout(() => this.onclose?.({ code: 1000, reason: 'fixture close' }), 0);
            }
        }
        window.WebSocket = FixtureWebSocket;
    });

    const connectAndWait = async () => {
        await page.waitForFunction(() => window.CaissaFICSClient && window.CaissaFICSShell?.getSnapshot().mounted === true);
        const result = await page.evaluate(() => window.CaissaFICSClient.connect('guest'));
        expect(result).toMatchObject({ ok: true, code: 'CONNECTION_STARTED' });
        await page.waitForFunction(() => window.CaissaFICSClient.authenticated === true
            && window.CaissaFICSClient.activeTables.some(table => table.number === '23'));
    };

    await page.goto('/fics');
    await connectAndWait();
    expect(await page.evaluate(() => window.CaissaFICSClient.switchObservedGame(23))).toMatchObject({ ok: true });
    await page.waitForFunction(() => window.CaissaFICSClient.liveGame.observedGame === true
        && window.CaissaFICSClient.liveGame.gameNumber === 23);
    await page.evaluate(() => window.CaissaFICSClient.setBoardOrientation('black'));

    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('caissa_fics_observe_recovery_v1')));
    expect(stored).toMatchObject({ gameNumber: '23', orientation: 'black', schemaVersion: 1 });
    expect(Object.keys(stored).sort()).toEqual([
        'expiresAt', 'gameNumber', 'observedAt', 'orientation', 'participantFingerprint', 'schemaVersion'
    ]);
    expect(JSON.stringify(stored)).not.toContain('FixtureWhite');
    expect(JSON.stringify(stored)).not.toContain('FixtureBlack');
    expect(JSON.stringify(stored)).not.toContain('rnbqkbnr');

    await page.reload();
    await connectAndWait();
    await page.waitForFunction(() => window.CaissaFICSClient.liveGame.observedGame === true
        && window.CaissaFICSClient.liveGame.gameNumber === 23);
    await page.evaluate(() => window.CaissaFICSClient.waitForBoardRendererIdle());
    const recovered = await page.evaluate(() => ({
        sockets: window.__board006Sockets.length,
        observeCommands: window.__board006Sockets.flatMap(socket => socket.commands)
            .filter(command => command === 'observe 23').length,
        orientation: window.CaissaFICSClient.board.orientation(),
        renderer: window.CaissaFICSClient.getBoardRendererSnapshot().renderer,
        visibleBoards: document.querySelectorAll('#ficsBoardContainer > .caissa-board, #ficsBoardContainer > .chessboard-63f37').length,
        consoleText: window.CaissaFICSClient.messageBuffer.join('\n')
    }));
    expect(recovered).toMatchObject({ sockets: 1, observeCommands: 1, orientation: 'black', renderer: 'persistent', visibleBoards: 1 });
    expect(recovered.consoleText).toContain('Observed game 23 restored from FICS.');

    expect(await page.evaluate(() => window.CaissaFICSClient.leaveObservedGame())).toMatchObject({ ok: true });
    expect(await page.evaluate(() => sessionStorage.getItem('caissa_fics_observe_recovery_v1'))).toBe(null);
    await page.reload();
    await connectAndWait();
    await page.waitForTimeout(2700);
    expect(await page.evaluate(() => window.__board006Sockets.flatMap(socket => socket.commands)
        .filter(command => command === 'observe 23').length)).toBe(0);
    expect(await page.evaluate(() => window.CaissaFICSClient.liveGame.observedGame)).toBe(false);
});

test('persistent Observe fails closed to legacy before a playable Style12 can accept input', async ({ page }) => {
    await openFics(page);
    await beginObserve(page);
    await page.evaluate(fen => {
        window.CaissaFICSClient.handleStyle12({
            ...window.CaissaFICSClient.liveGame, fen, gameNumber: 611, relation: 1, userColor: 'w',
            sideToMove: 'w', lastMove: 'none', lastMoveVerbose: 'none', observedGame: false
        });
    }, START_FEN);
    expect(await page.evaluate(() => window.CaissaFICSClient.getBoardRendererSnapshot().renderer)).toBe('legacy');
    await expect(page.locator('#ficsBoardContainer .board-b72b1')).toHaveCount(1);
    await expect(page.locator('#ficsBoardContainer .caissa-board')).toHaveCount(0);
});

test('legacy and persistent metrics use identical fixtures without rendering two user boards', async ({ browser, browserName }) => {
    async function measure(pilot) {
        const page = await browser.newPage();
        await openFics(page, { pilot });
        await beginObserve(page, START_FEN, pilot ? 612 : 613);
        const states = line(TWENTY_MOVES, START_FEN, pilot ? 612 : 613);
        const started = Date.now();
        const mutations = await mutationCapture(page, () => playStates(page, states));
        const elapsed = Date.now() - started;
        const timingGame = pilot ? 614 : 615;
        await playStates(page, [snapshot(START_FEN, timingGame)]);
        const timing = await page.evaluate(async values => {
            const durations = [];
            for (const value of values) {
                const startedAt = performance.now();
                window.CaissaFICSClient.handleStyle12(value);
                await window.CaissaFICSClient.waitForBoardRendererIdle();
                durations.push(performance.now() - startedAt);
            }
            const ordered = [...durations].sort((left, right) => left - right);
            return {
                averageMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
                p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1]
            };
        }, line(TWENTY_MOVES, START_FEN, timingGame));
        const result = await page.evaluate(() => ({
            renderer: window.CaissaFICSClient.getBoardRendererSnapshot(),
            visibleBoards: document.querySelectorAll('#ficsBoardContainer > .caissa-board, #ficsBoardContainer > .chessboard-63f37').length
        }));
        await page.close();
        return { elapsed, timing, mutations, ...result };
    }
    const legacy = await measure(false);
    const persistent = await measure(true);
    expect(legacy.visibleBoards).toBe(1);
    expect(persistent.visibleBoards).toBe(1);
    expect(legacy.renderer.renderer).toBe('legacy');
    expect(persistent.renderer.renderer).toBe('persistent');
    expect(persistent.mutations.added).toBeLessThanOrEqual(legacy.mutations.added);
    expect(persistent.mutations.removed).toBeLessThanOrEqual(legacy.mutations.removed);
    console.log(`[BOARD-006 COMPARISON ${browserName}]`, JSON.stringify({ legacy, persistent }));
});
