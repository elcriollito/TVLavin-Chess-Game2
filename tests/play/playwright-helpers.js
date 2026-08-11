import { expect } from '@playwright/test';
import { DEFAULT_ENGINE_SCENARIO, installPlayHarness } from './fixtures/fake-engine.js';

export async function instrumentPlay(page, scenario = {}) {
    // The local static server does not implement this deployment-only endpoint.
    // Fulfill it in the browser harness so unrelated auth bootstrap noise cannot
    // mask Play console and asset failures.
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ publishableKey: '' })
    }));
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.addInitScript(installPlayHarness, { ...DEFAULT_ENGINE_SCENARIO, ...scenario });
}

export function monitorRuntime(page) {
    const errors = [];
    const badResponses = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('response', response => {
        if (response.status() >= 400 && new URL(response.url()).origin === 'http://127.0.0.1:8000')
            badResponses.push(`${response.status()} ${response.url()}`);
    });
    return {
        assertClean() {
            expect(badResponses, 'missing same-origin assets').toEqual([]);
            expect(errors, 'unexpected runtime errors').toEqual([]);
        },
        errors,
        badResponses
    };
}

export async function openPlay(page, route = '/play') {
    const response = await page.goto(route);
    expect(new URL(page.url()).pathname).toBe('/play');
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.App?.board ? 1 : 0)).toBe(1);
    return response;
}

export async function startGame(page, options = {}) {
    await page.evaluate((settings) => window.newGame({
        mode: 'analysis',
        color: 'white',
        timeControl: 0,
        ...settings
    }), options);
}

export async function playMove(page, from, to) {
    return page.evaluate(({ from, to }) => window.makeMoveFromSquares(from, to), { from, to });
}

export async function loadPosition(page, fen) {
    return page.evaluate((value) => {
        const loaded = window.App.game.load(value);
        window.App.board.position(window.App.game.fen(), false);
        window.App.moveHistory = [];
        window.App.currentMoveIndex = -1;
        window.App.gameActive = true;
        window.App.isPlayerTurn = true;
        return loaded;
    }, fen);
}

export async function snapshot(page) {
    return page.evaluate(() => ({
        fen: window.App.game.fen(),
        pgn: window.App.game.pgn(),
        history: window.App.game.history(),
        moveHistory: window.App.moveHistory.map(move => move.san),
        gameActive: window.App.gameActive,
        gameMode: window.App.gameMode,
        playerColor: window.App.playerColor,
        isFlipped: window.App.isFlipped,
        pendingPromotion: window.App.pendingPromotion,
        timeControl: window.App.timeControl,
        whiteTimeMs: window.App.whiteTimeMs,
        blackTimeMs: window.App.blackTimeMs,
        gameStatus: { ...window.App.gameStatus },
        harness: window.__caissaPlayHarness.snapshot()
    }));
}
