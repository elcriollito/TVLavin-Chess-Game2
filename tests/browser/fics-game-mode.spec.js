import { test, expect } from '@playwright/test';

async function openFics(page, viewport = { width: 1600, height: 1000 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { window.CAISSA_FICS_AUTO_GUEST_ENABLED = false; });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
}

function moves(count = 12, start = 1) {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'];
    return Array.from({ length: count }, (_, index) => ({
        moveNumber: start + Math.floor(index / 2),
        color: index % 2 ? 'black' : 'white',
        san: sans[index % sans.length],
        fen: `fixture-${index}`
    }));
}

async function installGame(page, mode, options = {}) {
    const fixtureMoves = options.moves || moves();
    await page.evaluate(({ requestedMode, fixtureMoves, fixtureOptions }) => {
        const client = window.CaissaFICSClient;
        window.__ficsWire = [];
        client.ws = { readyState: WebSocket.OPEN, send(command) { window.__ficsWire.push(command); } };
        const observing = requestedMode === 'observing';
        const ended = requestedMode === 'ended';
        Object.assign(client, {
            connected: fixtureOptions.connected ?? true,
            authenticated: fixtureOptions.authenticated ?? true,
            connectionState: fixtureOptions.connectionState || 'connected',
            ficsUsername: 'LocalGuest',
            sessionGeneration: 12,
            gameActive: requestedMode === 'playing',
            pendingSeek: null,
            pendingObservation: null,
            observationExitInFlight: false,
            pendingGameActions: { resign: false, draw: false },
            moveHistory: fixtureMoves,
            pgnStartFen: observing ? '8/8/8/8/8/8/8/K6k b - - 0 20' : null,
            pgnResult: ended ? '0-1' : '*',
            activeTables: [{ number: '120', white: 'Alpha', black: 'Beta', timeControl: '5+0' }],
            liveGame: {
                ...client.createEmptyLiveGameState(requestedMode),
                gameNumber: 119,
                whiteName: 'WhitePlayer',
                blackName: 'BlackPlayer',
                userColor: requestedMode === 'playing' ? 'white' : null,
                relation: requestedMode === 'playing' ? 1 : 0,
                sideToMove: 'w',
                whiteClock: 287,
                blackClock: 296,
                currentFen: 'fixture-position',
                gameActive: requestedMode === 'playing',
                observedGame: observing,
                status: requestedMode,
                result: ended ? '0-1' : null,
                resultModel: ended ? {
                    result: '0-1', winner: 'BlackPlayer', loser: 'WhitePlayer',
                    terminationReason: 'CHECKMATE', terminal: true,
                    summary: 'BlackPlayer won by checkmate.'
                } : null
            }
        });
        client.updatePlayerBars();
        window.CaissaFICSShell.refresh();
    }, { requestedMode: mode, fixtureMoves, fixtureOptions: options });
}

test('PLAYING owns the BODY, deselects lobby tabs, and renders canonical paired notation', async ({ page }) => {
    await openFics(page);
    const fixtureMoves = moves(5);
    fixtureMoves[4].san = null;
    await installGame(page, 'playing', { moves: fixtureMoves });

    await expect(page.locator('[data-fics-body-view="game"]')).toBeVisible();
    for (const name of ['Tables', 'Players', 'Seek']) {
        await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'false');
    }
    await expect(page.getByRole('heading', { name: 'WhitePlayer vs BlackPlayer' })).toBeVisible();
    const rows = page.locator('.fics-rd4-move-row:not(.is-header)');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('1.');
    await expect(rows.first()).toContainText('e4');
    await expect(rows.first()).toContainText('e5');
    await expect(rows.last().locator('.fics-rd4-san').first()).toHaveText('—');
    await expect(page.getByRole('button', { name: 'Resign' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Offer Draw' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PGN' })).toBeVisible();
    await expect(page.locator('#ficsGameControls')).toBeHidden();
});

test('Resign is guarded and played-game delivery suppresses duplicate commands without false acknowledgement', async ({ page }) => {
    await openFics(page);
    await installGame(page, 'playing');

    await page.getByRole('button', { name: 'Resign' }).click();
    await expect(page.getByRole('button', { name: 'Confirm Resign' })).toBeVisible();
    expect(await page.evaluate(() => window.__ficsWire)).toEqual([]);
    await page.getByRole('button', { name: 'Confirm Resign' }).click();
    await expect(page.getByText('FICS confirmation is pending')).toBeVisible();
    const duplicate = await page.evaluate(() => window.CaissaFICSClient.resign());
    expect(duplicate.code).toBe('ACTION_IN_PROGRESS');
    expect(await page.evaluate(() => window.__ficsWire)).toEqual(['resign']);

    await page.getByRole('button', { name: 'Offer Draw' }).click();
    await expect(page.getByText('Draw offer delivered to the connection')).toBeVisible();
    expect(await page.evaluate(() => window.__ficsWire)).toEqual(['resign', 'draw']);
});

test('OBSERVING discloses partial history, omits player actions, and exits through the canonical boundary', async ({ page }) => {
    await openFics(page);
    await installGame(page, 'observing', { moves: moves(4, 20) });
    await expect(page.getByText('Observation history is locally captured')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download partial PGN' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resign' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Offer Draw' })).toHaveCount(0);

    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        const canonical = client.leaveObservedGame.bind(client);
        window.__leaveObservationCalls = 0;
        client.leaveObservedGame = (...args) => {
            window.__leaveObservationCalls += 1;
            return canonical(...args);
        };
    });
    await page.getByRole('button', { name: 'Leave Observation' }).click();
    expect(await page.evaluate(() => window.__leaveObservationCalls)).toBe(1);
    expect(await page.evaluate(() => window.__ficsWire)).toEqual(['unobserve 119']);
    await expect(page.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'true');
});

test('GAME_OVER uses normalized result, retains final moves, downloads PGN, and returns to lobby presentation', async ({ page }) => {
    await openFics(page);
    await installGame(page, 'ended');
    await expect(page.getByText('Black wins', { exact: true })).toBeVisible();
    await expect(page.getByText('BlackPlayer won by checkmate.')).toBeVisible();
    await expect(page.locator('.fics-rd4-move-row:not(.is-header)')).toHaveCount(6);
    await expect(page.getByRole('button', { name: 'Resign' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Offer Draw' })).toHaveCount(0);

    await page.evaluate(() => {
        window.__pgnCalls = 0;
        window.CaissaFICSClient.downloadPGN = () => {
            window.__pgnCalls += 1;
            return { ok: true, code: 'DOWNLOADED' };
        };
    });
    await page.getByRole('button', { name: 'Download PGN' }).click();
    expect(await page.evaluate(() => window.__pgnCalls)).toBe(1);
    await page.getByRole('button', { name: 'Return to Lobby' }).click();
    await expect(page.getByRole('heading', { name: 'Active Tables' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return to active FICS game' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Seek' }).click();
    await expect(page.getByRole('button', { name: 'Create Table' })).toBeEnabled();
    expect(await page.evaluate(() => window.CaissaFICSClient.liveGame.result)).toBe('0-1');
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        client.gameActive = true;
        client.liveGame = { ...client.liveGame, gameNumber: 121, gameActive: true, observedGame: false,
            status: 'playing', result: null, resultModel: null, userColor: 'white', relation: 1 };
        window.CaissaFICSShell.refresh();
    });
    await expect(page.locator('[data-fics-body-view="game"]')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Seek' })).toHaveAttribute('aria-selected', 'false');
});

test('temporary Tables and Players browsing preserves canonical game data and Game restores scroll state', async ({ page }) => {
    await openFics(page);
    await installGame(page, 'playing', { moves: moves(60) });
    const scroller = page.locator('[data-fics-game-moves]');
    await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await scroller.evaluate((node) => { node.scrollTop = 37; });
    const before = await page.evaluate(() => JSON.stringify({
        liveGame: window.CaissaFICSClient.liveGame,
        moves: window.CaissaFICSClient.moveHistory
    }));

    await page.getByRole('tab', { name: 'Players' }).click();
    await expect(page.getByText('Player directory unavailable.')).toBeVisible();
    await page.getByRole('tab', { name: 'Tables' }).click();
    await expect(page.getByRole('button', { name: 'Return to active FICS game' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to active FICS game' }).click();
    await expect(page.locator('[data-fics-body-view="game"]')).toBeVisible();
    await expect.poll(() => page.locator('[data-fics-game-moves]').evaluate((node) => node.scrollTop)).toBe(37);
    expect(await page.evaluate(() => JSON.stringify({
        liveGame: window.CaissaFICSClient.liveGame,
        moves: window.CaissaFICSClient.moveHistory
    }))).toBe(before);
    expect(await page.evaluate(() => window.__ficsWire)).toEqual([]);
});

test('game actions fail closed for unavailable, reconnecting, error, and disconnected channels', async ({ page }) => {
    await openFics(page);
    await installGame(page, 'playing', { connected: false, authenticated: true });
    await expect(page.getByRole('button', { name: 'Resign' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Offer Draw' })).toBeDisabled();

    for (const state of ['reconnecting', 'error', 'disconnected']) {
        await page.evaluate((nextState) => {
            const client = window.CaissaFICSClient;
            client.connected = false;
            client.authenticated = nextState === 'disconnected' ? false : client.authenticated;
            client.connectionState = nextState;
            window.CaissaFICSShell.refresh();
        }, state);
        await expect(page.locator('[data-fics-game-action]')).toHaveCount(0);
        expect(await page.evaluate(() => window.__ficsWire)).toEqual([]);
    }
});

test('Game Mode stays internally scrollable and contained across desktop, tablet, portrait, and landscape', async ({ page }) => {
    await openFics(page);
    await installGame(page, 'playing', { moves: moves(70) });
    for (const viewport of [
        { width: 1600, height: 1000 },
        { width: 834, height: 1112 },
        { width: 390, height: 844 },
        { width: 844, height: 390 }
    ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(80);
        const geometry = await page.evaluate(() => {
            const section = document.getElementById('ficsSection');
            const board = document.querySelector('[data-fics-shell-region="board"]').getBoundingClientRect();
            const workspace = document.querySelector('[data-fics-shell-region="workspace"]').getBoundingClientRect();
            const moves = document.querySelector('[data-fics-game-moves]');
            return {
                overflow: section.scrollWidth - section.clientWidth,
                moveScrolls: moves.scrollHeight > moves.clientHeight,
                boardFirst: board.top <= workspace.top,
                boardWidth: document.getElementById('ficsBoardContainer').getBoundingClientRect().width
            };
        });
        expect(geometry.overflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
        expect(geometry.moveScrolls, `${viewport.width}x${viewport.height}`).toBe(true);
        expect(geometry.boardFirst, `${viewport.width}x${viewport.height}`).toBe(true);
        expect(geometry.boardWidth, `${viewport.width}x${viewport.height}`).toBeGreaterThan(250);
        await page.getByRole('button', { name: 'Offer Draw' }).scrollIntoViewIfNeeded();
        await expect(page.getByRole('button', { name: 'Offer Draw' })).toBeVisible();
        await page.locator('#ficsConsoleToggle').scrollIntoViewIfNeeded();
        await expect(page.locator('#ficsConsoleToggle')).toBeVisible();
    }
});
