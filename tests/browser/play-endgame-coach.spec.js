import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('legacy profile panel is retired in favor of the canonical seven-level Coach ladder', async ({ page }) => {
    await page.goto('/play/coach');
    await expect(page).toHaveURL(/\/play\/coach$/);
    await expect(page.locator('.caissa-coach-panel')).toHaveCount(0);
    const panel = page.locator('[data-caissa-native-coach-panel]');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: /Show All Levels/ }).click();
    const levels = await panel.locator('[data-coach-experience]').evaluateAll(inputs =>
        inputs.map(input => ({ id: input.value, label: input.getAttribute('aria-label') })));
    expect(levels).toEqual([
        { id: 'casual', label: 'Casual' },
        { id: 'intermediate', label: 'Balanced' },
        { id: 'advanced', label: 'Challenging' },
        { id: 'beginner', label: 'Beginner' },
        { id: 'expert', label: 'Expert' },
        { id: 'master', label: 'Master' },
        { id: 'grandmaster', label: 'Grandmaster' }
    ]);
});

test('expanded ladder and permanent shell remain bounded at mobile and desktop sizes', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        await page.goto('/play/coach');
        const panel = page.locator('[data-caissa-native-coach-panel]');
        await panel.getByRole('button', { name: /Show All Levels/ }).click();
        const geometry = await panel.evaluate(node => ({
            width: node.getBoundingClientRect().width,
            viewport: document.documentElement.clientWidth,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            regions: node.querySelectorAll(':scope > [data-caissa-coach-head], :scope > [data-caissa-coach-body], :scope > [data-caissa-coach-foot]').length
        }));
        expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        expect(geometry.regions).toBe(3);
    }
});
