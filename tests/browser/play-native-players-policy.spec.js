import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('Players routes, encodings, query and fragment aliases fail closed without dormant resources', async ({ page }) => {
    const requests = []; page.on('request', request => requests.push(request.url()));
    for (const route of ['/play/beta/players', '/play/beta/PLAYERS', '/play/beta/%70layers', '/play//beta//players?mode=players#players']) {
        await page.goto(route); await expect(page.getByRole('heading', { name: 'Play beta is unavailable' })).toBeVisible();
        await expect(page.locator('[data-players-panel],#playersPanel,[data-play-mode="players"]')).toHaveCount(0);
    }
    expect(requests.filter(url => /js\/play\/players\/|players-panel|players-stack|fics-client|fics-style/i.test(url))).toEqual([]);
});

test('route controller, storage, history, configuration and lazy recovery cannot activate Players', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const proof = await page.evaluate(async () => {
        localStorage.setItem('caissa.play.mode', 'players'); sessionStorage.setItem('caissa.play.mode', 'players');
        history.pushState({ mode: 'players' }, '', '/play/games?simplified=1#players'); dispatchEvent(new PopStateEvent('popstate'));
        const parsed = ['/play/beta/players', '/PLAY/BETA/PLAYERS', '/play//beta//players', '/play/beta/%70layers',
            '/play/beta/games?mode=players', '/play/beta/games#players'].map(value => {
                const route = window.CaissaPlayRouteController.parse(value); return { mode: route.mode, requested: route.requestedMode, status: route.status };
            });
        let lazy; try { await window.CaissaPlayLazyLoader.load('players-stack', { qa: true, retry: true }); lazy = 'loaded'; }
        catch (_) { lazy = 'rejected'; }
        return { parsed, lazy, policy: window.CaissaPlayV2NativePlayersPolicy.evaluateActivation({}),
            registry: window.CaissaPlayLoadRegistry.definitions().map(item => item.resourceId),
            shell: window.CaissaSimplifiedPlayShellInstance.getSnapshot() };
    });
    expect(proof.parsed.every(item => item.mode === 'games'
        && (item.requested !== 'players' || item.status !== 'resolved'))).toBe(true);
    expect(proof.lazy).toBe('rejected'); expect(proof.policy).toMatchObject({ allowed: false, reasonCode: 'NATIVE_CAPABILITIES_MISSING' });
    expect(proof.registry).not.toContain('players-stack'); expect(proof.shell).toMatchObject({ mode: 'games', playersPanel: null });
});

test('accessible mode order omits Players and leaves no focusable or announced surface', async ({ page, browserName }) => {
    await page.goto('/play/games?simplified=1'); const tabs = page.locator('.caissa-vc-tabs__list > [role="tab"]');
    await expect(tabs).toHaveText(['Games', 'Bots', 'Coach']); await expect(page.getByRole('tab', { name: /players/i })).toHaveCount(0);
    await expect(page.locator('[aria-controls*="players" i],[data-players-panel] button,[data-players-panel] a,[data-players-panel] input')).toHaveCount(0);
    for (let index = 0; index < 3; index += 1) { await tabs.nth(index).focus(); await page.keyboard.press('ArrowRight'); }
    await expect(tabs.nth(0)).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce', ...(browserName === 'chromium' ? { forcedColors: 'active' } : {}) });
    const axe = await new AxeBuilder({ page }).include('.caissa-simplified-shell').disableRules(['color-contrast']).analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});
