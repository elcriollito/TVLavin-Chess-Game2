import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

const topicSelector = '[data-help-topic="public-identity"]';

test('public identity Help is bilingual and keyboard accessible', async ({ page }) => {
    await page.goto('/help');

    const topic = page.locator(topicSelector);
    const summary = topic.locator('summary');
    await expect(summary).toHaveText('Change your public chess name');

    await summary.focus();
    await summary.press('Enter');
    await expect(topic).toHaveAttribute('open', '');

    await expect(topic.locator('[lang="en"]')).toContainText('your email stays private');
    await expect(topic.locator('[lang="es"]')).toContainText('tu correo electrónico permanece privado');
    await expect(topic).toContainText('Player-XXXX...');
    await expect(topic).toContainText('Account & identity');
    await expect(topic).toContainText('Public chess identity');
    await expect(topic).toContainText('Public nickname');
    await expect(topic).toContainText('Save public identity');

    const serious = (await new AxeBuilder({ page }).include(topicSelector).analyze())
        .violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
    expect(serious).toEqual([]);
});

test('public identity Help remains bounded at desktop, tablet, and mobile widths', async ({ page }) => {
    for (const viewport of [
        { width: 1440, height: 900 },
        { width: 885, height: 900 },
        { width: 390, height: 844 }
    ]) {
        await page.setViewportSize(viewport);
        await page.goto('/help');
        await page.locator(`${topicSelector} summary`).click();

        const geometry = await page.locator(topicSelector).evaluate(element => ({
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
            viewportWidth: document.documentElement.clientWidth,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        }));

        expect(geometry.left, `${viewport.width}px left bound`).toBeGreaterThanOrEqual(0);
        expect(geometry.right, `${viewport.width}px right bound`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
        expect(geometry.overflow, `${viewport.width}px horizontal overflow`).toBeLessThanOrEqual(1);
    }
});
