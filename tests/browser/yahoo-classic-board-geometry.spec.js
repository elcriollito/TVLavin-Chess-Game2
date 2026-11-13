import { test, expect } from '@playwright/test';
import { Chess } from 'chess.js';

const START_FEN = new Chess().fen();
const afterE4 = new Chess();
afterE4.move('e4');
const AFTER_E4_FEN = afterE4.fen();

function gameState({
    fen = START_FEN,
    gameNumber = 27,
    observedGame = false,
    result = null,
    status = 'playing',
    whiteClock = 300,
    blackClock = 300
} = {}) {
    const color = fen.split(' ')[1];
    return {
        fen,
        gameNumber,
        whiteName: 'ClassicWhite',
        blackName: 'ClassicBlack',
        whiteRating: '1800',
        blackRating: '1900',
        relation: observedGame ? 0 : 1,
        userColor: observedGame ? null : 'w',
        sideToMove: color,
        lastMove: fen === START_FEN ? 'none' : 'e2-e4',
        lastMoveVerbose: fen === START_FEN ? 'none' : 'P/e2-e4',
        moveNumber: Number(fen.split(' ')[5]),
        whiteClock,
        blackClock,
        initialTime: 5,
        increment: 0,
        observedGame,
        result,
        status
    };
}

async function openClassic(page, viewport, state = gameState()) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
    });
    await page.goto('/yahoo-classic', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.CaissaYahooClassic && window.CaissaFICSClient);
    await page.evaluate(value => {
        const section = window.CaissaYahooClassic;
        const client = window.CaissaFICSClient;
        document.getElementById('yahooClassicSection')?.classList.add('active');
        section.onEnter();
        Object.assign(client, {
            connected: true,
            authenticated: true,
            connectionState: 'connected',
            gameActive: true,
            myColor: value.observedGame ? null : 'white'
        });
        client.handleStyle12(value);
    }, state);
    await page.waitForFunction(() => document.querySelectorAll('#ycClassicBoard .square-55d63').length === 64);
    await waitForFrames(page, 3);
}

async function waitForFrames(page, count = 2) {
    await page.evaluate(async frameCount => {
        for (let frame = 0; frame < frameCount; frame += 1) {
            await new Promise(requestAnimationFrame);
        }
    }, count);
}

async function readGeometry(page) {
    return page.evaluate(() => {
        const section = window.CaissaYahooClassic;
        const panel = document.querySelector('.yc-game-board-panel');
        const frame = document.getElementById('ycClassicBoard');
        const board = frame.querySelector('.board-b72b1');
        const square = board.querySelector('.square-55d63');
        const rect = element => {
            const bounds = element.getBoundingClientRect();
            return {
                x: Number(bounds.x.toFixed(3)),
                y: Number(bounds.y.toFixed(3)),
                width: Number(bounds.width.toFixed(3)),
                height: Number(bounds.height.toFixed(3))
            };
        };
        const panelStyle = getComputedStyle(panel);
        const horizontalPadding = (parseFloat(panelStyle.paddingLeft) || 0)
            + (parseFloat(panelStyle.paddingRight) || 0);
        const verticalPadding = (parseFloat(panelStyle.paddingTop) || 0)
            + (parseFloat(panelStyle.paddingBottom) || 0);
        const availableWidth = panel.clientWidth - horizontalPadding;
        const availableHeight = panel.clientHeight - verticalPadding;
        return {
            panel: rect(panel),
            frame: rect(frame),
            board: rect(board),
            square: rect(square),
            expectedSize: section.calculateClassicBoardSize({ availableWidth, availableHeight }),
            lastBoardSize: section.lastBoardSize,
            inlineWidth: frame.style.width,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

function expectSquareGeometry(geometry) {
    expect(geometry.frame.width).toBe(geometry.frame.height);
    expect(geometry.board.width).toBe(geometry.board.height);
    expect(geometry.square.width).toBe(geometry.square.height);
    expect(geometry.square.width * 8).toBeCloseTo(geometry.board.width, 2);
    expect(geometry.horizontalOverflow).toBe(0);
}

test('Classic board uses panel geometry and ignores play, observe, clock, move, and result state', async ({ page }) => {
    await openClassic(page, { width: 1024, height: 768 });
    const samples = [await readGeometry(page)];

    await page.evaluate(value => window.CaissaFICSClient.handleStyle12(value), gameState({
        fen: AFTER_E4_FEN,
        gameNumber: 27,
        whiteClock: 299
    }));
    await waitForFrames(page);
    samples.push(await readGeometry(page));

    await page.evaluate(() => {
        window.CaissaYahooClassic.liveGame.blackClock = 298;
        window.CaissaYahooClassic.renderGameExperience();
    });
    await waitForFrames(page);
    samples.push(await readGeometry(page));

    await page.evaluate(() => window.CaissaYahooClassic.handleFicsEvent({
        event: 'game-ended',
        payload: {
            result: '1/2-1/2',
            resultModel: { terminal: true, summary: 'Draw' },
            liveGame: {
                ...window.CaissaYahooClassic.liveGame,
                result: '1/2-1/2',
                resultModel: { terminal: true, summary: 'Draw' },
                status: 'ended'
            }
        }
    }));
    await waitForFrames(page);
    samples.push(await readGeometry(page));

    await page.evaluate(value => window.CaissaFICSClient.handleStyle12(value), gameState({
        gameNumber: 20,
        observedGame: true,
        status: 'observing'
    }));
    await waitForFrames(page);
    samples.push(await readGeometry(page));

    await page.evaluate(() => window.CaissaYahooClassic.handleFicsEvent({
        event: 'game-ended',
        payload: {
            result: '1/2-1/2',
            resultModel: { terminal: true, summary: 'Draw' },
            liveGame: {
                ...window.CaissaYahooClassic.liveGame,
                observedGame: true,
                result: '1/2-1/2',
                resultModel: { terminal: true, summary: 'Draw' },
                status: 'ended'
            }
        }
    }));
    await waitForFrames(page);
    samples.push(await readGeometry(page));

    for (const geometry of samples) {
        expectSquareGeometry(geometry);
        expect(geometry.frame.width).toBe(geometry.expectedSize);
        expect(geometry.lastBoardSize).toBe(geometry.expectedSize);
        expect(geometry.inlineWidth).toBe(`${geometry.expectedSize}px`);
    }
    const frameSize = [samples[0].frame.width, samples[0].frame.height];
    const boardSize = [samples[0].board.width, samples[0].board.height];
    expect(samples.map(sample => [sample.frame.width, sample.frame.height]))
        .toEqual(Array(samples.length).fill(frameSize));
    expect(samples.map(sample => [sample.board.width, sample.board.height]))
        .toEqual(Array(samples.length).fill(boardSize));
});

test('Classic board responds to a real panel resize and converges when the sidebar returns', async ({ page }) => {
    await openClassic(page, { width: 1024, height: 768 });
    const expanded = await readGeometry(page);

    await page.locator('#navCollapseBtn').click();
    await waitForFrames(page, 5);
    const collapsed = await readGeometry(page);

    await page.locator('#navCollapseBtn').click();
    await waitForFrames(page, 5);
    const restored = await readGeometry(page);

    for (const geometry of [expanded, collapsed, restored]) {
        expectSquareGeometry(geometry);
        expect(geometry.frame.width).toBe(geometry.expectedSize);
        expect(geometry.lastBoardSize).toBe(geometry.expectedSize);
    }
    expect(collapsed.frame.width).toBeGreaterThan(expanded.frame.width);
    expect(restored.frame).toEqual(expanded.frame);
    expect(restored.board).toEqual(expanded.board);
});

test('Classic board stays square without horizontal overflow on mobile and landscape touch layouts', async ({ page }) => {
    for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 }
    ]) {
        await openClassic(page, viewport, gameState({ observedGame: true, status: 'observing' }));
        const geometry = await readGeometry(page);
        expectSquareGeometry(geometry);
        expect(geometry.lastBoardSize).toBe(geometry.frame.width);
        await page.evaluate(() => window.CaissaYahooClassic.closeTable(false));
    }
});

test('Classic board exit and re-entry rebuild at the same available size', async ({ page }) => {
    await openClassic(page, { width: 1366, height: 768 }, gameState({ observedGame: true, status: 'observing' }));
    const initial = await readGeometry(page);
    await page.evaluate(() => window.CaissaYahooClassic.closeTable(false));
    await expect(page.locator('#ycClassicBoard .board-b72b1')).toHaveCount(0);

    await page.evaluate(value => window.CaissaFICSClient.handleStyle12(value), gameState({
        gameNumber: 42,
        observedGame: false
    }));
    await page.waitForFunction(() => document.querySelectorAll('#ycClassicBoard .square-55d63').length === 64);
    await waitForFrames(page, 3);
    const reentered = await readGeometry(page);

    expectSquareGeometry(reentered);
    expect(reentered.frame).toEqual(initial.frame);
    expect(reentered.board).toEqual(initial.board);
});
