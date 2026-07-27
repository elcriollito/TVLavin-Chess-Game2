import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function inspectPending(page, path, forbiddenSelector) {
    let releaseModule;
    const gate = new Promise((resolve) => { releaseModule = resolve; });
    await page.route('**/js/endgame-trainer/endgame-trainer-page.js', async (route) => {
        await gate;
        await route.continue();
    });
    const navigation = page.goto(path, { waitUntil: 'load' });
    const root = page.locator('[data-endgame-trainer-page]');
    await expect(root).toHaveClass(/trainer-mode-pending/);
    await expect(page.locator('[data-trainer-bootstrap]')).toBeVisible();
    await expect(page.locator('[data-training-workspace]')).not.toBeVisible();
    await expect(page.locator('[data-endgame-v2-shell]')).not.toBeVisible();
    await expect(page.locator(forbiddenSelector)).not.toBeVisible();
    const pendingBox = await page.locator('[data-trainer-bootstrap]').boundingBox();
    expect(pendingBox.height).toBeGreaterThanOrEqual(300);
    expect((await new AxeBuilder({ page }).include('[data-trainer-bootstrap]').analyze()).violations).toEqual([]);
    releaseModule();
    await navigation;
    await expect(root).not.toHaveClass(/trainer-mode-pending/);
    await expect(page.locator('[data-trainer-bootstrap]')).not.toBeVisible();
    await page.unroute('**/js/endgame-trainer/endgame-trainer-page.js');
}

test('default, explicit V2, and historical run never expose legacy during slow bootstrap', async ({ page }) => {
    for (const path of [
        '/endgame-trainer',
        '/endgame-trainer?trainerV2=1',
        '/endgame-trainer?multiMovePilot=1&endgameRun=1'
    ]) {
        await inspectPending(page, path, '[data-action="prepare"]');
        await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/trainer-mode-v2/);
        await expect(page.locator('[data-action="prepare"]')).not.toBeVisible();
    }
});

test('legacy and private modes expose only their resolved experience', async ({ page }) => {
    await inspectPending(page, '/endgame-trainer?legacy=1', '[data-v2-action="start"]');
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/trainer-mode-legacy/);
    await expect(page.locator('[data-v2-action="start"]')).not.toBeVisible();

    for (const path of [
        '/endgame-trainer?multiMovePilot=1&objectiveArtifact=activate-king@1.0.0',
        '/endgame-trainer?multiMovePilot=1&privateEndgameRun=five-item'
    ]) {
        await inspectPending(page, path, '[data-v2-action="start"]');
        await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/trainer-mode-v2/);
        await expect(page.getByRole('button', { name: 'Start Challenge', exact: true })).not.toBeVisible();
    }
});

test('hard reload, disabled cache, mobile, reduced motion, Axe, and no-JS fallback remain stable', async ({ page, browser, browserName }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/endgame-trainer');
    await page.reload();
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/trainer-mode-v2/);
    expect(await page.locator('[data-board]').count()).toBe(1);
    if (browserName === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await page.reload();
        await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/trainer-mode-v2/);
        expect(await page.locator('[data-action="prepare"]').isVisible()).toBe(false);
        await cdp.detach();
    }

    const context = await browser.newContext({ javaScriptEnabled: false });
    const noJs = await context.newPage();
    await noJs.goto('/endgame-trainer');
    await expect(noJs.locator('.endgame-trainer-page__no-js')).toBeVisible();
    await expect(noJs.locator('[data-trainer-bootstrap]')).not.toBeVisible();
    await expect(noJs.locator('[data-training-workspace]')).not.toBeVisible();
    await context.close();
});
