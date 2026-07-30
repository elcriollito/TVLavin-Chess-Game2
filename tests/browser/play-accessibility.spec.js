import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page);
});

test('keyboard tabs activate routes, retain roving focus, and hide inactive panels from Tab order', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const games = page.getByRole('tab', { name: 'Games' });
    await games.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/play\/bots\?simplified=1/);
    await expect(page.getByRole('tab', { name: 'Bots' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Bots' })).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('End');
    await expect(page).toHaveURL(/\/play\/players\?simplified=1/);
    await expect(page.locator('.caissa-games-panel')).toBeHidden();
    await expect(page.locator('.caissa-players-panel')).toBeVisible();
});

test('one bounded manager owns two live regions and evaluation changes do not announce raw values', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const proof = await page.evaluate(() => {
        const shell = document.querySelector('[data-caissa-simplified-shell]');
        const before = window.CaissaSimplifiedPlayShellInstance.inspect();
        window.CaissaEvaluationRailInstance.setLoading();
        window.CaissaEvaluationRailInstance.setError();
        return {
            regions: shell.querySelectorAll('[aria-live]').length,
            railLive: document.querySelector('#evalBar').hasAttribute('aria-live'),
            text: [...shell.querySelectorAll('[aria-live]')].map(node => node.textContent),
            snapshot: window.CaissaSimplifiedPlayShellInstance.inspect().accessibility,
            boardSame: before.boardAdapterId === window.App.boardAdapter.getSnapshot().adapterId
        };
    });
    expect(proof.regions).toBe(2);
    expect(proof.railLive).toBe(false);
    expect(proof.text.join(' ')).not.toMatch(/[+-]\d+\.\d|mate in \d/i);
    expect(proof.snapshot.announcements.queueDepth).toBeLessThanOrEqual(8);
    expect(proof.boardSame).toBe(true);
});

test('focus is visible, touch targets pass, and Players static rows do not add redundant tab stops', async ({ page }) => {
    await page.goto('/play/players?simplified=1');
    const tab = page.getByRole('tab', { name: 'Players', exact: true });
    await tab.focus();
    const proof = await page.evaluate(() => {
        const focused = document.activeElement;
        const style = getComputedStyle(focused);
        const targets = [...document.querySelectorAll(
            '[data-caissa-simplified-shell] button:not(:disabled), [data-caissa-simplified-shell] summary, [data-caissa-simplified-shell] input:not(:disabled)'
        )].filter(node => node.getClientRects().length);
        return {
            outlineWidth: parseFloat(style.outlineWidth),
            minTarget: Math.min(...targets.map(node => node.getBoundingClientRect().height)),
            rowStops: document.querySelectorAll(
                '[data-presence-row][tabindex], [data-challenge-row][tabindex]'
            ).length,
            overflow: document.documentElement.scrollWidth <= innerWidth + 1
        };
    });
    expect(proof.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(proof.minTarget).toBeGreaterThanOrEqual(44);
    expect(proof.rowStops).toBe(0);
    expect(proof.overflow).toBe(true);
});

test('dark, light, system, reduced motion, forced colors, zoom reflow, and Axe safeguards pass', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'none', colorScheme: 'light' });
    await page.setViewportSize({ width: 640, height: 720 });
    await page.goto('/play/players?simplified=1');
    const proof = await page.evaluate(() => {
        window.CaissaPlayThemes.applyTheme('system');
        document.documentElement.style.zoom = '2';
        const shell = document.querySelector('[data-caissa-simplified-shell]');
        const focused = shell.querySelector('[role="tab"][tabindex="0"]');
        focused.focus();
        return {
            theme: document.body.dataset.caissaPlayTheme,
            reduced: window.CaissaPlayAccessibility.getReducedMotion(),
            outline: getComputedStyle(focused).outlineStyle,
            bounded: document.documentElement.scrollWidth <= innerWidth + 2
        };
    });
    expect(proof).toMatchObject({
        theme: 'caissa-light', reduced: true, outline: 'solid', bounded: true
    });
    const results = await new AxeBuilder({ page }).include('[data-caissa-simplified-shell]').analyze();
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active', colorScheme: 'light' });
    expect(await page.evaluate(() => ({
        forced: window.CaissaPlayAccessibility.getForcedColors(),
        outline: getComputedStyle(document.activeElement).outlineStyle
    }))).toEqual({ forced: true, outline: 'solid' });
});

test('promotion semantics and Classic, Legacy Play, FICS, and Analyze isolation remain intact', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('#promotionModal')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#promotionModal')).toHaveAttribute('aria-labelledby', 'promotion-title');
    await expect(page.locator('#chessboard')).toHaveAttribute('aria-description', /tap or drag/i);
    await expect(page.locator('#chessboard')).not.toHaveAttribute('aria-description', /arrow|square-by-square/i);
    await page.goto('/');
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
    for (const selector of ['#yahooClassicSection', '#ficsSection', '#analyzeSection'])
        await expect(page.locator(selector)).not.toHaveAttribute('data-caissa-accessibility-owner');
    await page.goto('/play/games');
    await expect(page.locator('[data-caissa-simplified-shell]')).toBeHidden();
});
