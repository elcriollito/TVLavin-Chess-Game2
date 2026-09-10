import { test, expect } from '@playwright/test';

async function openFics(page, viewport = { width: 1600, height: 1000 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { window.CAISSA_FICS_AUTO_GUEST_ENABLED = false; });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
}

async function installConnectedFixture(page, overrides = {}) {
    await page.evaluate((fixture) => {
        const client = window.CaissaFICSClient;
        window.__ficsWire = [];
        client.ws = {
            readyState: WebSocket.OPEN,
            send(command) { window.__ficsWire.push(command); }
        };
        Object.assign(client, {
            connected: true,
            authenticated: true,
            connectionState: 'connected',
            ficsUsername: 'LocalGuest',
            sessionGeneration: 7,
            lobbyRefreshInFlight: false,
            lobbyLastRefreshAt: 1000,
            activeTables: [],
            seekActions: [],
            pendingSeek: null,
            pendingObservation: null,
            gameActive: false,
            liveGame: { ...client.createEmptyLiveGameState('idle') },
            ...fixture
        });
        window.CaissaFICSShell.refresh();
    }, overrides);
}

test('Tables renders canonical capped data and leaves missing metadata visibly unknown', async ({ page }) => {
    await openFics(page);
    await installConnectedFixture(page, {
        activeTables: [
            { number: '72', white: 'Alpha', black: 'Beta', whiteRating: '1500', blackRating: '', timeControl: '3+2', observers: '4' },
            { number: '73', white: 'LocalGuest', black: 'Gamma', whiteRating: '', blackRating: '1700', timeControl: '', observers: '' }
        ]
    });

    await expect(page.getByRole('heading', { name: 'Active Tables' })).toBeVisible();
    await expect(page.getByText('this is not a complete server directory')).toBeVisible();
    await expect(page.locator('.fics-rd3-table-card')).toHaveCount(2);
    await expect(page.locator('.fics-rd3-table-card').first()).toContainText('Alpha');
    await expect(page.locator('.fics-rd3-table-card').first()).toContainText('rating —');
    await expect(page.locator('.fics-rd3-table-card').nth(1)).toContainText('time —');
    await expect(page.getByRole('button', { name: /Observe table 73/ })).toBeDisabled();
});

test('Tables empty state does not imply completeness or fabricate games', async ({ page }) => {
    await openFics(page);
    await installConnectedFixture(page, { activeTables: [] });
    await expect(page.getByText('No tables loaded.')).toBeVisible();
    await expect(page.locator('.fics-rd3-table-card')).toHaveCount(0);
    await expect(page.getByText('this is not a complete server directory')).toBeVisible();
});

test('Observe button uses the one canonical client path and suppresses duplicate commands', async ({ page }) => {
    await openFics(page);
    await installConnectedFixture(page, {
        activeTables: [{ number: '72', white: 'Alpha', black: 'Beta', whiteRating: '1500', blackRating: '1600', timeControl: '5+0' }]
    });
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        const canonical = client.switchObservedGame.bind(client);
        window.__observeBoundaryCalls = 0;
        client.switchObservedGame = (...args) => {
            window.__observeBoundaryCalls += 1;
            return canonical(...args);
        };
    });

    await page.getByRole('button', { name: /Observe table 72/ }).click();
    const duplicate = await page.evaluate(() => window.CaissaFICSClient.switchObservedGame('72'));
    expect(duplicate.code).toBe('OBSERVE_IN_PROGRESS');
    expect(await page.evaluate(() => window.__observeBoundaryCalls)).toBe(2);
    expect(await page.evaluate(() => window.__ficsWire)).toEqual(['observe 72']);
    await expect(page.getByText('Opening table #72')).toBeVisible();
});

test('Seek defaults and supported choices map to one canonical seek command', async ({ page }) => {
    await openFics(page);
    await installConnectedFixture(page);
    await page.getByRole('tab', { name: 'Seek' }).click();
    const seek = page.locator('.fics-rd3-seek');

    await expect(seek.getByLabel('Time (minutes)')).toHaveValue('5');
    await expect(seek.getByLabel('Increment (seconds)')).toHaveValue('0');
    await expect(seek.getByLabel('Game', { exact: true })).toHaveValue('unrated');
    await expect(seek.getByLabel('Play as')).toHaveValue('random');

    await seek.getByLabel('Time (minutes)').focus();
    await page.evaluate(() => window.CaissaFICSShell.refresh());
    await expect(seek.getByLabel('Time (minutes)')).toBeFocused();

    await seek.getByLabel('Time (minutes)').fill('10');
    await seek.getByLabel('Increment (seconds)').fill('5');
    await seek.getByLabel('Game', { exact: true }).selectOption('rated');
    await seek.getByLabel('Play as').selectOption('black');
    await seek.getByRole('button', { name: 'Create Table' }).click();

    expect(await page.evaluate(() => window.__ficsWire)).toEqual(['seek 10 5 rated black']);
    const pending = page.locator('.fics-rd3-pending-seek');
    await expect(pending.getByText('Waiting for opponent', { exact: true })).toBeVisible();
    await expect(pending).toContainText('server acknowledgement is not available');
    await expect(pending).toContainText('10+5');
    await expect(pending).toContainText('Rated · Play as Black');
});

test('Seek validation blocks invalid values and delivery failure stays honest and retryable', async ({ page }) => {
    await openFics(page);
    await installConnectedFixture(page);
    await page.getByRole('tab', { name: 'Seek' }).click();
    const minutes = page.getByLabel('Time (minutes)');
    await minutes.fill('0');
    expect(await minutes.evaluate((input) => input.checkValidity())).toBe(false);
    await page.getByRole('button', { name: 'Create Table' }).click();
    expect(await page.evaluate(() => window.__ficsWire)).toEqual([]);

    await minutes.fill('3');
    await page.evaluate(() => { window.CaissaFICSClient.ws.readyState = WebSocket.CLOSED; });
    await page.getByRole('button', { name: 'Create Table' }).click();
    await expect(page.getByRole('alert')).toContainText('seek command was not delivered');
    await expect(page.getByRole('button', { name: 'Create Table' })).toBeEnabled();
    expect(await page.evaluate(() => window.CaissaFICSClient.pendingSeek.status)).toBe('error');
});

test('pending seek cancellation and Players refresh retain canonical ownership', async ({ page }) => {
    await openFics(page, { width: 885, height: 611 });
    await installConnectedFixture(page, {
        pendingSeek: {
            minutes: 5, increment: 0, timeControl: '5+0', rated: false, color: 'random',
            label: 'Your active seek', status: 'pending', operation: 'create', deliveryCode: 'SENT'
        }
    });

    await expect(page.getByRole('tab', { name: 'Seek' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.evaluate(() => window.__ficsWire)).toEqual(['unseek']);
    await expect(page.getByRole('button', { name: 'Canceling…' })).toBeDisabled();
    expect(await page.evaluate(() => window.CaissaFICSClient.pendingSeek.status)).toBe('cancel_requested');

    await page.getByRole('tab', { name: 'Players' }).click();
    await expect(page.locator('[data-fics-body-view="players"]')).toContainText('Loading FICS players…');
    expect(await page.evaluate(() => window.__ficsWire)).toEqual(['unseek', 'who v']);
});

test('active local game keeps Tables and Seek actions unavailable without disturbing the board', async ({ page }) => {
    await openFics(page);
    await installConnectedFixture(page, {
        activeTables: [{ number: '91', white: 'Alpha', black: 'Beta', timeControl: '3+0' }],
        gameActive: true,
        liveGame: {
            gameNumber: 90, whiteName: 'LocalGuest', blackName: 'Opponent', userColor: 'white', relation: 1,
            sideToMove: 'w', whiteClock: 180, blackClock: 180, currentFen: 'start', gameActive: true,
            observedGame: false, status: 'playing', result: null
        }
    });
    const board = await page.evaluateHandle(() => document.getElementById('ficsBoardContainer'));

    await page.getByRole('tab', { name: 'Tables' }).click();
    await expect(page.getByRole('button', { name: /Observe table 91/ })).toBeDisabled();
    await page.getByRole('tab', { name: 'Seek' }).click();
    await expect(page.getByRole('button', { name: 'Create Table' })).toBeDisabled();
    await expect(page.getByText('Return from the active game before creating a new table.')).toBeVisible();
    expect(await page.evaluate(() => window.__ficsWire)).toEqual([]);
    expect(await page.evaluate((node) => node === document.getElementById('ficsBoardContainer'), board)).toBe(true);
});
