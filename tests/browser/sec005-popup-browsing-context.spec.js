import { test, expect } from '@playwright/test';
import http from 'node:http';

const channelId = 'a'.repeat(43);
const proofReceipt = 'r1.iv.cipher.tag';
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

test.beforeAll(async () => {
    production = await listen((req, res) => {
        if (req.url?.startsWith('/return')) {
            return html(res, 'same-origin-allow-popups', `<p id="state">returning</p><script>
                const params = new URLSearchParams(location.hash.slice(1));
                history.replaceState(null, '', '/return');
                const id = params.get('channel');
                const receipt = params.get('proofReceipt');
                const bc = new BroadcastChannel('caissa:sec005-owner-proof:v2:' + id);
                const ready = () => bc.postMessage({ type: 'ready', channelId: id });
                bc.onmessage = event => {
                    if (event.data?.type === 'request' && event.data?.channelId === id) {
                        bc.postMessage({ type: 'proof', channelId: id, proofReceipt: receipt });
                    }
                    if (event.data?.type === 'ack' && event.data?.channelId === id) {
                        document.querySelector('#state').textContent = 'acknowledged';
                        bc.close();
                        close();
                    }
                };
                setInterval(ready, 100); ready();
            </script>`);
        }
        return html(res, 'same-origin-allow-popups', `<button id="open">open</button><output id="result">pending</output><script>
            const id = '${channelId}';
            const bc = new BroadcastChannel('caissa:sec005-owner-proof:v2:' + id);
            bc.onmessage = event => {
                if (event.data?.type === 'ready' && event.data?.channelId === id) {
                    bc.postMessage({ type: 'request', channelId: id });
                }
                if (event.data?.type === 'proof' && event.data?.channelId === id
                    && event.data?.proofReceipt === '${proofReceipt}') {
                    document.querySelector('#result').textContent = 'proof-received';
                    bc.postMessage({ type: 'ack', channelId: id });
                }
            };
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
            document.querySelector('#deliver').onclick = () => location.replace(
                '${productionOrigin}/return#channel=${channelId}&proofReceipt=${proofReceipt}'
            );
        </script>`);
    });
    legacyOrigin = origin(legacy);

    sso = await listen((req, res) => {
        const destination = req.url?.includes('unsafe') ? '/unsafe' : '/final';
        html(res, 'restrict-properties', `<p>SSO intermediate</p><script>
            location.replace('${legacyOrigin}${destination}');
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
