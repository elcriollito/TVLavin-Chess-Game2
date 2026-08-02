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
    await expect(page.locator('[data-native-mentor-review]')).toBeVisible();
    for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 800 }, { width: 390, height: 844 },
        { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        const geometry = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect();
            const board = rect('.caissa-mentor-review__board'); const widget = rect('#mentor-review-board .board-b72b1');
            const side = document.querySelector('.caissa-mentor-review__side');
            const controls = [...document.querySelectorAll('[data-review-nav], [data-review-back]')].map(node => {
                const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, height: box.height };
            });
            return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                board: { width: board.width, height: board.height }, widget: { left: widget.left, right: widget.right, width: widget.width },
                sideOverflow: side.scrollWidth - side.clientWidth, controls };
        });
        expect(geometry.overflow, `${viewport.width}px document`).toBe(0);
        expect(Math.abs(geometry.board.width - geometry.board.height), `${viewport.width}px board square`).toBeLessThanOrEqual(1);
        expect(geometry.board.width, `${viewport.width}px practical board`).toBeGreaterThanOrEqual(viewport.width === 320 ? 280 : 300);
        expect(geometry.widget.left, `${viewport.width}px board left`).toBeGreaterThanOrEqual(0);
        expect(geometry.widget.right, `${viewport.width}px board right`).toBeLessThanOrEqual(viewport.width);
        expect(geometry.sideOverflow, `${viewport.width}px side scroller`).toBeLessThanOrEqual(0);
        expect(geometry.controls).toHaveLength(5);
        for (const control of geometry.controls) {
            expect(control.left, `${viewport.width}px control left`).toBeGreaterThanOrEqual(0);
            expect(control.right, `${viewport.width}px control right`).toBeLessThanOrEqual(viewport.width);
            expect(control.height, `${viewport.width}px touch target`).toBeGreaterThanOrEqual(44);
        }
    }
    await page.setViewportSize({ width: 320, height: 800 });
    await page.addStyleTag({ content: 'html { zoom: 2; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '200% zoom').toBe(0);
    await page.locator('[data-review-nav="next"]').focus(); await expect(page.locator('[data-review-nav="next"]')).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce', ...(browserName === 'chromium' ? { forcedColors: 'active' } : {}) });
    const axe = await new AxeBuilder({ page }).include('[data-native-mentor-review]').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await page.goBack();
    await expect(page.locator('[data-post-game-result]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-native-mentor-review]')).toHaveCount(0);
});
