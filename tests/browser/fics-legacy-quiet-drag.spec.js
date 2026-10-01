import { test, expect } from '@playwright/test';
import { Chess } from 'chess.js';

const START_FEN = new Chess().fen();

function playState(fen = START_FEN, gameNumber = 820) {
    return {
        fen,
        gameNumber,
        whiteName: 'QuietWhite',
        blackName: 'QuietBlack',
        relation: 1,
        userColor: 'w',
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

async function openPlayableFics(page, { lab = false } = {}) {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
    });
    await page.goto(`/fics${lab ? '?quiet-drag-lab=1' : ''}`);
    await page.waitForFunction(() => window.CaissaFICSClient
        && document.querySelectorAll('#ficsBoardContainer .piece-417db').length === 32);
    await page.evaluate(value => {
        const client = window.CaissaFICSClient;
        window.__quietDragWire = [];
        client.sendMove = move => {
            window.__quietDragWire.push(move);
            return { ok: true };
        };
        Object.assign(client, { connected: true, authenticated: true, connectionState: 'connected' });
        client.handleStyle12(value);
    }, playState());
    await expect(page.locator('#ficsBoardContainer .board-b72b1')).toHaveAttribute(
        'data-caissa-legacy-quiet-drag-enabled', 'true');
}

async function squarePoint(page, square, offset = { x: 0.5, y: 0.5 }) {
    return page.locator(`#ficsBoardContainer .square-${square}`).evaluate((node, ratio) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width * ratio.x, y: rect.top + rect.height * ratio.y };
    }, offset);
}

async function installPosition(page, fen, options = {}) {
    await page.evaluate(({ value, color, gameNumber }) => {
        const client = window.CaissaFICSClient;
        window.__quietDragWire = [];
        client.pendingMove = null;
        client.pendingPromotionMove = null;
        client.handleStyle12({
            ...value,
            fen: value.fen,
            gameNumber,
            userColor: color === 'black' ? 'b' : 'w',
            sideToMove: value.fen.split(' ')[1]
        });
    }, { value: playState(fen, options.gameNumber || 820), color: options.color || 'white',
        gameNumber: options.gameNumber || 820 });
}

async function drag(page, sourceSquare, targetSquare, offset = { x: 0.5, y: 0.5 }) {
    const source = await squarePoint(page, sourceSquare, offset);
    const target = await squarePoint(page, targetSquare, offset);
    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 5 });
    await page.mouse.up();
}

test('FICS Play owns one quiet drag presentation and delegates one canonical drop', async ({ page }) => {
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    await openPlayableFics(page);
    const source = await squarePoint(page, 'e2', { x: 0.22, y: 0.31 });
    const target = await squarePoint(page, 'e4', { x: 0.22, y: 0.31 });
    await page.evaluate(() => {
        window.__quietOriginal = document.querySelector('#ficsBoardContainer .square-e2 .piece-417db');
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
            if (isWrite && keys.some(key => key === 'left' || key === 'top')) {
                window.__legacyPositionWrites += 1;
            }
            return css.apply(this, arguments);
        };
    });
    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    const atPointerDown = await page.evaluate(() => ({
        representations: document.querySelectorAll('.caissa-legacy-quiet-drag-piece').length,
        sameNode: document.querySelector('.caissa-legacy-quiet-drag-piece') === window.__quietOriginal,
        metrics: window.CaissaFICSClient.getLegacyQuietDragSnapshot()
    }));
    expect(atPointerDown.representations).toBe(1);
    expect(atPointerDown.sameNode).toBe(true);
    expect(atPointerDown.metrics.controller.started).toBe(true);
    expect(atPointerDown.metrics.legacyInput.attached).toBe(false);
    await page.mouse.move((source.x + target.x) / 2, (source.y + target.y) / 2, { steps: 4 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));

    const during = await page.evaluate(() => {
        const root = document.querySelector('#ficsBoardContainer .board-b72b1');
        const original = root.querySelector('.square-e2 .piece-417db');
        const movingPiece = root.querySelector('.caissa-legacy-quiet-drag-piece');
        const style = getComputedStyle(movingPiece);
        return {
            representations: root.querySelectorAll('.caissa-legacy-quiet-drag-piece').length,
            sameNode: movingPiece === window.__quietOriginal,
            vendorFloaters: [...document.querySelectorAll('body > .piece-417db')]
                .filter(node => getComputedStyle(node).display !== 'none').length,
            originalVisibility: getComputedStyle(original).visibility,
            transform: movingPiece?.style.transform || '',
            transition: style.transitionDuration,
            animation: style.animationName,
            opacity: style.opacity,
            scale: style.scale,
            filter: style.filter,
            boxShadow: style.boxShadow,
            movingRect: movingPiece.getBoundingClientRect().toJSON(),
            metrics: window.CaissaFICSClient.getLegacyQuietDragSnapshot()
        };
    });
    expect(during.representations).toBe(1);
    expect(during.sameNode).toBe(true);
    expect(during.vendorFloaters).toBe(0);
    expect(during.originalVisibility).toBe('visible');
    expect(during.transform).toMatch(/^translate3d\(/);
    expect(during.transition).toBe('0s');
    expect(during.animation).toBe('none');
    expect(during.opacity).toBe('1');
    expect(['none', '1']).toContain(during.scale);
    expect(during.filter).toBe('none');
    expect(during.boxShadow).toBe('none');
    expect(Math.abs(((source.x + target.x) / 2) - during.movingRect.left
        - during.movingRect.width * 0.22)).toBeLessThanOrEqual(2);
    expect(Math.abs(((source.y + target.y) / 2) - during.movingRect.top
        - during.movingRect.height * 0.31)).toBeLessThanOrEqual(2);
    expect(during.metrics.controller.geometryReadsDuringMove).toBe(0);
    expect(during.metrics.controller.pointerCaptured).toBe(true);
    expect(during.metrics.movementVisualWrites).toBeLessThanOrEqual(
        during.metrics.controller.scheduler.framesRequested);

    await page.mouse.move(target.x, target.y, { steps: 3 });
    await page.mouse.up();
    const after = await page.evaluate(() => ({
        wire: window.__quietDragWire,
        pending: window.CaissaFICSClient.pendingMove?.uci,
        cloneCount: document.querySelectorAll('.caissa-legacy-quiet-drag-piece').length,
        legacyAnimateCalls: window.__legacyAnimateCalls,
        legacyPositionWrites: window.__legacyPositionWrites,
        metrics: window.CaissaFICSClient.getLegacyQuietDragSnapshot()
    }));
    expect(after.wire).toEqual(['e2e4']);
    expect(after.pending).toBe('e2e4');
    expect(after.cloneCount).toBe(0);
    expect(after.legacyAnimateCalls).toBe(0);
    expect(after.legacyPositionWrites).toBe(0);
    expect(after.metrics.dropAttempts).toBe(1);
    expect(after.metrics.acceptedDrops).toBe(1);
    expect(runtimeErrors).toEqual([]);
});

test('FICS canonical rules retain capture, castling, en passant, promotions and black orientation', async ({ page }) => {
    await openPlayableFics(page);
    const cases = [
        { fen: '7k/8/8/3p4/4P3/8/8/7K w - - 0 1', from: 'e4', to: 'd5', uci: 'e4d5' },
        { fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', from: 'e1', to: 'g1', uci: 'e1g1' },
        { fen: '7k/8/8/3pP3/8/8/8/7K w - d6 0 1', from: 'e5', to: 'd6', uci: 'e5d6' },
        { fen: '7k/4p3/8/8/8/8/8/7K b - - 0 1', from: 'e7', to: 'e5', uci: 'e7e5', color: 'black' }
    ];
    for (const [index, item] of cases.entries()) {
        await installPosition(page, item.fen, { color: item.color, gameNumber: 830 + index });
        await expect(page.locator(`#ficsBoardContainer .square-${item.from} .piece-417db`)).toHaveCount(1);
        await page.waitForTimeout(80);
        await drag(page, item.from, item.to, { x: 0.37, y: 0.43 });
        expect(await page.evaluate(() => window.__quietDragWire)).toEqual([item.uci]);
        expect(await page.evaluate(() => window.CaissaFICSClient.pendingMove?.uci)).toBe(item.uci);
    }

    for (const [index, promotion] of ['q', 'r', 'b', 'n'].entries()) {
        await installPosition(page, '7k/P7/8/8/8/8/8/7K w - - 0 1', { gameNumber: 850 + index });
        await expect(page.locator('#ficsBoardContainer .square-a7 .piece-417db')).toHaveCount(1);
        await page.waitForTimeout(80);
        await drag(page, 'a7', 'a8');
        await expect(page.locator('#ficsPromotionSelector')).toBeVisible();
        await page.locator(`[data-promotion="${promotion}"]`).click();
        expect(await page.evaluate(() => window.__quietDragWire)).toEqual([`a7a8${promotion}`]);
        expect(await page.evaluate(() => window.CaissaFICSClient.pendingMove?.uci)).toBe(`a7a8${promotion}`);
    }

    expect(await page.evaluate(() => ({
        cloneCount: document.querySelectorAll('.caissa-legacy-quiet-drag-piece').length,
        hiddenSources: document.querySelectorAll('[data-caissa-quiet-drag-source-piece]').length
    }))).toEqual({ cloneCount: 0, hiddenSources: 0 });
});

test('local QA toggle switches between vendor legacy and Quiet Drag without production exposure', async ({ page }) => {
    await openPlayableFics(page, { lab: true });
    const panel = page.locator('.caissa-legacy-drag-qa');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Quiet Drag' })).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'Legacy Drag' }).click();
    await expect(page.locator('#ficsBoardContainer .board-b72b1')).toHaveAttribute(
        'data-caissa-legacy-quiet-drag-enabled', 'false');
    expect((await page.evaluate(() => window.CaissaFICSClient.getLegacyQuietDragSnapshot())).legacyInput.attached)
        .toBe(true);
    await panel.getByRole('button', { name: 'Quiet Drag' }).click();
    await expect(page.locator('#ficsBoardContainer .board-b72b1')).toHaveAttribute(
        'data-caissa-legacy-quiet-drag-enabled', 'true');
    expect((await page.evaluate(() => window.CaissaFICSClient.getLegacyQuietDragSnapshot())).legacyInput.attached)
        .toBe(false);

    const productionContext = await page.context().browser().newContext();
    const productionPage = await productionContext.newPage();
    await productionPage.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
    });
    await productionPage.goto('/fics');
    await expect(productionPage.locator('.caissa-legacy-drag-qa')).toHaveCount(0);
    await productionContext.close();
});

test('Observe to Play recreation keeps vendor and adapter listener ownership stable', async ({ page }) => {
    await openPlayableFics(page);
    await page.evaluate(async base => {
        const client = window.CaissaFICSClient;
        for (let index = 0; index < 10; index += 1) {
            client.handleStyle12({ ...base, gameNumber: 900 + index, relation: 0, userColor: null,
                observedGame: true });
            await client.waitForBoardRendererIdle();
            client.handleStyle12({ ...base, gameNumber: 900 + index, relation: 1, userColor: 'w',
                observedGame: false });
        }
    }, playState());
    const counts = await page.evaluate(() => {
        const events = window.jQuery?._data?.(window, 'events') || {};
        return {
            mousemove: events.mousemove?.length || 0,
            mouseup: events.mouseup?.length || 0,
            adapterListeners: window.CaissaFICSClient.getLegacyQuietDragSnapshot()?.controller.listenerCount,
            renderer: window.CaissaFICSClient.getBoardRendererSnapshot().renderer
        };
    });
    expect(counts).toEqual({ mousemove: 0, mouseup: 0, adapterListeners: 5, renderer: 'legacy' });
});
