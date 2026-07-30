import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
});

test('dark and light themes apply semantic tokens without rebuilding the board', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const proof = await page.evaluate(() => {
        window.__themeBoard = window.App.board;
        const before = { fen: window.App.game.fen(), orientation: window.App.board.orientation(),
            worker: window.App.engine?.worker || null };
        const dark = getComputedStyle(document.body);
        const darkValues = [dark.getPropertyValue('--play-theme-background'), dark.getPropertyValue('--play-theme-text')];
        window.CaissaPlayThemes.applyTheme('caissa-light');
        const light = getComputedStyle(document.body);
        return {
            before, darkValues,
            lightValues: [light.getPropertyValue('--play-theme-background'), light.getPropertyValue('--play-theme-text')],
            boardSame: window.App.board === window.__themeBoard,
            fenSame: window.App.game.fen() === before.fen,
            orientationSame: window.App.board.orientation() === before.orientation,
            workerSame: (window.App.engine?.worker || null) === before.worker,
            active: window.CaissaPlayThemes.getActiveTheme()
        };
    });
    expect(proof.darkValues).not.toEqual(proof.lightValues);
    expect(proof.boardSame && proof.fenSame && proof.orientationSame && proof.workerSame).toBe(true);
    expect(proof.active.resolvedThemeId).toBe('caissa-light');
});

test('system mode resolves media changes once and explicit override wins', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/play/games?simplified=1');
    expect(await page.evaluate(() => window.CaissaPlayThemes.applyTheme('system').value.resolvedThemeId))
        .toBe('caissa-light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => page.evaluate(() =>
        document.body.getAttribute('data-caissa-play-theme'))).toBe('caissa-dark');
    const proof = await page.evaluate(() => {
        window.CaissaPlayThemes.applyTheme('caissa-light');
        return window.CaissaPlayThemes.inspect();
    });
    expect(proof.resolvedThemeId).toBe('caissa-light');
    expect(proof.mediaListeners).toBe(0);
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await page.evaluate(() => document.body.dataset.caissaPlayTheme)).toBe('caissa-light');
});

test('switching preserves lifecycle, FairPlay, clocks, panel state, route, and resources', async ({ page }) => {
    await page.goto('/play/bots?simplified=1');
    await page.locator('[data-bot-id]').first().check();
    const proof = await page.evaluate(() => {
        const before = {
            board: window.App.board, fen: window.App.game.fen(), route: location.pathname + location.search,
            worker: window.App.engine?.worker || null,
            lifecycle: window.App.gameLifecycle?.getSnapshot?.(),
            fairPlay: window.CaissaFairPlayPolicy.inspect(),
            clocks: window.CaissaClockService?.getSnapshot?.(),
            bot: window.CaissaSimplifiedPlayShellInstance.inspect().botsPanel
        };
        window.CaissaPlayThemes.applyTheme('caissa-light');
        window.CaissaPlayThemes.applyTheme('caissa-dark');
        return {
            boardSame: before.board === window.App.board, fen: window.App.game.fen(),
            route: location.pathname + location.search, workerSame: before.worker === (window.App.engine?.worker || null),
            lifecycle: window.App.gameLifecycle?.getSnapshot?.(), fairPlay: window.CaissaFairPlayPolicy.inspect(),
            clocks: window.CaissaClockService?.getSnapshot?.(),
            bot: window.CaissaSimplifiedPlayShellInstance.inspect().botsPanel,
            before: { fen: before.fen, route: before.route, lifecycle: before.lifecycle,
                fairPlay: before.fairPlay, clocks: before.clocks, bot: before.bot }
        };
    });
    expect(proof.boardSame && proof.workerSame).toBe(true);
    expect(proof.fen).toBe(proof.before.fen); expect(proof.route).toBe(proof.before.route);
    expect(proof.lifecycle).toEqual(proof.before.lifecycle); expect(proof.fairPlay).toEqual(proof.before.fairPlay);
    expect(proof.clocks).toEqual(proof.before.clocks); expect(proof.bot).toEqual(proof.before.bot);
});

test('dark and light components, rail, Players, and Mentor remain readable across nine viewports', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const theme of ['caissa-dark', 'caissa-light']) {
        for (const viewport of [
            { width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 },
            { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1024, height: 768 },
            { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }
        ]) {
            await page.setViewportSize(viewport); await page.goto('/play/players?simplified=1');
            await page.evaluate(id => window.CaissaPlayThemes.applyTheme(id), theme);
            const proof = await page.evaluate(() => {
                const shell = document.querySelector('[data-caissa-simplified-shell]');
                const style = getComputedStyle(shell);
                const rail = document.querySelector('#evalBar');
                return {
                    bounded: document.documentElement.scrollWidth <= innerWidth + 1,
                    foreground: style.color, background: getComputedStyle(document.body).getPropertyValue('--play-theme-background'),
                    railBackground: rail ? getComputedStyle(rail).backgroundColor : null,
                    tabs: !!document.querySelector('[data-caissa-expression="inscribed-mode-rail"]'),
                    states: document.querySelectorAll('[data-visual-component="empty-state"]').length
                };
            });
            expect(proof.bounded && proof.tabs && proof.states === 5).toBe(true);
            expect(proof.foreground).not.toBe(proof.background);
            expect(proof.railBackground).not.toBeNull();
        }
    }
    const results = await new AxeBuilder({ page }).include('[data-caissa-simplified-shell]').analyze();
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});

test('Classic, Legacy Play, FICS, Analyze, Academy, and Endgame remain outside theme scope', async ({ page }) => {
    await page.goto('/');
    const before = await page.locator('#yahooClassicSection').evaluate(node => getComputedStyle(node).backgroundColor);
    await page.evaluate(() => window.CaissaPlayThemes.applyTheme('caissa-light'));
    const after = await page.locator('#yahooClassicSection').evaluate(node => getComputedStyle(node).backgroundColor);
    expect(after).toBe(before);
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
    for (const selector of ['#ficsSection', '#analyzeSection', '#academySection'])
        await expect(page.locator(selector)).not.toHaveAttribute('data-caissa-play-theme');
    await page.goto('/play/games');
    await expect(page.locator('[data-caissa-simplified-shell]')).toBeHidden();
    await expect(page.locator('#playSection')).not.toHaveAttribute('data-caissa-play-theme');
});
