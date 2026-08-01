import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';

const production = 'https://www.caissa-chess.org';

test('production routes, defaults, gates, privacy, and accessibility remain Stage 0', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    const consoleErrors = [];
    const pageErrors = [];
    const deliveries = [];
    page.on('console', message => {
        if (message.type() === 'error' && !/^Failed to load resource: the server responded with a status of 404/.test(message.text())) consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
        if (['fetch', 'xhr'].includes(request.resourceType()) && /analytics|telemetry|collect|beacon/i.test(request.url())) deliveries.push(request.url());
    });
    for (const route of ['/', '/yahoo-classic', '/play', '/play/games', '/about', '/help']) {
        const response = await page.request.get(`${production}${route}`);
        expect(response.status(), route).toBe(200);
    }
    await page.goto(`${production}/play/games`);
    await expect(page.locator('.caissa-simplified-shell')).toHaveCount(1);
    await expect(page.locator('.caissa-simplified-shell')).toBeHidden();
    await page.goto(`${production}/play/games?simplified=1`);
    await expect(page.locator('.caissa-simplified-shell')).toHaveCount(1);
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toHaveCount(1);
    const proof = await page.evaluate(() => {
        const governance = window.CaissaPlayAnalyticsGovernance;
        return {
            registry: governance.getEventRegistry(), policy: governance.getPolicy(), health: governance.inspect(),
            releaseGlobal: Object.keys(window).some(key => /Season10PostDeploymentVerification/i.test(key)),
            releaseScript: [...document.scripts].some(script => /season-10-post-deployment-verification/i.test(script.src))
        };
    });
    expect(proof.registry).toHaveLength(31);
    expect(proof.registry.every(event => !event.productionEligible && !event.externalTransportEligible)).toBe(true);
    expect(proof.policy.transport.transport).toBe('none'); expect(proof.health).not.toHaveProperty('events');
    expect(proof.releaseGlobal).toBe(false); expect(proof.releaseScript).toBe(false); expect(deliveries).toEqual([]);
    const axe = await new AxeBuilder({ page }).include('.caissa-simplified-shell').analyze();
    expect(axe.violations).toEqual([]);
    expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    test(`production Simplified shell remains board-first at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(`${production}/play/games?simplified=1`);
        await expect(page.locator('.caissa-simplified-shell')).toHaveCount(1);
        await expect(page.locator('#playSection #chessboard .board-b72b1')).toHaveCount(1);
        const layout = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            boardWidth: document.querySelector('#playSection #chessboard')?.getBoundingClientRect().width || 0,
            shellVisible: document.querySelector('.caissa-simplified-shell')?.getBoundingClientRect().height > 0
        }));
        expect(layout.overflow).toBeLessThanOrEqual(2); expect(layout.boardWidth).toBeGreaterThan(200); expect(layout.shellVisible).toBe(true);
    });
}
