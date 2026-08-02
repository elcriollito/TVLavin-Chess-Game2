import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

async function completed(page) {
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('[data-post-game-action="mentor-review"]')).toBeHidden();
    await page.locator('[data-games-primary]').click();
    await expect(page.locator('[data-post-game-action="mentor-review"]')).toBeHidden();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('[data-post-game-action="mentor-review"]')).toBeVisible();
}

test('optional review launches explicitly from finalized PostGame with isolated resources', async ({ page }) => {
    await completed(page);
    const record = await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
    const before = page.url();
    await page.locator('[data-post-game-action="mentor-review"]').click();
    const review = page.locator('[data-native-mentor-review]');
    await expect(review).toBeVisible();
    await expect(review.getByRole('heading', { name: 'Review with Mentor' })).toBeFocused();
    await expect(review).toContainText('CAISSA automated local analysis');
    expect(page.url()).toBe(before);
    await expect(page.locator('#playSection')).toBeHidden();
    await expect(review.locator('.board-b72b1')).toHaveCount(1);
    expect(await page.evaluate(() => ({
        educational: !!window.CaissaMentorFoundation || !!window.CaissaEducationalAnalysisPipeline
            || !!window.CaissaMentorGuidedReplay || !!window.CaissaKnowledgeMappingRegistry,
        snapshot: window.CaissaNativeMentorReviewWorkspace.getSnapshot()
    }))).toMatchObject({ educational: false, snapshot: { recordId: record, boardCount: 1,
        activePlayClocks: 0, activeOpponentWork: 0, trainingMemoryWrites: 0, masteryWrites: 0 } });
});

test('move navigation is bounded, announced, stale-safe, and Back restores exact PostGame', async ({ page }) => {
    await completed(page);
    const record = await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
    await page.locator('[data-post-game-action="mentor-review"]').click();
    const status = page.locator('[data-mentor-review-status]');
    await expect(status).toContainText('Move 0 of 2');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(status).toContainText('Move 1 of 2');
    await page.getByRole('button', { name: 'Last' }).click();
    await expect(status).toContainText('Move 2 of 2');
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
    await page.locator('[data-review-ply="1"]').click();
    await expect(status).toContainText('Move 1 of 2');
    await page.getByRole('button', { name: 'Back to PostGame' }).click();
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Lost');
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(record);
});

test('browser Back, refresh without launch, accessibility and responsive layouts fail safe', async ({ page, browserName }) => {
    await completed(page);
    await page.locator('[data-post-game-action="mentor-review"]').click();
    for (const viewport of [{ width: 320, height: 568 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
    await page.emulateMedia({ reducedMotion: 'reduce', ...(browserName === 'chromium' ? { forcedColors: 'active' } : {}) });
    const axe = await new AxeBuilder({ page }).include('[data-native-mentor-review]').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await page.goBack();
    await expect(page.locator('[data-post-game-result]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-native-mentor-review]')).toHaveCount(0);
});
