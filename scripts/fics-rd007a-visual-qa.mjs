import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.FICS_QA_BASE_URL || 'http://localhost:8000/fics';
const outputDir = path.resolve('test-results/fics-rd007a-visual');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const browserErrors = [];

async function open(viewport) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        class VisualSocket {
            static CONNECTING = 0;
            static OPEN = 1;
            static CLOSING = 2;
            static CLOSED = 3;
            static instances = [];
            constructor(url) {
                this.url = url;
                this.readyState = VisualSocket.CONNECTING;
                this.sent = [];
                VisualSocket.instances.push(this);
            }
            send(value) { this.sent.push(value); }
            open() { this.readyState = VisualSocket.OPEN; this.onopen?.(); }
            message(value) { this.onmessage?.({ data: value }); }
            close(code = 1000, reason = '') {
                this.readyState = VisualSocket.CLOSED;
                this.onclose?.({ code, reason });
            }
        }
        window.WebSocket = VisualSocket;
        window.__VisualSocket = VisualSocket;
    });
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') browserErrors.push(message.text());
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
    return { context, page };
}

async function authenticateGuest(page, username = 'GuestABCD') {
    await page.evaluate(name => {
        const socket = window.__VisualSocket.instances.at(-1);
        socket.open();
        socket.message('login:');
        socket.message('Press return to enter the server');
        socket.message(`Starting FICS session as ${name}\nfics%`);
    }, username);
}

async function setRegisteredFixture(page, username = 'Alexander') {
    await page.evaluate(name => {
        const client = window.CaissaFICSClient;
        Object.assign(client, {
            connected: true,
            authenticated: true,
            connectionState: 'connected',
            ficsUsername: name,
            loginMode: 'account',
            guestLogin: false
        });
        client.updateConnectionStatus(true);
        client.updateIdentityStatus();
        window.CaissaFICSShell.refresh();
    }, username);
}

async function setErrorFixture(page) {
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        if (client.ws) client.ws.readyState = WebSocket.CLOSED;
        Object.assign(client, {
            ws: null,
            connected: false,
            authenticated: false,
            ficsUsername: '',
            connectionState: 'error'
        });
        client.updateConnectionStatus(false);
        client.updateIdentityStatus();
        window.CaissaFICSShell.refresh();
    });
}

async function capture(page, name) {
    await page.locator('#ficsSection').scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false });
}

async function geometry(page) {
    return page.evaluate(() => {
        const height = selector => Math.round(document.querySelector(selector).getBoundingClientRect().height);
        const section = document.getElementById('ficsSection');
        return {
            workspace: height('.fics-rd2-workspace'),
            head: height('.fics-rd2-workspace-head'),
            body: height('.fics-rd2-workspace-body'),
            foot: height('.fics-rd2-workspace-foot'),
            horizontalOverflow: section.scrollWidth - section.clientWidth
        };
    });
}

const desktop = await open({ width: 1600, height: 1000 });
await capture(desktop.page, '01-desktop-connecting');
await authenticateGuest(desktop.page);
const desktopGuestGeometry = await geometry(desktop.page);
await capture(desktop.page, '02-desktop-guest-connected');
await desktop.page.locator('.fics-rd7-session-button').click();
await capture(desktop.page, '03-desktop-guest-menu');
await desktop.page.getByRole('menuitem', { name: 'Connect as User' }).click();
await capture(desktop.page, '04-desktop-connect-user-dialog');
await desktop.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
await setRegisteredFixture(desktop.page);
await capture(desktop.page, '05-desktop-registered-connected');
await setErrorFixture(desktop.page);
await capture(desktop.page, '06-desktop-error');
await capture(desktop.page, '07-desktop-console-collapsed');
await desktop.page.locator('#ficsConsoleToggle').click();
await capture(desktop.page, '08-desktop-console-expanded');
await desktop.context.close();

const tablet = await open({ width: 768, height: 1024 });
await authenticateGuest(tablet.page, 'GuestTAB');
const tabletGeometry = await geometry(tablet.page);
await capture(tablet.page, '09-tablet-guest-connected');
await tablet.page.locator('.fics-rd7-session-button').click();
await capture(tablet.page, '10-tablet-guest-menu');
await tablet.context.close();

const mobile = await open({ width: 390, height: 844 });
await authenticateGuest(mobile.page, 'GuestMOB');
const mobileGeometry = await geometry(mobile.page);
await capture(mobile.page, '11-mobile-guest-connected');
await mobile.page.locator('.fics-rd7-session-button').click();
await capture(mobile.page, '12-mobile-guest-menu');
await mobile.page.getByRole('menuitem', { name: 'Connect as User' }).click();
await capture(mobile.page, '13-mobile-connect-user-dialog');
await mobile.context.close();

await browser.close();

const report = {
    baseUrl,
    captures: 13,
    baselineAtStartingCheckpoint: { width: 1600, height: 1000, body: 697, foot: 88 },
    desktopGuestGeometry,
    tabletGeometry,
    mobileGeometry,
    browserErrors
};
fs.writeFileSync(path.join(outputDir, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (browserErrors.length || [desktopGuestGeometry, tabletGeometry, mobileGeometry]
    .some(item => item.horizontalOverflow > 1)) process.exitCode = 1;
