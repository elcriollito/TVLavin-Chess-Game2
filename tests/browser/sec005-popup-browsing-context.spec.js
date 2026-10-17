import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';

const channelId = 'a'.repeat(43);
const proofReceipt = 'r1.iv.cipher.tag';
const channelSource = fs.readFileSync(new URL('../../js/identity-recovery-channel.js', import.meta.url), 'utf8');
const returnSource = fs.readFileSync(new URL('../../js/identity-recovery-return.js', import.meta.url), 'utf8');
let production;
let sso;
let legacy;
let productionOrigin;
let ssoOrigin;
let legacyOrigin;

function listen(handler) {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function origin(server) {
    return `http://127.0.0.1:${server.address().port}`;
}

function html(res, coop, body) {
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Cross-Origin-Opener-Policy': coop
    });
    res.end(`<!doctype html><meta charset="utf-8">${body}`);
}

function javascript(res, body) {
    res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    });
    res.end(body);
}

test.beforeAll(async () => {
    production = await listen((req, res) => {
        if (req.url === '/js/identity-recovery-channel.js') {
            return javascript(res, channelSource);
        }
        if (req.url === '/js/identity-recovery-return.js') {
            return javascript(res, returnSource);
        }
        if (req.url?.startsWith('/return')) {
            return html(res, 'same-origin-allow-popups', `
                <p id="identity-recovery-return-status">returning</p>
                <script src="/js/identity-recovery-channel.js"></script>
                <script src="/js/identity-recovery-return.js"></script>
            `);
        }
        return html(res, 'same-origin-allow-popups', `<button id="open">open</button><output id="result">pending</output><script>
            const id = '${channelId}';
            let bc = null;
            window.armReceiver = () => {
                if (bc) return;
                bc = new BroadcastChannel('caissa:sec005-owner-proof:v2:' + id);
                bc.onmessage = event => {
                    if (event.data?.type === 'caissa:sec005-owner-proof-ready:v2'
                        && event.data?.channelId === id) {
                        bc.postMessage({ type: 'caissa:sec005-owner-proof-request:v2', channelId: id });
                    }
                    if (event.data?.type === 'caissa:sec005-owner-proof:v2'
                        && event.data?.channelId === id
                        && event.data?.proofReceipt === '${proofReceipt}') {
                        document.querySelector('#result').textContent = 'proof-received';
                        bc.postMessage({ type: 'caissa:sec005-owner-proof-ack:v2', channelId: id });
                    }
                };
            };
            if (!new URLSearchParams(location.search).has('manual')) window.armReceiver();
            document.querySelector('#open').onclick = () => {
                window.recoveryPopup = open('', '_blank', 'popup=yes,width=500,height=600');
                recoveryPopup.location.replace('${ssoOrigin}/intermediate');
            };
        </script>`);
    });
    productionOrigin = origin(production);

    legacy = await listen((req, res) => {
        const unsafe = req.url?.startsWith('/unsafe');
        html(res, unsafe ? 'unsafe-none' : 'same-origin-allow-popups', `<p id="physical">popup-open</p><button id="deliver">deliver</button><script>
            window.openerAvailable = Boolean(window.opener);
            document.querySelector('#deliver').onclick = () => {
                const ttl = Number(new URLSearchParams(location.search).get('ttl') || 60000);
                const expiresAt = new Date(Date.now() + ttl).toISOString();
                const fragment = new URLSearchParams({
                    channel: '${channelId}',
                    proofReceipt: '${proofReceipt}',
                    expiresAt
                });
                location.replace('${productionOrigin}/return#' + fragment);
            };
        </script>`);
    });
    legacyOrigin = origin(legacy);

    sso = await listen((req, res) => {
        const requestUrl = new URL(req.url, 'http://local.test');
        const destination = requestUrl.searchParams.has('unsafe') ? '/unsafe' : '/final';
        const ttl = requestUrl.searchParams.get('ttl');
        const suffix = ttl ? `?ttl=${encodeURIComponent(ttl)}` : '';
        html(res, 'restrict-properties', `<p>SSO intermediate</p><script>
            location.replace('${legacyOrigin}${destination}${suffix}');
        </script>`);
    });
    ssoOrigin = origin(sso);
});

test.afterAll(async () => {
    await Promise.all([production, sso, legacy].map(server => new Promise(resolve => server.close(resolve))));
});

test('COOP navigation can sever WindowProxy while the popup remains physically open', async ({ page }) => {
    await page.goto(productionOrigin + '/opener');
    const popupPromise = page.waitForEvent('popup');
    await page.click('#open');
    const popup = await popupPromise;
    await popup.waitForURL(legacyOrigin + '/final');

    await expect(popup.locator('#physical')).toHaveText('popup-open');
    expect(await popup.evaluate(() => window.openerAvailable)).toBe(false);
    await expect.poll(() => page.evaluate(() => window.recoveryPopup.closed)).toBe(true);
});

test('a final unsafe-none response is not a portable repair after blank-popup navigation', async ({ page, browserName }) => {
    await page.goto(productionOrigin + '/opener');
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate((target) => {
        window.recoveryPopup = open('', '_blank', 'popup=yes,width=500,height=600');
        window.recoveryPopup.location.replace(target + '/intermediate?unsafe=1');
    }, ssoOrigin);
    const popup = await popupPromise;
    await popup.waitForURL(legacyOrigin + '/unsafe');
    expect(await popup.evaluate(() => window.openerAvailable)).toBe(browserName !== 'webkit');
});

test('same-origin callback channel returns the proof across separated browsing context groups', async ({ page }) => {
    await page.goto(productionOrigin + '/opener');
    const popupPromise = page.waitForEvent('popup');
    await page.click('#open');
    const popup = await popupPromise;
    await popup.waitForURL(legacyOrigin + '/final');
    await popup.click('#deliver');

    await expect(page.locator('#result')).toHaveText('proof-received');
    await expect.poll(() => popup.isClosed()).toBe(true);
});

test('callback survives a Production receiver suspended beyond 15 seconds but before handoff expiry', async ({ page }) => {
    test.setTimeout(35_000);
    await page.goto(productionOrigin + '/opener?manual=1');
    const popupPromise = page.waitForEvent('popup');
    await page.click('#open');
    const popup = await popupPromise;
    await popup.waitForURL(legacyOrigin + '/final');
    await popup.click('#deliver');
    await popup.waitForURL(productionOrigin + '/return');

    await page.waitForTimeout(16_000);
    await expect(page.locator('#result')).toHaveText('pending');
    await page.evaluate(() => window.armReceiver());
    await expect(page.locator('#result')).toHaveText('proof-received');
    await expect.poll(() => popup.isClosed()).toBe(true);
});

test('callback fails closed when the Production suspension exceeds the handoff TTL', async ({ page }) => {
    await page.goto(productionOrigin + '/opener?manual=1');
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate((target) => {
        window.recoveryPopup = open('', '_blank', 'popup=yes,width=500,height=600');
        window.recoveryPopup.location.replace(target + '/intermediate?ttl=1200');
    }, ssoOrigin);
    const popup = await popupPromise;
    await popup.waitForURL(legacyOrigin + '/final?ttl=1200');
    await popup.click('#deliver');
    await popup.waitForURL(productionOrigin + '/return');

    await page.waitForTimeout(1_600);
    await expect(popup.locator('#identity-recovery-return-status')).toContainText('could not be returned');
    await page.evaluate(() => window.armReceiver());
    await page.waitForTimeout(350);
    await expect(page.locator('#result')).toHaveText('pending');
    expect(popup.isClosed()).toBe(false);
});

test('physical close without a callback never fabricates a proof', async ({ page }) => {
    await page.goto(productionOrigin + '/opener');
    const popupPromise = page.waitForEvent('popup');
    await page.click('#open');
    const popup = await popupPromise;
    await popup.waitForURL(legacyOrigin + '/final');
    await popup.close();
    await page.waitForTimeout(350);
    await expect(page.locator('#result')).toHaveText('pending');
});
