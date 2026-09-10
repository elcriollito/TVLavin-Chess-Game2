import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openFics(page, viewport = { width: 1600, height: 1000 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
    });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
}

async function setLobbyState(page) {
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected',
            ficsUsername: 'RDFiveGuest', gameActive: false, pendingSeek: null,
            liveGame: { ...client.createEmptyLiveGameState('idle') }
        });
        client.updateConnectionStatus(true);
        client.updateIdentityStatus();
        window.CaissaFICSShell.refresh();
    });
}

async function setPlayingState(page) {
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        const moves = [];
        for (let index = 0; index < 60; index += 1) {
            moves.push({ moveNumber: Math.floor(index / 2) + 1, color: index % 2 ? 'black' : 'white', san: index % 2 ? 'e5' : 'e4' });
        }
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected', gameActive: true,
            myColor: 'white', ficsUsername: 'RDFivePlayer', moveHistory: moves,
            liveGame: {
                ...client.createEmptyLiveGameState('playing'), gameNumber: 505,
                whiteName: 'RDFivePlayer', blackName: 'Opponent', userColor: 'white', relation: 1,
                sideToMove: 'w', whiteClock: 300, blackClock: 298, currentFen: 'start',
                gameActive: true, observedGame: false
            }
        });
        client.updateConnectionStatus(true);
        client.updateIdentityStatus();
        window.CaissaFICSShell.refresh();
    });
}

test('Settings opens from one compact control and owns the existing diagnostic nodes', async ({ page }) => {
    await openFics(page);
    const settings = page.getByRole('button', { name: 'Open FICS settings' });
    await expect(settings).toBeVisible();
    await settings.click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    const ownership = await page.evaluate(() => ({
        settingsButtons: document.querySelectorAll('.fics-rd5-settings-button').length,
        connections: document.querySelectorAll('.fics-connection').length,
        gatewayInSettings: Boolean(document.querySelector('#ficsRd5SettingsPanel #ficsGatewayStatus')),
        sessionInSettings: Boolean(document.querySelector('#ficsRd5SettingsPanel #ficsGameStatus')),
        diagnosticsInFoot: Boolean(document.querySelector('.fics-rd2-workspace-foot .fics-gateway-details'))
    }));
    expect(ownership).toEqual({ settingsButtons: 1, connections: 1, gatewayInSettings: true,
        sessionInSettings: true, diagnosticsInFoot: false });
});

test('reparented Test Gateway and Sounds retain their existing handlers', async ({ page }) => {
    await openFics(page);
    await page.getByRole('button', { name: 'Open FICS settings' }).click();
    await page.evaluate(() => {
        window.__rd5GatewayTests = 0;
        window.CaissaFICSClient.testGateway = () => { window.__rd5GatewayTests += 1; };
    });
    await page.locator('#ficsTestGatewayBtn').click();
    expect(await page.evaluate(() => window.__rd5GatewayTests)).toBe(1);
    const sound = page.locator('#ficsSoundToggle');
    const before = await sound.getAttribute('aria-pressed');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
});

test('session identity and reconnect/error status live in compact page chrome', async ({ page }) => {
    await openFics(page);
    await expect(page.locator('.fics-disclaimer')).toContainText('About FICS:');
    await expect(page.locator('.fics-disclaimer')).not.toContainText('Connecting to external server');
    await expect(page.locator('.fics-rd2-workspace-foot #ficsConnectBtn')).toHaveCount(0);
    await expect(page.locator('.fics-rd7-session-button')).toBeVisible();
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('Disconnected');
    expect(await page.locator('#ficsRd5SettingsPanel #ficsConnectBtn').count()).toBe(0);
    await page.evaluate(() => window.CaissaFICSClient.setConnectionState('reconnecting', 'Connection lost. Reconnecting…'));
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('Reconnecting…');
    await page.evaluate(() => window.CaissaFICSClient.setConnectionState('error', 'Unable to connect'));
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('Connection error');
});

test('Console collapses and expands without replacing history or command input', async ({ page }) => {
    await openFics(page);
    const toggle = page.locator('#ficsConsoleToggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#ficsCommandInput').fill('who');
    await page.evaluate(() => window.CaissaFICSClient.logToConsole('RD-005 retained history'));
    await page.evaluate(() => { window.__rd5ConsoleNode = document.getElementById('ficsConsole'); });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(page.locator('#ficsConsole')).toContainText('RD-005 retained history');
    await expect(page.locator('#ficsCommandInput')).toHaveValue('who');
    expect(await page.evaluate(() => window.__rd5ConsoleNode === document.getElementById('ficsConsole'))).toBe(true);
});

test('successful authentication returns Console to its compact default', async ({ page }) => {
    await openFics(page);
    await page.locator('#ficsConsoleToggle').click();
    await expect(page.locator('#ficsConsoleToggle')).toHaveAttribute('aria-expanded', 'true');
    await setLobbyState(page);
    await expect(page.locator('#ficsConsoleToggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('RDFiveGuest');
    await expect(page.locator('.fics-rd7-console-status')).toHaveCount(0);
});

test('Game Mode notation consumes the recovered BODY and Settings overlays without resizing it', async ({ page }) => {
    await openFics(page);
    await setPlayingState(page);
    const before = await page.evaluate(() => ({
        body: document.getElementById('ficsRd2Body').getBoundingClientRect().height,
        moves: document.querySelector('.fics-rd4-move-scroll').getBoundingClientRect().height,
        board: document.getElementById('ficsBoardContainer').getBoundingClientRect().width
    }));
    expect(before.body).toBeGreaterThan(600);
    expect(before.moves).toBeGreaterThan(430);
    await page.getByRole('button', { name: 'Open FICS settings' }).click();
    const after = await page.evaluate(() => ({
        body: document.getElementById('ficsRd2Body').getBoundingClientRect().height,
        board: document.getElementById('ficsBoardContainer').getBoundingClientRect().width
    }));
    expect(Math.abs(after.body - before.body)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.board - before.board)).toBeLessThanOrEqual(1);
});

test('Tables and Seek share the enlarged BODY above the compact FOOT', async ({ page }) => {
    await openFics(page);
    await setLobbyState(page);
    await page.getByRole('tab', { name: 'Tables' }).click();
    const tablesHeight = await page.locator('#ficsRd2Body').evaluate(node => node.getBoundingClientRect().height);
    await page.getByRole('tab', { name: 'Seek' }).click();
    const seekHeight = await page.locator('#ficsRd2Body').evaluate(node => node.getBoundingClientRect().height);
    expect(tablesHeight).toBeGreaterThan(600);
    expect(Math.abs(seekHeight - tablesHeight)).toBeLessThanOrEqual(1);
    await expect(page.locator('[data-fics-body-view="seek"]')).toBeVisible();
});

test('Settings contains focus, closes on Escape, and returns focus to its launcher', async ({ page }) => {
    await openFics(page);
    const launcher = page.getByRole('button', { name: 'Open FICS settings' });
    await launcher.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Close FICS settings' })).toBeFocused();
    expect(await page.locator('[data-fics-redesign-shell]').evaluate(node => node.inert)).toBe(true);
    await page.locator('#ficsTestGatewayBtn').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Close FICS settings' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
    await expect(launcher).toBeFocused();
    expect(await page.locator('[data-fics-redesign-shell]').evaluate(node => node.inert)).toBe(false);
});

test('mobile Settings is an overlay and the FICS section has no horizontal overflow', async ({ page }) => {
    await openFics(page, { width: 390, height: 844 });
    const before = await page.locator('[data-fics-shell-region="workspace"]').evaluate(node => node.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Open FICS settings' }).click();
    const geometry = await page.evaluate(() => {
        const section = document.getElementById('ficsSection');
        const panel = document.getElementById('ficsRd5SettingsPanel').getBoundingClientRect();
        const workspace = document.querySelector('[data-fics-shell-region="workspace"]').getBoundingClientRect();
        return { panel: panel.toJSON(), workspace: workspace.toJSON(), overflow: section.scrollWidth - section.clientWidth };
    });
    expect(geometry.panel.width).toBeLessThanOrEqual(390);
    expect(Math.abs(geometry.workspace.width - before)).toBeLessThanOrEqual(1);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
});

test('feature-flag rollback restores legacy hierarchy and every canonical node identity', async ({ page }) => {
    await openFics(page);
    const result = await page.evaluate(() => {
        const ids = ['ficsBoardContainer', 'ficsConnectBtn', 'ficsConnectionStatus', 'ficsGatewayStatus',
            'ficsGameStatus', 'ficsSoundToggle', 'ficsTestGatewayBtn', 'ficsConsole', 'ficsCommandInput'];
        const before = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
        const client = window.CaissaFICSClient;
        const disabled = window.CaissaFICSShell.setEnabled(false);
        const section = document.getElementById('ficsSection');
        return {
            disabled,
            identities: ids.every(id => before[id] === document.getElementById(id)),
            clientPreserved: client === window.CaissaFICSClient,
            chromeRemoved: section.querySelectorAll('.fics-rd7-session-chrome, .fics-rd5-settings-layer').length,
            gatewayRestored: Boolean(section.querySelector('.fics-connection-info > .fics-gateway-details')),
            sessionRestored: Boolean(section.querySelector('.fics-connection-header > .fics-session-column')),
            consoleRestored: Boolean(section.querySelector('.fics-board-section > .fics-console-section'))
        };
    });
    expect(result).toEqual({ disabled: true, identities: true, clientPreserved: true, chromeRemoved: 0,
        gatewayRestored: true, sessionRestored: true, consoleRestored: true });
});

test('disconnected BODY defaults to Tables instead of a connection explanation', async ({ page }) => {
    await openFics(page);
    await expect(page.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-fics-body-view="tables"]')).toBeVisible();
    await expect(page.locator('[data-fics-body-view="tables"]')).toContainText('No tables loaded.');
    await expect(page.locator('#ficsRd2Body')).not.toContainText('Review the existing FICS connection controls');
});

test('disconnected Seek remains visible and Create Table fails closed', async ({ page }) => {
    await openFics(page);
    await page.getByRole('tab', { name: 'Seek' }).click();
    await expect(page.locator('[data-fics-body-view="seek"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Table' })).toBeDisabled();
    const result = await page.evaluate(() => window.CaissaFICSClient.requestSeek({ minutes: 5, increment: 0 }));
    expect(result).toMatchObject({ ok: false, code: 'NOT_CONNECTED', state: 'error' });
});

test('canonical connection transitions append truthful hybrid Console messages', async ({ page }) => {
    await openFics(page);
    const messages = await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        client.messageBuffer = [];
        client.latencyMs = null;
        client.setConnectionState('connecting');
        client.setConnectionState('error');
        client.setConnectionState('reconnecting');
        client.setConnectionState('disconnected');
        return [...client.messageBuffer];
    });
    expect(messages).toEqual([
        '[CAISSA] Connecting to FICS as guest...',
        '[CAISSA] Unable to connect to FICS.',
        '[ERROR] Connection lost.',
        '[CAISSA] Reconnecting to FICS...',
        '[CAISSA] Disconnected from FICS.'
    ]);
});

test('hybrid Console preserves raw FICS and command lines in one stream', async ({ page }) => {
    await openFics(page);
    const result = await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        client.messageBuffer = [];
        client.logToConsole('fics% help', 'FICS');
        client.logToConsole('> games', 'COMMAND');
        client.logToConsole('Guest session ready.');
        return {
            messages: [...client.messageBuffer],
            consoles: document.querySelectorAll('#ficsConsole').length,
            inputs: document.querySelectorAll('#ficsCommandInput').length,
            text: document.getElementById('ficsConsole').textContent
        };
    });
    expect(result.messages).toEqual(['[FICS] fics% help', '[COMMAND] > games', '[CAISSA] Guest session ready.']);
    expect(result.consoles).toBe(1);
    expect(result.inputs).toBe(1);
    expect(result.text).toContain('[FICS] fics% help');
});

test('top session control owns permanent state while FOOT remains Console-only', async ({ page }) => {
    await openFics(page);
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        Object.assign(client, { connected: true, authenticated: true, connectionState: 'connected', latencyMs: null });
        window.CaissaFICSShell.refresh();
    });
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('Guest');
    await expect(page.locator('.fics-rd2-workspace-foot .fics-rd7-console-status')).toHaveCount(0);
    await page.evaluate(() => {
        window.CaissaFICSClient.latencyMs = 84;
        window.CaissaFICSShell.refresh();
    });
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('Guest');
    await expect(page.locator('#ficsRd5ConsoleSummary')).toHaveCount(0);
});

test('Console suppresses repeated navigation advisories but preserves repeated raw FICS lines', async ({ page }) => {
    await openFics(page);
    const messages = await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        client.messageBuffer = [];
        client.logToConsole('Connect to FICS to load tables.');
        client.logToConsole('Connect to FICS to load players.');
        client.logToConsole('Connect to FICS to load tables.');
        client.logToConsole('fics% repeated', 'FICS');
        client.logToConsole('fics% repeated', 'FICS');
        return [...client.messageBuffer];
    });
    expect(messages).toEqual([
        '[CAISSA] Connect to FICS to load tables.',
        '[CAISSA] Connect to FICS to load players.',
        '[FICS] fics% repeated',
        '[FICS] fics% repeated'
    ]);
});

test('collapsed Console is a launcher and expanded Console exposes connection messages', async ({ page }) => {
    await openFics(page);
    await page.evaluate(() => window.CaissaFICSClient.setConnectionState('reconnecting'));
    await page.locator('#ficsConsoleToggle').click();
    await expect(page.locator('#ficsConsole')).toContainText('[CAISSA] Reconnecting to FICS...');
    await page.locator('#ficsConsoleToggle').click();
    await expect(page.locator('#ficsConsoleToggle')).toHaveAttribute('aria-expanded', 'false');
});

test('Settings drawer has no serious or critical automated accessibility violations', async ({ page }) => {
    await openFics(page, { width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open FICS settings' }).click();
    const results = await new AxeBuilder({ page }).include('#ficsRd5SettingsPanel').analyze();
    expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact))).toEqual([]);
});
