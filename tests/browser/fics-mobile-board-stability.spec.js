import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

async function openFics(page, viewport) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
    });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true
        && document.querySelectorAll('#ficsBoardContainer .piece-417db').length === 32);
}

async function installPlayableGame(page) {
    await page.evaluate((startFen) => {
        const client = window.CaissaFICSClient;
        window.__ficsMobileWire = [];
        client.sendMove = move => window.__ficsMobileWire.push(move);
        client.chess.load(startFen);
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected',
            gameActive: true, myColor: 'white', pendingMove: null, pendingPromotionMove: null,
            liveGame: {
                ...client.createEmptyLiveGameState('playing'), gameNumber: 202,
                whiteName: 'MobileGuest', blackName: 'Opponent', userColor: 'white', relation: 1,
                sideToMove: 'w', whiteClock: 300, blackClock: 300, currentFen: startFen,
                gameActive: true, observedGame: false, status: 'playing'
            }
        });
        client.clearBoardSelection();
        client.setBoardOrientation('white');
        client.setBoardPosition(startFen, false, true);
        window.CaissaFICSShell.refresh();
    }, START_FEN);
}

async function resetPlayableGame(page) {
    await page.evaluate((startFen) => {
        const client = window.CaissaFICSClient;
        client.pendingMove = null;
        client.pendingPromotionMove = null;
        client.chess.load(startFen);
        client.liveGame = { ...client.liveGame, currentFen: startFen, sideToMove: 'w', relation: 1, observedGame: false };
        client.clearBoardSelection();
        client.setBoardPosition(startFen, false, true);
        window.__ficsMobileWire = [];
    }, START_FEN);
}

test.describe('FICS mobile board input', () => {
    test.use({ hasTouch: true, isMobile: true });

    test('portrait tap-to-move is canonical, illegal taps fail closed and selection is accessible', async ({ page }) => {
        await openFics(page, { width: 390, height: 844 });
        await installPlayableGame(page);
        const initialScroll = await page.evaluate(() => scrollY);

        await page.locator('#ficsBoardContainer .square-e2').tap();
        await expect(page.locator('#ficsBoardContainer .square-e2')).toHaveClass(/fics-tap-selected/);
        await expect(page.locator('#ficsBoardContainer')).toHaveAttribute('data-selected-square', 'e2');
        await expect(page.locator('#ficsBoardContainer')).toHaveAttribute('aria-label', /e2 selected; choose a destination/);

        await page.locator('#ficsBoardContainer .square-d2').tap();
        await expect(page.locator('#ficsBoardContainer .square-d2')).toHaveClass(/fics-tap-selected/);
        await expect(page.locator('#ficsBoardContainer .square-e2')).not.toHaveClass(/fics-tap-selected/);
        expect(await page.evaluate(() => window.__ficsMobileWire)).toEqual([]);

        await page.locator('#ficsBoardContainer .square-d2').tap();
        await expect(page.locator('#ficsBoardContainer')).not.toHaveAttribute('data-selected-square');

        await page.locator('#ficsBoardContainer .square-e2').tap();
        await page.locator('#ficsBoardContainer .square-e5').tap();
        await expect(page.locator('#ficsBoardContainer')).toHaveAttribute('data-selected-square', 'e2');
        expect(await page.evaluate(() => window.__ficsMobileWire)).toEqual([]);

        await page.locator('#ficsBoardContainer .square-e4').tap();
        await expect.poll(() => page.evaluate(() => window.__ficsMobileWire)).toEqual(['e2e4']);
        await expect(page.locator('#ficsBoardContainer')).not.toHaveAttribute('data-selected-square');
        expect(await page.evaluate(() => scrollY)).toBe(initialScroll);
    });

    test('piece assets reject long-press callouts while board touch rules stay scoped', async ({ page }) => {
        await openFics(page, { width: 390, height: 844 });
        const result = await page.locator('#ficsBoardContainer .piece-417db').first().evaluate((piece) => {
            const board = document.getElementById('ficsBoardContainer');
            const dispatched = piece.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
            const pieceStyle = getComputedStyle(piece);
            const boardStyle = getComputedStyle(board);
            return {
                contextAllowed: dispatched,
                draggable: piece.draggable,
                draggableAttribute: piece.getAttribute('draggable'),
                boardTouchAction: boardStyle.touchAction,
                boardUserSelect: boardStyle.userSelect || boardStyle.webkitUserSelect,
                pieceUserSelect: pieceStyle.userSelect || pieceStyle.webkitUserSelect,
                bodyTouchAction: getComputedStyle(document.body).touchAction
            };
        });
        expect(result).toEqual({
            contextAllowed: false,
            draggable: false,
            draggableAttribute: 'false',
            boardTouchAction: 'none',
            boardUserSelect: 'none',
            pieceUserSelect: 'none',
            bodyTouchAction: 'auto'
        });

        const scrollResult = await page.evaluate(() => {
            const spacer = document.createElement('div');
            spacer.style.height = '1200px';
            document.body.append(spacer);
            window.scrollTo(0, 500);
            return { scrollY, bodyTouchAction: getComputedStyle(document.body).touchAction };
        });
        expect(scrollResult.scrollY).toBeGreaterThan(0);
        expect(scrollResult.bodyTouchAction).toBe('auto');
    });

    test('landscape tap-to-move has no overflow or board movement', async ({ page }) => {
        await openFics(page, { width: 844, height: 390 });
        await installPlayableGame(page);
        const before = await page.locator('#ficsBoardContainer').evaluate(node => node.getBoundingClientRect().toJSON());
        await page.locator('#ficsBoardContainer .square-e2').tap();
        await page.locator('#ficsBoardContainer .square-e4').tap();
        await expect.poll(() => page.evaluate(() => window.__ficsMobileWire)).toEqual(['e2e4']);
        const after = await page.locator('#ficsBoardContainer').evaluate(node => node.getBoundingClientRect().toJSON());
        expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    });

    test('Quiet Drag Pointer Events touch path sends one canonical move without legacy touch handlers', async ({ page }) => {
        await openFics(page, { width: 390, height: 844 });
        await installPlayableGame(page);
        await resetPlayableGame(page);
        const result = await page.evaluate(() => {
            const from = document.querySelector('#ficsBoardContainer .square-e2');
            const to = document.querySelector('#ficsBoardContainer .square-e4');
            const fromRect = from.getBoundingClientRect();
            const toRect = to.getBoundingClientRect();
            const point = (rect) => ({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
            const startPoint = point(fromRect);
            const endPoint = point(toRect);
            const root = document.querySelector('#ficsBoardContainer .board-b72b1');
            const piece = from.querySelector('.piece-417db');
            const pointer = (type, coords, buttons) => new PointerEvent(type, {
                bubbles: true, cancelable: true, pointerId: 81, pointerType: 'touch', isPrimary: true,
                button: type === 'pointerup' ? 0 : -1, buttons,
                clientX: coords.clientX, clientY: coords.clientY
            });
            piece.dispatchEvent(pointer('pointerdown', startPoint, 1));
            root.dispatchEvent(pointer('pointermove', endPoint, 1));
            root.dispatchEvent(pointer('pointerup', endPoint, 0));
            return window.CaissaFICSClient.getLegacyQuietDragSnapshot();
        });
        expect(result.legacyInput.attached).toBe(false);
        expect(result.controller.dragStarts).toBeGreaterThanOrEqual(1);
        await expect.poll(() => page.evaluate(() => window.__ficsMobileWire)).toEqual(['e2e4']);
    });
});

test('twenty observed Style12 updates preserve persistent renderer identity, geometry, orientation and scroll', async ({ page }) => {
    await openFics(page, { width: 390, height: 844 });
    const result = await page.evaluate(async () => {
        const client = window.CaissaFICSClient;
        const rect = node => {
            const value = node.getBoundingClientRect();
            return { left: value.left, top: value.top, width: value.width, height: value.height };
        };
        const game = new Chess();
        const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7'];
        const send = (san, index) => {
            const move = game.move(san);
            client.handleStyle12({
                fen: game.fen(), gameNumber: 303, whiteName: 'Alpha', blackName: 'Beta',
                relation: 0, userColor: null, sideToMove: game.turn(), lastMove: move.san,
                lastMoveVerbose: move, moveNumber: game.move_number || Math.floor(index / 2) + 1,
                whiteClock: 300 - index, blackClock: 300 - index, initialTime: 5,
                increment: 0, observedGame: true
            });
            if (index % 4 === 0) client.logToConsole(`Fixture update ${index + 1}`, 'GAME');
        };
        send(sans[0], 0);
        await client.waitForBoardRendererIdle();
        const boardIdentity = client.board;
        const boardNode = document.querySelector('#ficsBoardContainer .caissa-board');
        const boardParent = boardNode?.parentNode;
        const before = rect(document.getElementById('ficsBoardContainer'));
        const orientationBefore = client.board.orientation();
        const scrollBefore = scrollY;
        const shellResizeBefore = window.CaissaFICSShell.getSnapshot().boardResizeCount;
        const rendererBefore = client.getBoardRendererSnapshot();
        sans.slice(1).forEach((san, offset) => send(san, offset + 1));
        await client.waitForBoardRendererIdle();
        const afterNode = document.querySelector('#ficsBoardContainer .caissa-board');
        const rendererAfter = client.getBoardRendererSnapshot();
        return {
            sameBoard: client.board === boardIdentity,
            sameNode: afterNode === boardNode,
            sameParent: afterNode?.parentNode === boardParent,
            before,
            after: rect(document.getElementById('ficsBoardContainer')),
            orientationBefore,
            orientationAfter: client.board.orientation(),
            scrollBefore,
            scrollAfter: scrollY,
            shellResizeDelta: window.CaissaFICSShell.getSnapshot().boardResizeCount - shellResizeBefore,
            moveCount: client.moveHistory.length,
            rendererBefore: rendererBefore.renderer,
            rendererAfter: rendererAfter.renderer,
            visualUpdateDelta: rendererAfter.metrics.visualUpdates - rendererBefore.metrics.visualUpdates
        };
    });
    expect(result.sameBoard).toBe(true);
    expect(result.sameNode).toBe(true);
    expect(result.sameParent).toBe(true);
    expect(result.rendererBefore).toBe('persistent');
    expect(result.rendererAfter).toBe('persistent');
    expect(result.orientationAfter).toBe(result.orientationBefore);
    expect(result.shellResizeDelta).toBe(0);
    expect(result.visualUpdateDelta).toBeGreaterThan(0);
    expect(Math.abs(result.after.left - result.before.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.after.top - result.before.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.after.width - result.before.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.after.height - result.before.height)).toBeLessThanOrEqual(1);
    expect(result.scrollAfter).toBe(result.scrollBefore);
    expect(result.moveCount).toBeGreaterThanOrEqual(19);
});

test('desktop mouse drag and FICS keyboard accessibility remain unchanged', async ({ page }) => {
    await openFics(page, { width: 1366, height: 768 });
    await installPlayableGame(page);
    await page.locator('#ficsBoardContainer .square-e2').dragTo(page.locator('#ficsBoardContainer .square-e4'));
    await expect.poll(() => page.evaluate(() => window.__ficsMobileWire)).toEqual(['e2e4']);
    await page.getByRole('tab', { name: 'Game' }).focus();
    await expect(page.getByRole('tab', { name: 'Game' })).toBeFocused();
    const results = await new AxeBuilder({ page }).include('#ficsSection').analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
