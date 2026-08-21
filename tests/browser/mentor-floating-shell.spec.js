import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';

const longMentorAnswer = [
    'A long answer should remain readable inside the conversation region.',
    ...Array.from({ length: 18 }, (_, index) => `Paragraph ${index + 1}: Improve the position patiently, compare candidate moves, and verify forcing replies before committing. **Plan** ${index + 1}.`),
    '- Control the center\n- Improve the least active piece\n- Check tactical replies',
    'Spanish: La respuesta debe conservarse dentro del historial sin cubrir los controles.',
    `Notation: 1.e4 e5 2.Nf3 Nc6. URL: https://example.invalid/mentor/layout. ${'unbroken'.repeat(30)}`
].join('\n\n');

async function assertLongResponseLayout(page, viewport) {
    await page.setViewportSize(viewport);
    const mentorRequests = [];
    page.on('request', request => { if (/\/api\/mentor\//.test(request.url())) mentorRequests.push(request.url()); });
    await instrumentPlay(page);
    await page.goto('/play?simplified=1');
    await page.locator('[data-caissa-mentor-launcher]').click();
    await page.evaluate(answer => {
        const messages = document.querySelector('.caissa-mentor-shell__messages');
        const response = document.createElement('p');
        response.className = 'caissa-mentor-shell__message caissa-mentor-shell__message--mentor';
        response.dataset.testLongMentorResponse = '';
        response.textContent = answer;
        messages.append(response);
        messages.scrollTop = messages.scrollHeight;
    }, longMentorAnswer);
    const geometry = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const bodyNode = document.querySelector('.caissa-mentor-shell__body');
        const messageNode = document.querySelector('.caissa-mentor-shell__messages');
        const bodyScrolls = bodyNode.scrollHeight > bodyNode.clientHeight;
        if (bodyScrolls) bodyNode.scrollTop = bodyNode.scrollHeight;
        const shell = rect('[data-caissa-mentor-shell]');
        const body = rect('.caissa-mentor-shell__body');
        const messages = rect('.caissa-mentor-shell__messages');
        const response = rect('[data-test-long-mentor-response]');
        const form = rect('.caissa-mentor-shell__form');
        const local = rect('.caissa-mentor-shell__local');
        const auth = rect('.caissa-mentor-shell__auth:not([hidden])');
        return { shell, body, messages, response, form, local, auth, bodyScrolls,
            messageScrolls: messageNode.scrollHeight > messageNode.clientHeight,
            pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(geometry.messageScrolls || geometry.bodyScrolls).toBe(true);
    if (geometry.bodyScrolls) expect(geometry.response.bottom).toBeLessThanOrEqual(geometry.form.top + 1);
    else {
        expect(geometry.response.bottom).toBeLessThanOrEqual(geometry.messages.bottom + 1);
        expect(geometry.messages.bottom).toBeLessThanOrEqual(geometry.form.top + 1);
    }
    expect(geometry.form.bottom).toBeLessThanOrEqual(geometry.local.top + 1);
    expect(geometry.local.bottom).toBeLessThanOrEqual(geometry.auth.top + 1);
    expect(geometry.auth.bottom).toBeLessThanOrEqual(Math.min(geometry.body.bottom, geometry.shell.bottom) + 1);
    expect(geometry.response.left).toBeGreaterThanOrEqual(geometry.messages.left - 1);
    expect(geometry.response.right).toBeLessThanOrEqual(geometry.messages.right + 1);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(2);
    await page.setViewportSize({ width: Math.max(320, viewport.width - 80), height: Math.max(480, viewport.height - 100) });
    await page.getByRole('button', { name: 'Minimize CAISSA Mentor' }).click();
    await page.locator('[data-caissa-mentor-launcher]').click();
    await expect(page.locator('[data-test-long-mentor-response]')).toBeVisible();
    expect(mentorRequests).toEqual([]);
}

test('Play exposes Mentor with zero auto-call, keyboard-safe lifecycle, and no issue-control collision', async ({ page }) => {
    await instrumentPlay(page);
    const mentorRequests = [];
    page.on('request', request => { if (/\/api\/mentor\//.test(request.url())) mentorRequests.push(request.url()); });
    await page.goto('/play?simplified=1');
    const launcher = page.locator('[data-caissa-mentor-launcher]');
    await expect(launcher).toBeVisible(); await expect(launcher).toHaveAccessibleName('Open CAISSA Mentor');
    expect(mentorRequests).toEqual([]);
    await launcher.click();
    const shell = page.locator('[data-caissa-mentor-shell]');
    await expect(shell).toBeVisible(); await expect(page.locator('#caissaMentorInput')).toBeFocused();
    await expect(shell).toContainText('General Mentor · no board position is shared');
    await expect(shell).toContainText('Local Game Review'); expect(mentorRequests).toEqual([]);
    await page.keyboard.press('Escape'); await expect(shell).toBeHidden(); await expect(launcher).toBeFocused();
    await launcher.click(); await page.getByRole('button', { name: 'Minimize CAISSA Mentor' }).click();
    await expect(shell).toBeHidden(); expect(mentorRequests).toEqual([]);
    const boxes = await page.evaluate(() => {
        const box = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x:r.x,y:r.y,w:r.width,h:r.height } : null; };
        return { mentor: box('[data-caissa-mentor-launcher]'), report: box('.caissa-manual-qa-launcher') };
    });
    expect(boxes.mentor).not.toBeNull(); expect(boxes.report).not.toBeNull();
    expect(boxes.mentor.y + boxes.mentor.h <= boxes.report.y || boxes.report.y + boxes.report.h <= boxes.mentor.y).toBe(true);
    const axe = await new AxeBuilder({ page }).include('[data-caissa-mentor-shell]').analyze(); expect(axe.violations).toEqual([]);
});

test('mobile Mentor is a board-safe bottom sheet with no horizontal clipping or network activity', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await instrumentPlay(page);
    const mentorRequests = []; page.on('request', request => { if (/\/api\/mentor\//.test(request.url())) mentorRequests.push(request.url()); });
    await page.goto('/play?simplified=1');
    const boardBefore = await page.locator('#playSection #chessboard').boundingBox();
    await page.locator('[data-caissa-mentor-launcher]').click();
    const shell = page.locator('[data-caissa-mentor-shell]'); await expect(shell).toBeVisible();
    const layout = await page.evaluate(() => { const r = document.querySelector('[data-caissa-mentor-shell]').getBoundingClientRect();
        return { left:r.left,right:r.right,bottom:innerHeight-r.bottom,height:r.height,viewportWidth:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth }; });
    expect(layout.left).toBeGreaterThanOrEqual(0); expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.bottom).toBeLessThanOrEqual(1); expect(layout.height).toBeLessThanOrEqual(844 * .73); expect(layout.overflow).toBeLessThanOrEqual(2);
    expect(boardBefore?.width || 0).toBeGreaterThan(200); expect(mentorRequests).toEqual([]);
    await page.getByRole('button', { name: 'Close CAISSA Mentor' }).click(); await expect(shell).toBeHidden(); expect(mentorRequests).toEqual([]);
});

test('Mentor reacts to authoritative auth changes without submitting or caching a token', async ({ page }) => {
    await instrumentPlay(page);
    const mentorRequests = [];
    page.on('request', request => { if (/\/api\/mentor\//.test(request.url())) mentorRequests.push(request.url()); });
    await page.goto('/play?simplified=1');
    await page.locator('[data-caissa-mentor-launcher]').click();
    const shell = page.locator('[data-caissa-mentor-shell]');
    const signedOutCopy = shell.getByText(/Shared AI requires an account\./);
    const signedInCopy = shell.getByText('Signed in · Shared AI is available under your account rules.');
    await expect(signedOutCopy).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('caissa-auth-change', {
        detail: { isLoaded: true, isSignedIn: true }
    })));
    await expect(signedInCopy).toBeVisible();
    await expect(signedOutCopy).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('caissa-auth-change', {
        detail: { isLoaded: true, isSignedIn: false }
    })));
    await expect(signedOutCopy).toBeVisible();
    expect(mentorRequests).toEqual([]);
    expect(await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(key => /token/i.test(key)))).toEqual([]);
});

async function prepareDeliveryAckFixture(page, confirmStatuses, shared = true) {
    await instrumentPlay(page);
    const requests = [];
    let tokenCalls = 0;
    await page.route('**/api/mentor/chat', route => {
        requests.push({ path: '/api/mentor/chat', authorization: route.request().headers().authorization || null });
        return route.fulfill({ status: 200, contentType: 'application/json',
            headers: { 'Idempotency-Key': '30000000-0000-4000-8000-000000000001' },
            body: JSON.stringify({ content: 'Synthetic Mentor success.', usage: {}, isSharedApi: shared }) });
    });
    await page.route('**/api/mentor/result/*/confirm', route => {
        requests.push({ path: new URL(route.request().url()).pathname, authorization: route.request().headers().authorization || null });
        const status = confirmStatuses.shift() ?? 200;
        return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 'DELIVERY_CONFIRMED' : 'SYNTHETIC_FAILURE' }) });
    });
    await page.goto('/play?simplified=1');
    await page.evaluate(() => {
        let calls = 0;
        window.CAISSA_AUTH = { isLoaded: true, isSignedIn: true, whenReady: async function () { return this; },
            getToken: async () => { calls += 1; window.__ackTokenCalls = calls; return `fresh-token-${calls}`; } };
    });
    return { requests, tokenCalls: () => page.evaluate(() => window.__ackTokenCalls || 0) };
}

async function submitSyntheticMentor(page) {
    await page.locator('[data-caissa-mentor-launcher]').click();
    await page.locator('#caissaMentorInput').fill('Synthetic question.');
    await page.getByRole('button', { name: 'Send to Mentor' }).click();
    return page.locator('.caissa-mentor-shell__message--mentor');
}

test('Shared success renders once then confirms once with a fresh Bearer token', async ({ page }) => {
    const fixture = await prepareDeliveryAckFixture(page, [200]);
    const answer = await submitSyntheticMentor(page);
    await expect(answer).toHaveText('Synthetic Mentor success.');
    await expect(answer).toHaveAttribute('data-delivery-ack', 'confirmed');
    expect(fixture.requests.map(item => item.path)).toEqual(['/api/mentor/chat', '/api/mentor/result/30000000-0000-4000-8000-000000000001/confirm']);
    expect(fixture.requests[0].authorization).toBe('Bearer fresh-token-1');
    expect(fixture.requests[1].authorization).toBe('Bearer fresh-token-2');
    expect(await fixture.tokenCalls()).toBe(2);
});

test('transient acknowledgement failure retries boundedly without repeating answer or chat', async ({ page }) => {
    const fixture = await prepareDeliveryAckFixture(page, [503, 200]);
    const answer = await submitSyntheticMentor(page);
    await expect(answer).toHaveAttribute('data-delivery-ack', 'confirmed');
    expect(await page.locator('.caissa-mentor-shell__message--mentor').count()).toBe(1);
    expect(fixture.requests.filter(item => item.path === '/api/mentor/chat')).toHaveLength(1);
    expect(fixture.requests.filter(item => item.path.endsWith('/confirm'))).toHaveLength(2);
});

test('permanent acknowledgement failure stays bounded and leaves the answer visible', async ({ page }) => {
    const fixture = await prepareDeliveryAckFixture(page, [403]);
    const answer = await submitSyntheticMentor(page);
    await expect(answer).toBeVisible();
    await expect(answer).toHaveAttribute('data-delivery-ack', 'pending');
    expect(fixture.requests.filter(item => item.path.endsWith('/confirm'))).toHaveLength(1);
    await expect(page.locator('.caissa-mentor-shell__status')).toHaveText('Mentor replied.');
});

test('BYO-shaped success never invokes Shared delivery confirmation', async ({ page }) => {
    const fixture = await prepareDeliveryAckFixture(page, [200], false);
    const answer = await submitSyntheticMentor(page);
    await expect(answer).toHaveAttribute('data-delivery-ack', 'not-applicable');
    expect(fixture.requests.map(item => item.path)).toEqual(['/api/mentor/chat']);
});

for (const [name, viewport] of [
    ['desktop 1920x1080', { width: 1920, height: 1080 }],
    ['desktop 1440x900', { width: 1440, height: 900 }],
    ['desktop 1280x720', { width: 1280, height: 720 }],
    ['short desktop', { width: 1248, height: 617 }],
    ['narrow tablet', { width: 820, height: 900 }],
    ['iPhone portrait', { width: 390, height: 844 }],
    ['Android portrait', { width: 412, height: 915 }],
    ['mobile landscape', { width: 844, height: 390 }]
]) test(`long Mentor response remains contained at ${name} with zero AI calls`, async ({ page }) => {
    await assertLongResponseLayout(page, viewport);
});
