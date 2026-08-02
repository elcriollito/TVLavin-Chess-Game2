import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('Players presentation routes and aliases return only the deterministic unavailable document', async ({ page }) => {
    const requests = []; page.on('request', request => requests.push(request.url()));
    for (const route of ['/play/beta/players', '/play/beta/PLAYERS', '/play/beta/%70layers', '/play//beta//players?mode=players#players']) {
        await page.goto(route); await expect(page.getByRole('heading', { name: 'Play beta is unavailable' })).toBeVisible();
        await expect(page.locator('script,[data-players-panel],[data-shell-mode="players"],#playersPanel')).toHaveCount(0);
    }
    expect(requests.filter(url => /js\/play\/players\/|players-(?:panel|stack)|fics-client|fics-style/i.test(url))).toEqual([]);
});

test('admitted navigation has exactly Games, Bots and Coach with no Players surface or state bypass', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const proof = await page.evaluate(async () => {
        localStorage.setItem('caissa.play.mode', 'players'); sessionStorage.setItem('caissa.play.mode', 'players');
        history.pushState({ mode: 'players' }, '', '/play/games?simplified=1#players'); dispatchEvent(new PopStateEvent('popstate'));
        let lazy = 'loaded'; try { await window.CaissaPlayLazyLoader.load('players-stack', { qa: true, retry: true }); } catch (_) { lazy = 'rejected'; }
        return { lazy, mode: window.CaissaPlayRouteController.getCurrent().mode,
            groups: window.CaissaPlayLoadRegistry.definitions().map(item => item.resourceId),
            policy: window.CaissaPlayV2PlayersPresentationPolicy.evaluateFuturePresentation({
                nativeInfrastructureCertification: 'certified', productApproval: 'approved' }) };
    });
    expect(proof).toMatchObject({ lazy: 'rejected', mode: 'games', policy: { allowed: false } });
    expect(proof.groups).not.toContain('players-stack');
    await page.evaluate(() => { localStorage.removeItem('caissa.play.mode'); sessionStorage.removeItem('caissa.play.mode'); });
    await page.goto('/play/games?simplified=1'); await page.reload();
    const tabs = page.locator('.caissa-vc-tabs__list > [role="tab"]');
    await expect(tabs).toHaveText(['Games', 'Bots', 'Coach']);
    await expect(page.getByRole('tab', { name: /players/i })).toHaveCount(0);
    await expect(page.locator('[aria-controls*="players" i],[data-players-panel],[data-shell-mode="players"]')).toHaveCount(0);
    for (const selector of ['#yahooClassicSection', '#ficsSection', '#spectatorSection']) await expect(page.locator(selector)).toBeHidden();
    await tabs.nth(0).press('ArrowRight'); await expect(page).toHaveURL(/\/play\/bots\?simplified=1/);
    await expect(page.getByRole('tab', { name: 'Bots' })).toHaveAttribute('tabindex', '0');
    await page.getByRole('tab', { name: 'Bots' }).press('ArrowRight'); await expect(page).toHaveURL(/\/play\/coach\?simplified=1/);
    await expect(page.getByRole('tab', { name: 'Coach' })).toHaveAttribute('tabindex', '0');
    await page.getByRole('tab', { name: 'Coach' }).press('ArrowRight'); await expect(page).toHaveURL(/\/play\/games\?simplified=1/);
});

test('omitted presentation leaves no layout slot across responsive and accessibility states', async ({ page, browserName }) => {
    for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 800 }, { width: 390, height: 844 },
        { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport); await page.goto('/play/games?simplified=1');
        const layout = await page.evaluate(() => { const tabs = [...document.querySelectorAll('.caissa-vc-tabs__list > [role="tab"]')];
            return { count: tabs.length, ids: tabs.map(tab => tab.dataset.shellMode), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                widths: tabs.map(tab => tab.getBoundingClientRect().width) }; });
        expect(layout).toMatchObject({ count: 3, ids: ['games', 'bots', 'coach'], overflow: 0 });
        expect(layout.widths.every(width => width >= 44)).toBe(true);
    }
    await page.emulateMedia({ reducedMotion: 'reduce', ...(browserName === 'chromium' ? { forcedColors: 'active' } : {}) });
    const axe = await new AxeBuilder({ page }).include('.caissa-vc-tabs__list').disableRules(['color-contrast']).analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});
