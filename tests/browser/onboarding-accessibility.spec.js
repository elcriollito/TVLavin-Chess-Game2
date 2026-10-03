import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const STORAGE_KEY = 'caissa_onboarding_completed';

async function waitForOnboarding(page) {
    const dialog = page.getByRole('dialog', { name: 'Welcome to CAISSA Chess' });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    return dialog;
}

async function expectOnboardingClosed(page) {
    await expect(page.locator('#caissaOnboardingModal')).toHaveCount(0, { timeout: 2_000 });
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
}

function seriousOrCritical(results) {
    return results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
}

async function preventLiveWebSockets(page) {
    await page.routeWebSocket(/.*/, socket => {
        socket.onMessage(() => {});
    });
}

test('first-time onboarding is a named modal with initial focus and contained tab order', async ({ page }) => {
    await page.goto('/analyze');

    const dialog = await waitForOnboarding(page);
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'onboardingTitle');
    await expect(dialog).toHaveAttribute('aria-describedby', 'onboardingDescription');
    await expect(page.getByRole('button', { name: 'Explore CAISSA' })).toBeFocused();
    await expect(page.locator('#app')).toHaveAttribute('inert', '');

    await page.locator('[data-nav-key="fics"]').evaluate(element => element.focus());
    await expect(page.getByRole('button', { name: 'Explore CAISSA' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Skip welcome' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Explore CAISSA' })).toBeFocused();

    for (let index = 0; index < 8; index++) {
        await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    }

    const axe = await new AxeBuilder({ page }).include('#caissaOnboardingModal').analyze();
    expect(seriousOrCritical(axe)).toEqual([]);

    await page.keyboard.press('Escape');
    await expectOnboardingClosed(page);
    await expect(page.locator('#mainContent')).toBeFocused();
});

test('delayed opening captures current focus and Escape uses Skip completion semantics', async ({ page }) => {
    await page.goto('/analyze', { waitUntil: 'domcontentloaded' });
    const priorControl = page.locator('#navCollapseBtn');
    await priorControl.focus();

    await waitForOnboarding(page);
    await expect(page.getByRole('button', { name: 'Explore CAISSA' })).toBeFocused();
    await page.keyboard.press('Escape');

    await expectOnboardingClosed(page);
    await expect(priorControl).toBeFocused();
    expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('true');

    const axeAfterClose = await new AxeBuilder({ page }).exclude('iframe').analyze();
    const onboardingOwned = seriousOrCritical(axeAfterClose).filter(violation => violation.nodes.some(node =>
        node.target.flat().some(target => String(target).includes('caissaOnboardingModal'))
    ));
    expect(onboardingOwned).toEqual([]);

    await page.reload();
    await page.waitForTimeout(1_800);
    await expect(page.locator('#caissaOnboardingModal')).toHaveCount(0);
});

test('Explore CAISSA, Previous, Next and Start Exploring support a complete keyboard flow', async ({ page }) => {
    await page.goto('/analyze', { waitUntil: 'domcontentloaded' });
    const priorControl = page.locator('#navCollapseBtn');
    await priorControl.focus();
    await waitForOnboarding(page);

    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '6M+ Chess Puzzles' })).toBeVisible();
    await expect(page.locator('#onboardingNext')).toBeFocused();

    const back = page.locator('#onboardingPrev');
    await back.focus();
    await back.press('Enter');
    await expect(page.getByRole('heading', { name: 'Welcome to CAISSA Chess' })).toBeVisible();
    await expect(back).toBeHidden();

    const primary = page.locator('#onboardingNext');
    await primary.focus();
    for (const heading of ['6M+ Chess Puzzles', 'CAISSA Mentor', 'Play Your Way', 'Engine Battles', 'Analyze Everything']) {
        await primary.press('Enter');
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
        await expect(primary).toBeFocused();
    }
    await expect(primary).toHaveText(/Start Exploring/);
    await primary.press('Enter');

    await expectOnboardingClosed(page);
    await expect(priorControl).toBeFocused();
    expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('true');
});

test('Skip supports keyboard and pointer activation without a stuck backdrop or timer reopen', async ({ page }) => {
    await page.goto('/analyze', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.dispatchEvent(new Event('caissa-show-onboarding')));
    const dialog = await waitForOnboarding(page);
    await expect(dialog.locator('..')).toHaveCSS('pointer-events', 'all');

    const skip = page.getByRole('button', { name: 'Skip welcome' });
    await skip.focus();
    await skip.press('Space');
    await expectOnboardingClosed(page);
    await page.waitForTimeout(1_700);
    await expect(page.locator('#caissaOnboardingModal')).toHaveCount(0);

    await page.evaluate(key => {
        localStorage.removeItem(key);
        window.dispatchEvent(new Event('caissa-show-onboarding'));
    }, STORAGE_KEY);
    await waitForOnboarding(page);
    await page.getByRole('button', { name: 'Skip welcome' }).click();
    await expectOnboardingClosed(page);
});

test('completed onboarding is harmlessly absent and shared routes retain their ownership', async ({ browser }) => {
    const completedContext = await browser.newContext();
    await completedContext.addInitScript(key => localStorage.setItem(key, 'true'), STORAGE_KEY);
    const completedPage = await completedContext.newPage();

    for (const route of ['/analyze', '/fics']) {
        await preventLiveWebSockets(completedPage);
        await completedPage.goto(route);
        await completedPage.waitForTimeout(1_800);
        await expect(completedPage.locator('#caissaOnboardingModal')).toHaveCount(0);
    }
    await completedContext.close();

    const playContext = await browser.newContext();
    const playPage = await playContext.newPage();
    for (const [route, expected] of [['/play', /\/play(?:[/?#]|$)/], ['/', /\/$/]]) {
        await playPage.goto(route);
        await playPage.waitForTimeout(1_800);
        await expect(playPage).toHaveURL(expected);
        await expect(playPage.locator('#caissaOnboardingModal')).toHaveCount(0);
    }
    await playContext.close();
});

test('/fics becomes keyboard-interactive after legitimate first-run dismissal with networking intercepted', async ({ page }) => {
    await preventLiveWebSockets(page);
    const sockets = [];
    page.on('websocket', socket => sockets.push(socket.url()));

    await page.goto('/fics', { waitUntil: 'domcontentloaded' });
    const connect = page.locator('#ficsConnectBtn');
    await connect.focus();
    await waitForOnboarding(page);

    await page.getByRole('button', { name: 'Skip welcome' }).focus();
    await page.keyboard.press('Enter');
    await expectOnboardingClosed(page);
    expect(await page.evaluate(() => ({
        isBody: document.activeElement === document.body,
        isInert: Boolean(document.activeElement?.closest('[inert]')),
        isOnboarding: Boolean(document.activeElement?.closest('#caissaOnboardingModal'))
    }))).toEqual({ isBody: false, isInert: false, isOnboarding: false });
    const playersTab = page.getByRole('tab', { name: 'Players' });
    await playersTab.focus();
    await expect(playersTab).toBeFocused();
    await playersTab.click();
    await expect(playersTab).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => window.CaissaFICSClient.autoGuestAttempted)).toBe(true);
    expect(sockets).toEqual([]);
});

test('/fics auto Guest remains singular and truthful while delayed onboarding owns focus', async ({ page }) => {
    await page.addInitScript(() => {
        class OnboardingSessionSocket {
            static CONNECTING = 0;
            static OPEN = 1;
            static CLOSING = 2;
            static CLOSED = 3;
            static instances = [];

            constructor(url) {
                this.url = url;
                this.readyState = OnboardingSessionSocket.CONNECTING;
                this.sent = [];
                OnboardingSessionSocket.instances.push(this);
            }

            send(value) { this.sent.push(value); }
            open() {
                this.readyState = OnboardingSessionSocket.OPEN;
                this.onopen?.();
            }
            message(value) { this.onmessage?.({ data: value }); }
            close(code = 1000, reason = '') {
                this.readyState = OnboardingSessionSocket.CLOSED;
                this.onclose?.({ code, reason });
            }
        }

        window.WebSocket = OnboardingSessionSocket;
        window.__OnboardingSessionSocket = OnboardingSessionSocket;
    });

    await page.goto('/fics', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
    await expect.poll(() => page.evaluate(() => window.__OnboardingSessionSocket.instances.length)).toBe(1);

    await page.evaluate(() => {
        const socket = window.__OnboardingSessionSocket.instances[0];
        socket.open();
        socket.message('login:');
        socket.message('Press return to enter the server');
        socket.message('Starting FICS session as GuestONBOARD\nfics%');
    });
    await expect.poll(() => page.evaluate(() => window.CaissaFICSClient.authenticated)).toBe(true);

    const dialog = await waitForOnboarding(page);
    await expect(page.getByRole('button', { name: 'Explore CAISSA' })).toBeFocused();
    await expect(page.locator('#app')).toHaveAttribute('inert', '');
    await page.getByRole('tab', { name: 'Players' }).evaluate(element => element.focus());
    await expect(page.getByRole('button', { name: 'Explore CAISSA' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Skip welcome' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Explore CAISSA' })).toBeFocused();
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expectOnboardingClosed(page);
    await expect(page.locator('.fics-rd7-session-identity')).toHaveText('GuestONBOARD');
    await page.getByRole('tab', { name: 'Players' }).click();
    await expect(page.getByRole('tab', { name: 'Players' })).toHaveAttribute('aria-selected', 'true');

    expect(await page.evaluate(() => ({
        sockets: window.__OnboardingSessionSocket.instances.length,
        mode: window.CaissaFICSClient.loginMode,
        attempted: window.CaissaFICSClient.autoGuestAttempted,
        authenticated: window.CaissaFICSClient.authenticated,
        connectedMessages: window.CaissaFICSClient.messageBuffer.filter(
            line => line === '[CAISSA] Connected as GuestONBOARD.'
        ).length
    }))).toEqual({
        sockets: 1,
        mode: 'guest',
        attempted: true,
        authenticated: true,
        connectedMessages: 1
    });
});

test('mobile touch presentation keeps the blocking backdrop and supported controls usable', async ({ browser }) => {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/analyze');

    const dialog = await waitForOnboarding(page);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(390);
    expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    const startBox = await page.getByRole('button', { name: 'Explore CAISSA' }).boundingBox();
    await page.touchscreen.tap(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
    await expect(page.getByRole('heading', { name: '6M+ Chess Puzzles' })).toBeVisible();

    for (const heading of ['CAISSA Mentor', 'Play Your Way', 'Engine Battles', 'Analyze Everything']) {
        const nextBox = await page.locator('#onboardingNext').boundingBox();
        await page.touchscreen.tap(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2);
        await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }

    const completeBox = await page.getByRole('button', { name: /Start Exploring/ }).boundingBox();
    await page.touchscreen.tap(completeBox.x + completeBox.width / 2, completeBox.y + completeBox.height / 2);
    await expectOnboardingClosed(page);
    expect(errors).toEqual([]);
    await context.close();
});

test('product discovery cards use the approved order, copy, and canonical CTA routes', async ({ page }) => {
    await page.goto('/analyze?welcome-preview=1', { waitUntil: 'domcontentloaded' });
    await waitForOnboarding(page);

    await expect(page.locator('#onboardingStepText')).toHaveText('1 of 6');
    await expect(page.locator('.onboarding-product-line')).toContainText('6M+ puzzles');
    await expect(page.locator('.onboarding-product-line')).toContainText('Mentor');
    await expect(page.locator('.onboarding-product-line')).toContainText('Live chess');
    await expect(page.locator('.onboarding-product-line')).toContainText('Engine battles');
    await expect(page.locator('.onboarding-product-line')).toContainText('Deep analysis');

    const cards = [
        { title: '6M+ Chess Puzzles', cta: 'Explore Puzzles', route: '/puzzles', claim: 'more than six million' },
        { title: 'CAISSA Mentor', cta: 'Meet Mentor', route: '/mentor', claim: 'interactive chess mentor' },
        { title: 'Play Your Way', cta: 'Play Chess', route: '/play', claim: 'FICS' },
        { title: 'Engine Battles', cta: 'Open Engine Arena', route: '/arena', claim: 'tournaments' },
        { title: 'Analyze Everything', cta: 'Open Analyzer', route: '/analyze', claim: 'variation trees' }
    ];

    for (const [index, card] of cards.entries()) {
        await page.locator('#onboardingNext').click();
        await expect(page.getByRole('heading', { name: card.title })).toBeVisible();
        await expect(page.locator('#onboardingDescription')).toContainText(card.claim);
        await expect(page.getByRole('link', { name: new RegExp(card.cta) })).toHaveAttribute('href', card.route);
        await expect(page.locator('#onboardingStepText')).toHaveText(`${index + 2} of 6`);
        expect((await page.request.get(card.route)).ok()).toBe(true);
    }
});

test('a product CTA completes first-time onboarding before canonical navigation', async ({ page }) => {
    await page.goto('/analyze', { waitUntil: 'domcontentloaded' });
    await waitForOnboarding(page);
    await page.locator('#onboardingNext').click();
    await page.getByRole('link', { name: /Explore Puzzles/ }).click();
    await expect(page).toHaveURL(/\/puzzles(?:[/?#]|$)/);
    expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('true');
});

test('local welcome preview force-opens without changing existing completion data', async ({ page }) => {
    await page.addInitScript(key => localStorage.setItem(key, 'existing-completion'), STORAGE_KEY);
    await page.goto('/analyze?welcome-preview=1', { waitUntil: 'domcontentloaded' });
    await waitForOnboarding(page);
    await page.getByRole('button', { name: 'Skip welcome' }).click();
    await expectOnboardingClosed(page);
    expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('existing-completion');
});

for (const viewport of [
    { width: 430, height: 932 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 }
]) {
    test(`welcome remains contained and error-free at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
        });

        await page.goto('/analyze?welcome-preview=1', { waitUntil: 'domcontentloaded' });
        await waitForOnboarding(page);
        const dialog = page.locator('#caissaOnboardingModal [role="dialog"]');

        for (let step = 0; step < 6; step += 1) {
            const box = await dialog.boundingBox();
            const primary = await page.locator('#onboardingNext').boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
            expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
            expect(primary.y + primary.height).toBeLessThanOrEqual(viewport.height);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
            if (step < 5) await page.locator('#onboardingNext').click();
        }

        expect(errors).toEqual([]);
        await context.close();
    });
}
