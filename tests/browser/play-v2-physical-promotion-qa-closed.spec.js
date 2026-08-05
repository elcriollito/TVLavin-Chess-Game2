import { test, expect } from '@playwright/test';

test('promotion harness fails closed without the capability gate', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('CAISSA_PLAY_V2_PHYSICAL_QA', 'promotion');
        sessionStorage.setItem('CAISSA_PLAY_V2_BETA_STAGE', 'internal');
    });
    for (const path of ['/play/beta/qa/promotion', '/play/beta/qa/promotion?promotion=1', '/play-v2-promotion-qa.html']) {
        await page.goto(path);
        await expect(page).toHaveTitle(/Play Beta Unavailable/);
        await expect(page.locator('script')).toHaveCount(0);
        await expect(page.locator('#chessboard')).toHaveCount(0);
    }
});
