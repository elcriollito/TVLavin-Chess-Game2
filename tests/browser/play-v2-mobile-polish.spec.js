import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

const mobileViewports = [
    { name: '320x568', width: 320, height: 568 },
    { name: '360x640', width: 360, height: 640 },
    { name: '390x844', width: 390, height: 844 },
    { name: '402x874', width: 402, height: 874 },
    { name: '430x932', width: 430, height: 932 }
];

const allViewports = [
    ...mobileViewports,
    { name: 'tablet-portrait', width: 768, height: 1024 },
    { name: 'tablet-landscape', width: 1024, height: 768 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '2560x1440', width: 2560, height: 1440 },
    { name: '3840x2160', width: 3840, height: 2160 }
];

async function openBeta(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto('/play/beta');
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
}

test('mobile setup owns one non-overlapping CTA and a truthful compact disclosure', async ({ page }, testInfo) => {
    await instrumentPlay(page);
    for (const viewport of mobileViewports) {
        await openBeta(page, viewport);
        const disclosure = page.locator('[data-games-setup-disclosure]');
        const summary = page.locator('[data-games-setup-summary]');
        const action = page.locator('[data-games-primary]');
        await expect(disclosure).not.toHaveAttribute('open', '');
        await expect(summary).toContainText('1+0 · Bullet · White');
        await action.scrollIntoViewIfNeeded();
        const collapsed = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            boards: document.querySelectorAll('#chessboard .board-b72b1').length,
            action: document.querySelector('[data-games-primary]').getBoundingClientRect().toJSON(),
            viewport: { width: innerWidth, height: visualViewport?.height || innerHeight }
        }));
        expect(collapsed.overflow).toBeLessThanOrEqual(1);
        expect(collapsed.boards).toBe(1);
        expect(collapsed.action.height).toBeGreaterThanOrEqual(44);
        expect(collapsed.action.bottom).toBeLessThanOrEqual(collapsed.viewport.height + 1);

        await summary.click();
        await expect(disclosure).toHaveAttribute('open', '');
        const presets = page.locator('[data-games-time] + span');
        await expect(presets).toHaveCount(7);
        for (const preset of ['1+0', '2+1', '3+0', '3+2', '5+0', '10+0', '15+10'])
            await expect(presets.filter({ hasText: preset })).toHaveCount(1);
        await page.locator('[data-games-time="rapid-15-10"]').check();
        await page.locator('[data-games-color="random"]').check();
        await expect(summary).toContainText('15+10 · Rapid · Random');
        await action.scrollIntoViewIfNeeded();
        const geometry = await page.evaluate(() => {
            const action = document.querySelector('[data-games-primary]').getBoundingClientRect();
            const setup = document.querySelector('[data-games-setup-disclosure]').getBoundingClientRect();
            const focusables = [...document.querySelectorAll('[data-games-setup-content] input')]
                .filter(node => node.offsetParent !== null).map(node => node.closest('label').getBoundingClientRect().toJSON());
            return { action: action.toJSON(), setup: setup.toJSON(), focusables,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        expect(geometry.setup.bottom).toBeLessThanOrEqual(geometry.action.top + 1);
        for (const rect of geometry.focusables) expect(rect.bottom).toBeLessThanOrEqual(geometry.action.top + 1);
        expect(geometry.overflow).toBeLessThanOrEqual(1);

        if (viewport.name === '390x844') {
            await page.locator('[data-games-color="random"]').focus();
            const focusGeometry = await page.evaluate(() => {
                const focused = document.activeElement.closest('label').getBoundingClientRect();
                const action = document.querySelector('[data-games-primary]').getBoundingClientRect();
                return { focused: focused.toJSON(), action: action.toJSON() };
            });
            expect(focusGeometry.focused.bottom).toBeLessThanOrEqual(focusGeometry.action.top + 1);
            const axe = await new AxeBuilder({ page }).analyze();
            expect(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
        }

        if (viewport.name === '390x844') {
            await summary.click();
            await page.screenshot({ path: testInfo.outputPath('collapsed-setup-portrait.png'), fullPage: true });
            await summary.click();
            await page.screenshot({ path: testInfo.outputPath('expanded-setup-portrait.png'), fullPage: true });
            await page.setViewportSize({ width: 390, height: 640 });
            await page.screenshot({ path: testInfo.outputPath('safari-chrome-shortened.png'), fullPage: true });
            await page.setViewportSize({ width: 844, height: 390 });
            await page.screenshot({ path: testInfo.outputPath('landscape-setup.png'), fullPage: true });
        }
    }
});

test('PostGame 1.1 hierarchy is identical from mobile through 4K', async ({ page }, testInfo) => {
    await instrumentPlay(page);
    for (const viewport of allViewports) {
        await openBeta(page, viewport);
        const disclosure = page.locator('[data-games-setup-disclosure]');
        if (!(await disclosure.evaluate(node => node.open))) await page.locator('[data-games-setup-summary]').click();
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await playMove(page, 'e2', 'e4');
        page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-active-game-action="resign"]').click();
        const actions = page.locator('[data-post-game-action]');
        await expect(actions).toHaveText(['Analyze This Game', 'Rematch', 'New Game', 'Review with Mentor', 'Copy PGN', 'Download PGN', 'Save PGN Locally']);
        await expect(page.locator('[data-post-game-action="analyze"]')).toHaveClass(/--primary/);
        await expect(page.locator('[data-post-game-action="rematch"]')).toHaveClass(/--secondary/);
        await expect(page.locator('[data-post-game-action="new-game"]')).toHaveClass(/--secondary/);
        await expect(page.locator('[data-post-game-action="mentor-review"]')).toHaveClass(/--mentor/);
        for (const action of ['copy-pgn', 'download-pgn', 'save-game'])
            await expect(page.locator(`[data-post-game-action="${action}"]`)).toHaveClass(/--pgn/);
        const domOrder = await actions.evaluateAll(nodes => nodes.map(node => node.dataset.postGameAction));
        expect(domOrder).toEqual(['analyze', 'rematch', 'new-game', 'mentor-review', 'copy-pgn', 'download-pgn', 'save-game']);
        if (viewport.name === '390x844') {
            for (const name of ['postgame-mobile.png', 'analyze-primary.png', 'rematch-new-game-secondary.png', 'mentor-pgn-utilities.png'])
                await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
        }
        if (viewport.name === '1440x900') await page.screenshot({ path: testInfo.outputPath('postgame-desktop.png'), fullPage: true });
    }
});
