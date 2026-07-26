import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('tests/visual-qa/season-10-7');

async function capture(page, name) {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true, animations: 'disabled' });
}

test('captures stable V2 visual checkpoints', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/endgame-trainer?trainerV2=1');
    await expect(page.locator('[data-v2-action="start"]')).toBeVisible();
    await capture(page, 'quick-challenge-ready-desktop-1440x900');
    await page.locator('[data-v2-open-modes]').click();
    await capture(page, 'modes-desktop-1440x900');
    await page.keyboard.press('Escape');
    await page.locator('[data-v2-action="start"]').click();
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveAttribute('data-state', 'v2-active');
    await capture(page, 'quick-challenge-active-desktop-1440x900');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/endgame-trainer?trainerV2=1');
    await expect(page.locator('[data-v2-action="start"]')).toBeVisible();
    await capture(page, 'quick-challenge-ready-mobile-390x844');

    await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1');
    await expect(page.getByRole('button', { name: 'Start Pilot' })).toBeVisible();
    await capture(page, 'multi-move-pilot-ready-mobile-390x844');
});
