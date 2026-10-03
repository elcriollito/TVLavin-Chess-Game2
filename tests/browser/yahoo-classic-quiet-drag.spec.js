import { test, expect } from '@playwright/test';
import { Chess } from 'chess.js';

const START_FEN = new Chess().fen();

function playState(fen = START_FEN, options = {}) {
    const color = options.color === 'black' ? 'b' : 'w';
    return {
        fen,
        gameNumber: options.gameNumber || 1820,
        whiteName: color === 'w' ? 'QuietYahoo' : 'Opponent',
        blackName: color === 'b' ? 'QuietYahoo' : 'Opponent',
        relation: 1,
        userColor: color,
        sideToMove: fen.split(' ')[1],
        lastMove: 'none',
        lastMoveVerbose: 'none',
        moveNumber: Number(fen.split(' ')[5]),
        whiteClock: 600,
        blackClock: 600,
        initialTime: 10,
        increment: 0,
        observedGame: false
    };
}

async function openPlayableYahoo(page, options = {}) {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
    });
    await page.goto(`/yahoo-classic${options.lab ? '?quiet-drag-lab=1' : ''}`);
    await page.waitForFunction(() => window.CaissaYahooClassic && window.CaissaFICSClient);
    await page.evaluate(value => {
        const section = window.CaissaYahooClassic;
        const client = window.CaissaFICSClient;
        document.getElementById('yahooClassicSection')?.classList.add('active');
        section.onEnter();
        window.__yahooQuietWire = [];
        window.__yahooSendCalls = 0;
        window.__yahooCommandCalls = 0;
        client.sendMove = move => {
            window.__yahooQuietWire.push(move);
            return { ok: true };
        };
        client.send = () => { window.__yahooSendCalls += 1; return true; };
        client.sendCommand = () => { window.__yahooCommandCalls += 1; return true; };
        Object.assign(client, { connected: true, authenticated: true, connectionState: 'connected' });
        client.pendingMove = null;
        client.pendingPromotionMove = null;
        client.handleStyle12(value);
        document.getElementById('ycGameWindow')?.scrollIntoView({ block: 'center' });
    }, playState(options.fen || START_FEN, options));
    await page.waitForFunction(() => document.querySelectorAll('#ycClassicBoard .piece-417db').length > 0);
    await expect(page.locator('#ycClassicBoard .board-b72b1')).toHaveAttribute(
        'data-caissa-legacy-quiet-drag-enabled', 'true');
}

async function installPosition(page, fen, options = {}) {
    await page.evaluate(value => {
        const client = window.CaissaFICSClient;
        window.__yahooQuietWire = [];
        client.pendingMove = null;
        client.pendingPromotionMove = null;
        client.handleStyle12(value);
    }, playState(fen, options));
    await page.waitForFunction(expected => window.CaissaYahooClassic?.liveGame?.currentFen === expected, fen);
}

async function squarePoint(page, square, offset = { x: 0.5, y: 0.5 }) {
    return page.locator(`#ycClassicBoard .square-${square}`).evaluate((node, ratio) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width * ratio.x, y: rect.top + rect.height * ratio.y };
    }, offset);
}

async function drag(page, sourceSquare, targetSquare, offset = { x: 0.5, y: 0.5 }) {
    const source = await squarePoint(page, sourceSquare, offset);
    const target = await squarePoint(page, targetSquare, offset);
    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 5 });
    await page.mouse.up();
}

test('Yahoo owns one quiet presentation and mutates semantics only on drop', async ({ page }) => {
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await openPlayableYahoo(page);
    await expect(page.locator('.caissa-legacy-drag-qa')).toHaveCount(0);
    const source = await squarePoint(page, 'e2', { x: 0.22, y: 0.31 });
    const target = await squarePoint(page, 'e4', { x: 0.22, y: 0.31 });
    await page.evaluate(() => {
        window.__legacyAnimateCalls = 0;
        window.__legacyPositionWrites = 0;
        const jquery = window.jQuery;
        const animate = jquery.fn.animate;
        const css = jquery.fn.css;
        jquery.fn.animate = function (...args) {
            window.__legacyAnimateCalls += 1;
            return animate.apply(this, args);
        };
        jquery.fn.css = function (name, value) {
            const keys = name && typeof name === 'object' ? Object.keys(name) : [name];
            const isWrite = (name && typeof name === 'object') || arguments.length > 1;
            if (isWrite && keys.some(key => key === 'left' || key === 'top')) window.__legacyPositionWrites += 1;
            return css.apply(this, arguments);
        };
        const client = window.CaissaFICSClient;
        window.__beforeMoveState = {
            pendingMove: client.pendingMove,
            currentFen: client.liveGame.currentFen,
            whiteClock: client.liveGame.whiteClock,
            blackClock: client.liveGame.blackClock
        };
    });
    await page.mouse.move(source.x, source.y);
    await page.evaluate(() => {
        window.__yahooOriginal = document.querySelector('#ycClassicBoard .square-e2 .piece-417db');
    });
    await page.mouse.down();
    const pickup = await page.evaluate(() => ({
        count: document.querySelectorAll('#ycClassicBoard .caissa-legacy-quiet-drag-piece').length,
        sameNode: document.querySelector('#ycClassicBoard .caissa-legacy-quiet-drag-piece') === window.__yahooOriginal,
        metrics: window.CaissaYahooClassic.getLegacyQuietDragSnapshot()
    }));
    expect(pickup.count).toBe(1);
    expect(pickup.sameNode).toBe(true);
    expect(pickup.metrics.legacyInput.attached).toBe(false);

    await page.mouse.move((source.x + target.x) / 2, (source.y + target.y) / 2, { steps: 8 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const during = await page.evaluate(() => {
        const mover = document.querySelector('#ycClassicBoard .caissa-legacy-quiet-drag-piece');
        const style = getComputedStyle(mover);
        const client = window.CaissaFICSClient;
        return {
            sameState: JSON.stringify(window.__beforeMoveState) === JSON.stringify({
                pendingMove: client.pendingMove,
                currentFen: client.liveGame.currentFen,
                whiteClock: client.liveGame.whiteClock,
                blackClock: client.liveGame.blackClock
            }),
            wire: window.__yahooQuietWire,
            sendCalls: window.__yahooSendCalls,
            commandCalls: window.__yahooCommandCalls,
            representations: document.querySelectorAll('#ycClassicBoard .caissa-legacy-quiet-drag-piece').length,
            vendorFloaters: [...document.querySelectorAll('body > .piece-417db')]
                .filter(node => getComputedStyle(node).display !== 'none').length,
            movingRect: mover.getBoundingClientRect().toJSON(),
            transform: mover.style.transform,
            transition: style.transitionDuration,
            animation: style.animationName,
            opacity: style.opacity,
            filter: style.filter,
            boxShadow: style.boxShadow,
            metrics: window.CaissaYahooClassic.getLegacyQuietDragSnapshot()
        };
    });
    expect(during.sameState).toBe(true);
    expect(during.wire).toEqual([]);
    expect(during.sendCalls).toBe(0);
    expect(during.commandCalls).toBe(0);
    expect(during.representations).toBe(1);
    expect(during.vendorFloaters).toBe(0);
    expect(during.transform).toMatch(/^translate3d\(/);
    expect(during.transition).toBe('0s');
    expect(during.animation).toBe('none');
    expect(during.opacity).toBe('1');
    expect(during.filter).toBe('none');
    expect(during.boxShadow).toBe('none');
    expect(Math.abs(((source.x + target.x) / 2) - during.movingRect.left
        - during.movingRect.width * 0.22)).toBeLessThanOrEqual(2);
    expect(Math.abs(((source.y + target.y) / 2) - during.movingRect.top
        - during.movingRect.height * 0.31)).toBeLessThanOrEqual(2);
    expect(during.metrics.controller.geometryReadsDuringMove).toBe(0);
    expect(during.metrics.controller.pointerCaptured).toBe(true);
    expect(during.metrics.movementVisualWrites).toBeLessThanOrEqual(during.metrics.controller.scheduler.framesRequested);

    await page.mouse.move(target.x, target.y, { steps: 3 });
    await page.mouse.up();
    const after = await page.evaluate(() => ({
        wire: window.__yahooQuietWire,
        pending: window.CaissaFICSClient.pendingMove?.uci,
        representations: document.querySelectorAll('#ycClassicBoard .caissa-legacy-quiet-drag-piece').length,
        animateCalls: window.__legacyAnimateCalls,
        positionWrites: window.__legacyPositionWrites,
        metrics: window.CaissaYahooClassic.getLegacyQuietDragSnapshot()
    }));
    expect(after.wire).toEqual(['e2e4']);
    expect(after.pending).toBe('e2e4');
    expect(after.representations).toBe(0);
    expect(after.animateCalls).toBe(0);
    expect(after.positionWrites).toBe(0);
    expect(after.metrics.dropAttempts).toBe(1);
    expect(runtimeErrors).toEqual([]);
});

test('Yahoo preserves special moves, black orientation, click-to-move and touch drag', async ({ page }) => {
    await openPlayableYahoo(page);
    const cases = [
        { fen: '7k/8/8/3p4/4P3/8/8/7K w - - 0 1', from: 'e4', to: 'd5', uci: 'e4d5' },
        { fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', from: 'e1', to: 'g1', uci: 'e1g1' },
        { fen: '7k/8/8/3pP3/8/8/8/7K w - d6 0 1', from: 'e5', to: 'd6', uci: 'e5d6' },
        { fen: '7k/4p3/8/8/8/8/8/7K b - - 0 1', from: 'e7', to: 'e5', uci: 'e7e5', color: 'black' }
    ];
    for (const [index, item] of cases.entries()) {
        await installPosition(page, item.fen, { color: item.color, gameNumber: 1840 + index });
        await drag(page, item.from, item.to, { x: 0.37, y: 0.43 });
        expect(await page.evaluate(() => window.__yahooQuietWire)).toEqual([item.uci]);
        expect(await page.evaluate(() => window.CaissaFICSClient.pendingMove?.uci)).toBe(item.uci);
        if (item.color === 'black') {
            expect(await page.evaluate(() => window.CaissaYahooClassic.board.orientation())).toBe('black');
        }
    }

    for (const [index, promotion] of ['q', 'r', 'b', 'n'].entries()) {
        await installPosition(page, '7k/P7/8/8/8/8/8/7K w - - 0 1', { gameNumber: 1860 + index });
        await drag(page, 'a7', 'a8');
        await expect(page.locator('#ycPromotionSelector')).toBeVisible();
        await page.locator(`#ycPromotionSelector [data-promotion="${promotion}"]`).click();
        expect(await page.evaluate(() => window.__yahooQuietWire)).toEqual([`a7a8${promotion}`]);
    }

    await installPosition(page, START_FEN, { gameNumber: 1880 });
    await page.locator('#ycClassicBoard .square-e2').click();
    await expect(page.locator('#ycClassicBoard .square-e2')).toHaveClass(/yc-click-selected/);
    await page.locator('#ycClassicBoard .square-e4').click();
    expect(await page.evaluate(() => window.__yahooQuietWire)).toEqual(['e2e4']);

    await installPosition(page, START_FEN, { gameNumber: 1881 });
    await page.evaluate(() => {
        const root = document.querySelector('#ycClassicBoard .board-b72b1');
        const point = square => {
            const rect = root.querySelector(`.square-${square}`).getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        };
        const from = point('d2');
        const to = point('d4');
        const init = (type, position, buttons) => new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 91, pointerType: 'touch', isPrimary: true,
            button: 0, buttons, clientX: position.x, clientY: position.y
        });
        root.querySelector('.square-d2 .piece-417db').dispatchEvent(init('pointerdown', from, 1));
        root.dispatchEvent(init('pointermove', to, 1));
        root.dispatchEvent(init('pointerup', to, 0));
    });
    expect(await page.evaluate(() => window.__yahooQuietWire)).toEqual(['d2d4']);
});

test('Yahoo room cycles and board recreation keep listener ownership stable', async ({ page }) => {
    await openPlayableYahoo(page, { lab: true });
    const panel = page.locator('.caissa-legacy-drag-qa');
    await expect(panel).toHaveAttribute('aria-label', 'Yahoo Classic drag comparison');
    await expect(panel.getByRole('button', { name: 'Quiet Drag' })).toHaveAttribute('aria-pressed', 'true');
    const initial = await page.evaluate(() => {
        window.__ycCycleRoot = document.querySelector('#ycClassicBoard .board-b72b1');
        window.__ycCycleBoard = window.CaissaYahooClassic.board;
        return { metrics: window.CaissaYahooClassic.getLegacyQuietDragSnapshot() };
    });
    expect(initial.metrics.controller.listenerCount).toBe(5);
    expect(initial.metrics.legacyInput.attached).toBe(false);

    for (let index = 0; index < 10; index += 1) {
        await page.locator('.yc-tab[data-room="Tournament Hall"]').click();
        await page.locator('.yc-tab[data-room="CAISSA Lobby"]').click();
    }
    const cycled = await page.evaluate(() => {
        const section = window.CaissaYahooClassic;
        const events = window.jQuery?._data?.(window, 'events') || {};
        return {
            rootStable: document.querySelector('#ycClassicBoard .board-b72b1') === window.__ycCycleRoot,
            boardStable: section.board === window.__ycCycleBoard,
            listenerCount: section.getLegacyQuietDragSnapshot()?.controller.listenerCount,
            pendingFrame: section.getLegacyQuietDragSnapshot()?.controller.scheduler.pendingFrame,
            representations: document.querySelectorAll('#ycClassicBoard .caissa-legacy-quiet-drag-piece').length,
            mousemove: events.mousemove?.length || 0,
            mouseup: events.mouseup?.length || 0
        };
    });
    expect(cycled.rootStable).toBe(true);
    expect(cycled.boardStable).toBe(true);
    expect(cycled.listenerCount).toBe(5);
    expect(cycled.pendingFrame).toBe(false);
    expect(cycled.representations).toBe(0);
    expect(cycled.mousemove).toBe(0);
    expect(cycled.mouseup).toBe(0);

    await panel.getByRole('button', { name: 'Legacy Drag' }).click();
    expect((await page.evaluate(() => window.CaissaYahooClassic.getLegacyQuietDragSnapshot())).legacyInput.attached).toBe(true);
    await panel.getByRole('button', { name: 'Quiet Drag' }).click();
    expect((await page.evaluate(() => window.CaissaYahooClassic.getLegacyQuietDragSnapshot())).legacyInput.attached).toBe(false);

    await page.evaluate(() => window.CaissaYahooClassic.closeTable(false));
    await expect(page.locator('#ycClassicBoard .board-b72b1')).toHaveCount(0);
    expect(await page.evaluate(() => ({
        board: window.CaissaYahooClassic.board,
        adapter: window.CaissaYahooClassic.legacyQuietDragAdapter,
        frame: window.CaissaYahooClassic.boardResizeFrame
    }))).toEqual({ board: null, adapter: null, frame: null });

    await page.evaluate(value => window.CaissaFICSClient.handleStyle12(value), playState(START_FEN, { gameNumber: 1890 }));
    await expect(page.locator('#ycClassicBoard .board-b72b1')).toHaveAttribute(
        'data-caissa-legacy-quiet-drag-enabled', 'true');
    expect((await page.evaluate(() => window.CaissaYahooClassic.getLegacyQuietDragSnapshot())).controller.listenerCount).toBe(5);
});
