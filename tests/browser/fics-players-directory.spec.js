import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openFics(page, viewport = { width: 1600, height: 1000 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { window.CAISSA_FICS_AUTO_GUEST_ENABLED = false; });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
}

function player(index, overrides = {}) {
    const rating = 1200 + index;
    return {
        handle: `Player${String(index).padStart(3, '0')}`,
        ratings: {
            standard: { value: rating - 50, state: 'established', marker: null },
            blitz: { value: rating, state: 'established', marker: null },
            lightning: { value: rating + 50, state: 'established', marker: null }
        },
        onFor: '12', idle: null, gameNumber: null, playing: false, open: true,
        available: true, unratedOnly: false, registered: true, observing: false,
        codes: [], annotationsComplete: true, annotationsUnknown: false, serverOrder: index,
        ...overrides
    };
}

async function installDirectory(page, entries, overrides = {}) {
    await page.evaluate(({ entries: fixtureEntries, overrides: fixtureOverrides }) => {
        const client = window.CaissaFICSClient;
        window.__ficsWire = [];
        client.ws = { readyState: WebSocket.OPEN, send(command) { window.__ficsWire.push(command); }, close() {} };
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected', ficsUsername: 'LocalGuest',
            sessionGeneration: 7, playersRequest: null, playersError: null,
            playersDirectory: { entries: fixtureEntries, count: fixtureEntries.length, refreshedAt: 1000, sessionGeneration: 7 },
            gameActive: false, pendingSeek: null, activeTables: [], seekActions: [],
            liveGame: { ...client.createEmptyLiveGameState('idle') },
            ...fixtureOverrides
        });
        window.CaissaFICSShell.refresh();
    }, { entries, overrides });
    await page.getByRole('tab', { name: 'Players' }).click();
}

test('disconnected Players BODY stays concise and Refresh fails closed', async ({ page }) => {
    await openFics(page);
    await page.getByRole('tab', { name: 'Players' }).click();
    await expect(page.getByText('No players loaded.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    await expect(page.locator('[data-fics-body-view="players"]')).not.toContainText('Connection unavailable');
});

test('validated zero-player directory is distinct from an unfetched directory', async ({ page }) => {
    await openFics(page);
    await installDirectory(page, []);
    await expect(page.getByText('0 connected players · Blitz rating')).toBeVisible();
    await expect(page.getByText('No connected players.')).toBeVisible();
    await expect(page.getByText('No players loaded.')).toHaveCount(0);
});

test('ten-player directory is compact, searchable, sortable, and sends no command per keystroke', async ({ page }) => {
    await openFics(page);
    const entries = Array.from({ length: 10 }, (_, index) => player(index));
    entries[2] = player(2, { handle: 'Alpha', gameNumber: 44, playing: true, available: false });
    entries[3] = player(3, { handle: 'Observer', observing: true });
    entries[4] = player(4, {
        handle: 'GuestFour', registered: false, codes: ['U'],
        ratings: {
            standard: { value: null, state: 'unregistered', marker: null },
            blitz: { value: null, state: 'unregistered', marker: null },
            lightning: { value: null, state: 'unregistered', marker: null }
        }
    });
    await installDirectory(page, entries);
    await expect(page.locator('.fics-rd10-table tbody tr')).toHaveCount(10);
    const firstRowHeight = await page.locator('.fics-rd10-table tbody tr').first().evaluate(node => node.getBoundingClientRect().height);
    expect(firstRowHeight).toBeLessThanOrEqual(35);
    await expect(page.getByRole('columnheader', { name: 'Blitz' })).toBeVisible();
    await expect(page.getByText('Playing #44')).toBeVisible();
    await expect(page.getByText('Observing', { exact: true })).toBeVisible();
    await expect(page.locator('.fics-rd10-table td.is-rating', { hasText: '—' })).toBeVisible();

    await page.getByLabel('Search players').fill('alpha');
    await expect(page.locator('.fics-rd10-table tbody tr')).toHaveCount(1);
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__ficsWire)).toEqual([]);
    await page.getByLabel('Search players').fill('');
    await page.getByLabel('Sort players').selectOption('name');
    await expect(page.locator('.fics-rd10-handle').first()).toHaveText('Alpha');
    expect(await page.evaluate(() => window.CaissaFICSClient.playersDirectory.entries[0].handle)).toBe('Player000');
});

test('Refresh uses the canonical request, preserves data while loading, and retains it on failure', async ({ page }) => {
    await openFics(page);
    await installDirectory(page, [player(1), player(2)]);
    await page.getByRole('button', { name: 'Refresh' }).click();
    expect(await page.evaluate(() => window.__ficsWire)).toEqual(['who v']);
    await expect(page.getByText('Refreshing players…')).toBeVisible();
    await expect(page.locator('.fics-rd10-table tbody tr')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Loading…' })).toBeDisabled();
    await page.evaluate(() => window.CaissaFICSClient.consumePlayersData(
        `\n+----------------------------------------------------------------------------+\n` +
        `|        User              Standard    Blitz       Lightning   On for   Idle |\n` +
        `+----------------------------------------------------------------------------+\n` +
        `|       Broken ??? 1600 1700 12                                             |\n`
    ));
    await expect(page.getByText('Refresh failed. Showing the previous directory.')).toBeVisible();
    await expect(page.locator('.fics-rd10-table tbody tr')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(await page.evaluate(() => window.CaissaFICSClient.messageBuffer.at(-1))).toBe('[CAISSA] Unable to refresh player directory.');
});

test('175-player BODY scrolls independently with no horizontal overflow', async ({ page }) => {
    await openFics(page);
    await installDirectory(page, Array.from({ length: 175 }, (_, index) => player(index)));
    await expect(page.locator('.fics-rd10-table tbody tr')).toHaveCount(175);
    const geometry = await page.evaluate(() => {
        const body = document.querySelector('.fics-rd2-workspace-body');
        const workspace = document.querySelector('.fics-rd2-workspace');
        return {
            bodyScrollable: body.scrollHeight > body.clientHeight,
            pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            workspaceOverflow: workspace.scrollWidth - workspace.clientWidth
        };
    });
    expect(geometry.bodyScrollable).toBe(true);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
    expect(geometry.workspaceOverflow).toBeLessThanOrEqual(0);
});

test('500-player projection renders within budget without mutating server order', async ({ page }) => {
    await openFics(page);
    const entries = Array.from({ length: 500 }, (_, index) => player(index));
    const elapsed = await page.evaluate((fixtureEntries) => {
        const client = window.CaissaFICSClient;
        client.connected = true;
        client.authenticated = true;
        client.connectionState = 'connected';
        client.sessionGeneration = 12;
        client.playersRequest = null;
        client.playersError = null;
        client.playersDirectory = { entries: fixtureEntries, count: 500, refreshedAt: 1, sessionGeneration: 12 };
        const start = performance.now();
        window.CaissaFICSShell.selectLobbyView('players');
        return performance.now() - start;
    }, entries);
    await expect(page.locator('.fics-rd10-table tbody tr')).toHaveCount(500);
    expect(elapsed).toBeLessThan(500);
    expect(await page.evaluate(() => window.CaissaFICSClient.playersDirectory.entries[0].serverOrder)).toBe(0);
});

for (const [name, viewport] of [
    ['tablet', { width: 820, height: 900 }],
    ['mobile portrait', { width: 390, height: 844 }]
]) {
    test(`${name} keeps usernames, search, and Players scrolling within the workspace`, async ({ page }) => {
        await openFics(page, viewport);
        await installDirectory(page, Array.from({ length: 30 }, (_, index) => player(index)));
        await expect(page.getByLabel('Search players')).toBeVisible();
        const geometry = await page.evaluate(() => {
            const list = document.querySelector('.fics-rd10-table');
            const workspace = document.querySelector('.fics-rd2-workspace');
            return {
                listLeft: list.getBoundingClientRect().left,
                listRight: list.getBoundingClientRect().right,
                workspaceLeft: workspace.getBoundingClientRect().left,
                workspaceRight: workspace.getBoundingClientRect().right,
                pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
        });
        expect(geometry.listLeft).toBeGreaterThanOrEqual(geometry.workspaceLeft);
        expect(geometry.listRight).toBeLessThanOrEqual(geometry.workspaceRight);
        expect(geometry.pageOverflow).toBeLessThanOrEqual(0);
        await page.getByLabel('Search players').fill('Player029');
        await expect(page.locator('.fics-rd10-table tbody tr')).toHaveCount(1);
    });
}

test('Players BODY has no serious or critical automated accessibility violations', async ({ page }) => {
    await openFics(page);
    await installDirectory(page, Array.from({ length: 10 }, (_, index) => player(index)));
    const results = await new AxeBuilder({ page }).include('[data-fics-body-view="players"]').analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact))).toEqual([]);
});
