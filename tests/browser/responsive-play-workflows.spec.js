import { test, expect } from '@playwright/test';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';
import { positions } from '../play/fixtures/positions.js';
import { REQUIRED_CROSS_BROWSER_PROFILE_IDS, PLAY_RESPONSIVE_PROFILES } from './fixtures/play-responsive-profiles.js';
import { collectResponsiveGeometry, rectWithinViewport } from './helpers/play-responsive-geometry.js';
import { ensureResponsivePanelReachable, navigateToReadySimplifiedPlay } from './helpers/play-responsive-readiness.js';

const representative = PLAY_RESPONSIVE_PROFILES.filter(profile =>
    REQUIRED_CROSS_BROWSER_PROFILE_IDS.includes(profile.profileId));

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('Games, Bots, Coach, and production-blocked Players remain reachable after lazy mode loads', async ({ page }) => {
    for (const profile of representative) {
        await page.setViewportSize({ width: profile.width, height: profile.height });
        for (const mode of ['games', 'bots', 'coach', 'players']) {
            await navigateToReadySimplifiedPlay(page, `/play/${mode}?simplified=1`, mode);
            await expect(page.locator(`[data-shell-mode="${mode}"]`)).toHaveAttribute('aria-selected', 'true');
            const panel = page.locator('.caissa-simplified-shell__context');
            await ensureResponsivePanelReachable(page);
            await expect(panel).toBeVisible();
            expect((await collectResponsiveGeometry(page)).overflowX, `${profile.profileId}/${mode}`).toBeLessThanOrEqual(2);
        }
        await expect(page.locator('[data-players-panel]')).toContainText('unavailable');
    }
});

test('PostGame and promotion fit representative cross-browser profiles', async ({ page }) => {
    for (const profile of representative) {
        await page.setViewportSize({ width: profile.width, height: profile.height });
        await navigateToReadySimplifiedPlay(page, '/play/games?simplified=1', 'games');
        await page.locator('[data-games-primary]').click();
        await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
        const postGame = page.locator('.caissa-post-game');
        await expect(postGame).toBeVisible();
        await page.locator('.caissa-post-game__action--primary').scrollIntoViewIfNeeded();
        expect((await collectResponsiveGeometry(page)).overflowX, `${profile.profileId}/postgame`).toBeLessThanOrEqual(2);

        await page.locator('[data-post-game-action="new-game"]').click();
        await loadPosition(page, positions.whitePromotion.fen);
        await playMove(page, positions.whitePromotion.from, positions.whitePromotion.to);
        const modal = page.locator('#promotionModal');
        await expect(modal).toHaveClass(/show/);
        const box = await modal.locator('.modal-content').evaluate(node => {
            const value = node.getBoundingClientRect();
            return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
        });
        expect(rectWithinViewport(box, { width: profile.width, height: profile.height }), `${profile.profileId}/promotion`).toBe(true);
        expect(box.bottom).toBeLessThanOrEqual(profile.height + 2);
        await page.evaluate(() => window.handlePromotion('q'));
    }
});
