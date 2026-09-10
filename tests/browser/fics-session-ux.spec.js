import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openSession(page, viewport = { width: 1600, height: 1000 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        class SessionSocket {
            static CONNECTING = 0;
            static OPEN = 1;
            static CLOSING = 2;
            static CLOSED = 3;
            static instances = [];
            constructor(url) {
                this.url = url;
                this.readyState = SessionSocket.CONNECTING;
                this.sent = [];
                SessionSocket.instances.push(this);
            }
            send(value) { this.sent.push(value); }
            open() { this.readyState = SessionSocket.OPEN; this.onopen?.(); }
            message(value) { this.onmessage?.({ data: value }); }
            close(code = 1000, reason = '') {
                this.readyState = SessionSocket.CLOSED;
                this.onclose?.({ code, reason });
            }
        }
        window.WebSocket = SessionSocket;
        window.__SessionSocket = SessionSocket;
    });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
}

async function authenticateGuest(page, username = 'GuestAUTO') {
    await page.evaluate((name) => {
        const socket = window.__SessionSocket.instances[0];
        socket.open();
        socket.message('login:');
        socket.message('Press return to enter the server');
        socket.message(`Starting FICS session as ${name}\nfics%`);
    }, username);
}

test('first entry starts one guest attempt and route return preserves the same socket', async ({ page }) => {
    await openSession(page);
    const initial = await page.evaluate(() => ({
        sockets: window.__SessionSocket.instances.length,
        mode: window.CaissaFICSClient.loginMode,
        attempted: window.CaissaFICSClient.autoGuestAttempted,
        identity: document.querySelector('.fics-rd7-session-identity').textContent,
        connectingMessages: window.CaissaFICSClient.messageBuffer.filter(
            line => line === '[CAISSA] Connecting to FICS as guest...').length
    }));
    expect(initial).toEqual({ sockets: 1, mode: 'guest', attempted: true,
        identity: 'Connecting…', connectingMessages: 1 });
    await page.evaluate(() => {
        window.CaissaFICSClient.onExit();
        window.CaissaFICSClient.onEnter();
        window.CaissaFICSClient.connect('guest');
    });
    expect(await page.evaluate(() => window.__SessionSocket.instances.length)).toBe(1);
});

test('canonical guest authentication drives the single top identity and deduplicated welcome', async ({ page }) => {
    await openSession(page);
    await authenticateGuest(page, 'GuestABCD');
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('GuestABCD');
    await expect(page.locator('.fics-rd7-console-status')).toHaveCount(0);
    await page.locator('.fics-rd7-session-button').click();
    await expect(page.getByRole('menuitem', { name: 'Connect as User' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Disconnect' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Connect as Guest' })).toBeHidden();
    const messages = await page.evaluate(() => window.CaissaFICSClient.messageBuffer);
    expect(messages.filter(line => line === '[CAISSA] Connected as GuestABCD.')).toHaveLength(1);
    expect(messages.filter(line => line.includes('Open the session menu above'))).toHaveLength(1);
});

test('session menu supports keyboard navigation Escape and canonical disconnect', async ({ page }) => {
    await openSession(page);
    await authenticateGuest(page);
    const session = page.locator('.fics-rd7-session-button');
    await session.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Connect as User' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Disconnect' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(session).toBeFocused();
    await session.click();
    await page.getByRole('menuitem', { name: 'Disconnect' }).click();
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('Disconnected');
    expect(await page.evaluate(() => window.CaissaFICSClient.authenticated)).toBe(false);
});

test('Connect as User reuses registered login and never retains or logs the password', async ({ page }) => {
    await openSession(page);
    await authenticateGuest(page);
    await page.locator('.fics-rd7-session-button').click();
    await page.getByRole('menuitem', { name: 'Connect as User' }).click();
    const dialog = page.getByRole('dialog', { name: 'Connect as User' });
    await expect(dialog).toBeVisible();
    await page.locator('#ficsAccountUsername').fill('RegisteredUser');
    await page.locator('#ficsAccountPassword').fill('fixture-secret');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    expect(await page.locator('#ficsAccountPassword').inputValue()).toBe('');
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('Connecting…');
    expect(await page.evaluate(() => ({
        sockets: window.__SessionSocket.instances.length,
        mode: window.CaissaFICSClient.loginMode,
        pending: window.CaissaFICSClient.pendingAccountPassword,
        leaked: window.CaissaFICSClient.messageBuffer.some(line => line.includes('fixture-secret'))
    }))).toEqual({ sockets: 2, mode: 'account', pending: 'fixture-secret', leaked: false });
    await page.evaluate(() => {
        const socket = window.__SessionSocket.instances[1];
        socket.open();
        socket.message('login:');
        socket.message('password:');
        socket.message('Press return to enter the server');
        socket.message('Starting FICS session as RegisteredUser\nfics%');
    });
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('RegisteredUser');
    expect(await page.evaluate(() => ({
        pending: window.CaissaFICSClient.pendingAccountPassword,
        sent: window.__SessionSocket.instances[1].sent,
        leaked: window.CaissaFICSClient.messageBuffer.some(line => line.includes('fixture-secret'))
    }))).toEqual({ pending: null,
        sent: ['RegisteredUser', 'fixture-secret', '', 'sought', 'games', 'set style 12', 'set interface CAISSA Chess'],
        leaked: false });
});

test('failed state offers manual guest retry without putting auth controls in BODY or FOOT', async ({ page }) => {
    await openSession(page);
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        client.ws.readyState = WebSocket.CLOSED;
        client.ws = null;
        client.connected = false;
        client.authenticated = false;
        client.setConnectionState('error');
    });
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('Connection error');
    await page.locator('.fics-rd7-session-button').click();
    await expect(page.getByRole('menuitem', { name: 'Connect as Guest' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Connect as Guest' }).click();
    expect(await page.evaluate(() => window.__SessionSocket.instances.length)).toBe(2);
    expect(await page.locator('.fics-rd2-workspace-foot > .fics-console-section').count()).toBe(1);
    expect(await page.locator('.fics-rd2-workspace-foot > .fics-connection').count()).toBe(0);
    await expect(page.locator('#ficsRd2Body')).not.toContainText('Connect as User');
});

test('compact FOOT releases height to BODY and preserves HEAD BODY FOOT contract', async ({ page }) => {
    await openSession(page);
    const geometry = await page.evaluate(() => {
        const height = selector => Math.round(document.querySelector(selector).getBoundingClientRect().height);
        return {
            regions: [...document.querySelector('.fics-rd2-workspace').children].map(node => node.dataset.ficsWorkspaceRegion),
            body: height('.fics-rd2-workspace-body'),
            foot: height('.fics-rd2-workspace-foot')
        };
    });
    expect(geometry.regions).toEqual(['head', 'body', 'foot']);
    expect(geometry.body).toBeGreaterThanOrEqual(735);
    expect(geometry.foot).toBeLessThanOrEqual(46);
});

for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    test(`session menu and user dialog remain responsive at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await openSession(page, viewport);
        await authenticateGuest(page);
        await page.locator('.fics-rd7-session-button').click();
        await page.getByRole('menuitem', { name: 'Connect as User' }).click();
        await expect(page.getByRole('dialog', { name: 'Connect as User' })).toBeVisible();
        const result = await page.evaluate(() => {
            const section = document.getElementById('ficsSection');
            const dialog = document.getElementById('ficsRd7UserDialog').getBoundingClientRect();
            return { overflow: section.scrollWidth - section.clientWidth, dialogWidth: dialog.width, viewport: innerWidth };
        });
        expect(result.overflow).toBeLessThanOrEqual(1);
        expect(result.dialogWidth).toBeLessThanOrEqual(result.viewport - 20);
    });
}

test('session menu and registered dialog have no serious accessibility violations', async ({ page }) => {
    await openSession(page, { width: 390, height: 844 });
    await authenticateGuest(page);
    await page.locator('.fics-rd7-session-button').click();
    let results = await new AxeBuilder({ page }).include('.fics-rd7-session-chrome').analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
    await page.getByRole('menuitem', { name: 'Connect as User' }).click();
    results = await new AxeBuilder({ page }).include('#ficsRd7UserDialog').analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
