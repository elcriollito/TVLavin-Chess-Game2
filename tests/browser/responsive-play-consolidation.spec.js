import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';
import { profilesForBrowser } from './fixtures/play-responsive-profiles.js';
import {
    collectResponsiveGeometry, isSquare, rectWithinViewport
} from './helpers/play-responsive-geometry.js';
import { navigateToReadySimplifiedPlay } from './helpers/play-responsive-readiness.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('profile matrix preserves board-first geometry, reachability, accessibility, and resource ownership', async ({ page, browserName }) => {
    const profiles = profilesForBrowser(browserName);
    for (const profile of profiles) {
        await test.step(profile.profileId, async () => {
            await page.setViewportSize({ width: profile.width, height: profile.height });
            await navigateToReadySimplifiedPlay(page, '/play/games?simplified=1', 'games');
            await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
            await expect.poll(() => page.evaluate(() =>
                window.CaissaSimplifiedPlayShellInstance.getSnapshot().layoutMode))
                .toBe(profile.expectedLayout);

            const primary = page.locator('[data-games-primary]');
            await primary.focus();
            await expect(primary).toBeFocused();
            const geometry = await collectResponsiveGeometry(page);
            expect(isSquare(geometry.board), `${profile.profileId}: board aspect`).toBe(true);
            expect(rectWithinViewport(geometry.board, geometry.viewport), `${profile.profileId}: board horizontal bounds`).toBe(true);
            expect(geometry.board.width, `${profile.profileId}: board width`).toBeGreaterThan(180);
            expect(geometry.railOverlapsBoard, `${profile.profileId}: rail overlap`).toBe(false);
            expect(geometry.overflowX, `${profile.profileId}: horizontal overflow`).toBeLessThanOrEqual(2);
            expect(geometry.tabsVisible && geometry.panelVisible && geometry.primaryVisible).toBe(true);
            expect(rectWithinViewport(geometry.primary, geometry.viewport), `${profile.profileId}: primary CTA bounds`).toBe(true);
            expect(geometry.clocks).toBe(2);
            expect(geometry.headers).toBe(2);
            expect(geometry.footerCoversFocus).toBe(false);
            if (profile.orientation === 'portrait') expect(geometry.boardBeforeModes).toBe(true);

            const resources = await page.evaluate(() => ({
                boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
                workers: window.__caissaPlayHarness.snapshot().workersCreated,
                liveRegions: document.querySelectorAll('.caissa-simplified-shell [aria-live]').length,
                listeners: window.CaissaEventLifecycle.inspect().activeListeners,
                timers: window.CaissaEventLifecycle.inspect().activeTimers,
                observers: window.CaissaEventLifecycle.inspect().activeObservers
            }));
            expect(resources).toMatchObject({ boards: 1, workers: 1, liveRegions: 2, timers: 0, observers: 0 });
            expect(resources.listeners).toBeGreaterThan(0);
        });
    }

    const axe = await new AxeBuilder({ page }).include('.caissa-simplified-shell').analyze();
    expect(axe.violations).toEqual([]);
});
