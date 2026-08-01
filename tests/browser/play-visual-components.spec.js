import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { navigateToReadyBotsPanel } from './helpers/play-responsive-readiness.js';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
});

test('all visual factories render semantic, bounded components and clean up', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const proof = await page.evaluate(() => {
        const api = window.CaissaPlayVisualComponents;
        const host = document.createElement('div'); host.id = 'visual-fixture'; document.body.appendChild(host);
        const created = [
            api.createModeTabs({ items: [{ id: 'a', label: 'A', active: true }, { id: 'b', label: 'B' }] }),
            api.createProfileCard({ id: 'bot', name: 'Bot', description: 'Profile', rating: { value: 1200 }, country: { code: 'US' } }),
            api.createRatingBadge({ range: '1200–1400', approximate: true, provisional: true, provider: 'FICS' }),
            api.createCountryFlag({ code: 'GB', label: 'United Kingdom' }),
            api.createTimeControlSelector({ items: [{ id: 'rapid', label: '10 minutes', selected: true }] }),
            api.createCollapsibleOptions({ id: 'advanced', label: 'Advanced options', description: 'Optional controls' }),
            api.createCtaFooter({ actions: [{ id: 'go', label: 'Continue', actionId: 'primary' }, { id: 'later', label: 'Later', actionId: 'secondary', disabled: true, reason: 'Unavailable' }] }),
            api.createGameOverCard({ title: 'Game over', result: 'White won', actions: [{ label: 'Analyze', actionId: 'analyze' }] }),
            api.createLoadingSkeleton({ title: 'Loading', message: 'Loading real data' }),
            api.createEmptyState({ title: 'No games', message: 'Nothing available' }),
            api.createLockedState({ title: 'Locked', message: 'Complete the prerequisite' })
        ];
        created.forEach(node => host.appendChild(node));
        const count = host.querySelectorAll('[data-visual-component]').length;
        const before = api.inspect();
        api.update(created[9], { message: 'Still empty' });
        api.dispose(created[8]);
        return { count, before, after: api.inspect(), html: host.textContent };
    });
    expect(proof.count).toBeGreaterThanOrEqual(11);
    expect(proof.html).toContain('Still empty');
    expect(proof.after.disposed).toBe(1);
    expect(proof.before.created).toBeGreaterThanOrEqual(11);
});

test('shared mode tabs preserve routing and keyboard navigation without rebuilding board', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const before = await page.evaluate(() => {
        window.__visualBoard = window.App.board; return window.App.game.fen();
    });
    const tabs = page.locator('[data-visual-component="mode-tabs"]');
    await expect(tabs).toBeVisible();
    await page.locator('[data-shell-mode="games"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-shell-mode="bots"]')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('[data-shell-mode="games"]')).toBeFocused();
    await page.locator('[data-shell-mode="bots"]').click();
    await expect(page).toHaveURL(/\/play\/bots\?simplified=1/);
    expect(await page.evaluate(() => window.App.board === window.__visualBoard)).toBe(true);
    expect(await page.evaluate(() => window.App.game.fen())).toBe(before);
});

test('representative panels use shared presentation while retaining existing behavior', async ({ page }) => {
    await navigateToReadyBotsPanel(page);
    await expect(page.locator('[data-bot-card][data-visual-component="profile-card"]')).toHaveCount(4);
    await page.locator('[data-shell-mode="coach"]').click();
    await expect(page.locator('.caissa-coach-panel__card[data-visual-component="profile-card"]')).toHaveCount(3);
    await page.locator('[data-shell-mode="games"]').click();
    await expect(page.locator('[data-visual-component="time-control-selector"]')).toBeVisible();
    await page.locator('[data-shell-mode="players"]').click();
    await expect(page.locator('[data-visual-component="cta-footer"]')).toBeVisible();
    await expect(page.locator('[data-visual-component="empty-state"]')).toHaveCount(5);
});

test('components remain accessible and bounded across eight viewports and reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const viewport of [
        { width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 },
        { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1024, height: 768 },
        { width: 1366, height: 768 }, { width: 1440, height: 900 }
    ]) {
        await page.setViewportSize(viewport); await page.goto('/play/players?simplified=1');
        await expect(page.locator('[data-visual-component="mode-tabs"]')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const targets = await page.locator('[data-visual-component="mode-tabs"] button').evaluateAll(nodes =>
            nodes.map(node => node.getBoundingClientRect().height));
        expect(targets.every(height => height >= 44)).toBe(true);
    }
    const results = await new AxeBuilder({ page }).include('[data-caissa-simplified-shell]').analyze();
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});

test('visual foundation creates no runtime resources or business mutations', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const proof = await page.evaluate(() => {
        const before = {
            board: window.App.board, worker: window.App.engine?.worker || null,
            lifecycle: window.App.gameLifecycle?.getSnapshot?.(),
            fairPlay: window.CaissaFairPlayPolicy.inspect(), storage: Object.keys(localStorage)
        };
        const node = window.CaissaPlayVisualComponents.createEmptyState({ title: 'Empty', message: 'No data' });
        document.body.appendChild(node); window.CaissaPlayVisualComponents.dispose(node);
        return {
            sameBoard: before.board === window.App.board,
            sameWorker: before.worker === (window.App.engine?.worker || null),
            lifecycle: window.App.gameLifecycle?.getSnapshot?.(), fairPlay: window.CaissaFairPlayPolicy.inspect(),
            storage: Object.keys(localStorage), beforeLifecycle: before.lifecycle, beforeFairPlay: before.fairPlay
        };
    });
    expect(proof.sameBoard).toBe(true); expect(proof.sameWorker).toBe(true);
    expect(proof.lifecycle).toEqual(proof.beforeLifecycle); expect(proof.fairPlay).toEqual(proof.beforeFairPlay);
});
