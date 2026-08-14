import { test, expect } from '@playwright/test';

const computer = (handle, rating) => ({
    handle, rating, titles: ['C'], status: 'Available', online: true, available: true, sessionGeneration: 1
});

test('Computer Hall preserves target, form, focus, and scroll across background directory refreshes', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/yahoo-classic');
    await page.waitForFunction(() => !!window.CaissaYahooClassic);
    await page.evaluate(({ initial }) => {
        const section = window.CaissaYahooClassic;
        document.getElementById('yahooClassicSection')?.classList.add('active');
        section.onEnter();
        section.authenticated = true;
        section.currentRoom = { name: 'Computer Hall', description: 'Computer play.' };
        section.selectedComputerTarget = '';
        window.CaissaFICSClient = { authenticated: true, sessionGeneration: 1, activeTables: [], seekActions: [] };
        window.__computerSnapshot = initial;
        window.ClassicComputerChallenge = {
            timePresets: [{ key: '3+2', label: '3 + 2', minutes: 3, increment: 2 }],
            snapshot: () => window.__computerSnapshot,
            requestAvailableComputers: () => ({ ok: true }),
            challenge: () => Promise.resolve({ ok: false, code: 'OFFLINE_TEST_ONLY' })
        };
        section.render();
    }, { initial: { state: 'IDLE', directoryState: 'READY', computers: [computer('inemuri', 1348), computer('kurushi', 1350)], pending: null, failureCode: null } });

    const select = page.locator('select[name="computer"]');
    await select.selectOption('inemuri');
    await select.scrollIntoViewIfNeeded();
    await select.focus();
    await page.evaluate(() => {
        window.__stableForm = document.querySelector('.yc-computer-challenge-form');
        window.__stableScroll = window.scrollY;
        window.__backgroundFocusCalls = 0;
        const originalFocus = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function(...args) {
            window.__backgroundFocusCalls += 1;
            return originalFocus.apply(this, args);
        };
    });

    const refresh = snapshot => page.evaluate(next => {
        window.__computerSnapshot = next;
        window.dispatchEvent(new CustomEvent('caissa:fics:computer-hall-updated'));
    }, snapshot);

    await refresh({ state: 'IDLE', directoryState: 'READY', computers: [computer('ArasanX', 3041), computer('inemuri', 1348)], pending: null, failureCode: null });
    await refresh({ state: 'VALIDATING', directoryState: 'LOADING', computers: [], pending: null, failureCode: null });
    await refresh({ state: 'IDLE', directoryState: 'READY', computers: [computer('inemuri', 1348), computer('Tosco', 1724)], pending: null, failureCode: null });

    const stable = await page.evaluate(() => ({
        selected: document.querySelector('select[name="computer"]')?.value,
        sameForm: window.__stableForm === document.querySelector('.yc-computer-challenge-form'),
        sameFocus: document.activeElement === document.querySelector('select[name="computer"]'),
        focusCalls: window.__backgroundFocusCalls,
        scrollDelta: Math.abs(window.scrollY - window.__stableScroll)
    }));
    expect(stable.selected).toBe('inemuri');
    expect(stable.sameForm).toBe(true);
    expect(stable.sameFocus).toBe(true);
    expect(stable.focusCalls).toBe(0);
    expect(stable.scrollDelta).toBeLessThanOrEqual(2);

    await refresh({ state: 'IDLE', directoryState: 'READY', computers: [computer('Tosco', 1724)], pending: null, failureCode: null });
    await refresh({ state: 'IDLE', directoryState: 'READY', computers: [computer('Tosco', 1724), computer('kurushi', 1350)], pending: null, failureCode: null });
    await expect(select).toHaveValue('');
    await expect(page.getByRole('status')).toHaveText('Computer no longer available. Choose another.');
    await expect(select.locator('option:checked')).toHaveText('Choose a computer');
    await expect(page.getByRole('button', { name: 'Send Challenge' })).toBeDisabled();
});

test('Computer Hall clears a selected target that becomes busy without choosing another', async ({ page }) => {
    await page.goto('/yahoo-classic');
    await page.waitForFunction(() => !!window.CaissaYahooClassic);
    await page.evaluate(({ roster }) => {
        const section = window.CaissaYahooClassic;
        document.getElementById('yahooClassicSection')?.classList.add('active');
        section.onEnter();
        section.authenticated = true;
        section.currentRoom = { name: 'Computer Hall', description: 'Computer play.' };
        section.selectedComputerTarget = 'inemuri';
        window.CaissaFICSClient = { authenticated: true, sessionGeneration: 1, activeTables: [], seekActions: [] };
        window.__computerSnapshot = { state: 'IDLE', directoryState: 'READY', computers: roster, pending: null, failureCode: null };
        window.ClassicComputerChallenge = {
            timePresets: [{ key: '3+2', label: '3 + 2' }], snapshot: () => window.__computerSnapshot,
            requestAvailableComputers: () => ({ ok: true }), challenge: () => Promise.resolve({ ok: false })
        };
        section.render();
        window.CaissaFICSClient.activeTables = [{ white: 'inemuri', black: 'Human' }];
        window.dispatchEvent(new CustomEvent('caissa:fics:computer-hall-updated'));
    }, { roster: [computer('inemuri', 1348), computer('kurushi', 1350)] });
    await expect(page.locator('select[name="computer"]')).toHaveValue('');
    await expect(page.locator('select[name="computer"] option:checked')).toHaveText('Choose a computer');
    await expect(page.getByRole('status')).toHaveText('Computer no longer available. Choose another.');
});
