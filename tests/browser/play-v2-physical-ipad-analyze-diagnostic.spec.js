import { test, expect } from '@playwright/test';

test('retired iPad Analyze diagnostic routes fail closed', async ({ page }) => {
    for (const path of ['/play/beta/qa/ipad-analyze-diagnostic',
        '/play/beta/qa/ipad-analyze-diagnostic/bots',
        '/play/beta/qa/ipad-analyze-diagnostic/coach',
        '/play-v2-ipad-analyze-diagnostic.html']) {
        const response = await page.goto(path);
        await expect(page.locator('body')).toContainText(/Play beta is unavailable/i);
        await expect(page.locator('[data-ipad-analyze-diagnostic], #analyzeSection')).toHaveCount(0);
        expect(await response.text()).not.toMatch(/data-caissa-ipad-analyze-diagnostic|play-v2-inline-analyze/i);
    }
});
