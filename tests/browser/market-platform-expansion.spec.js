import { expect, test } from '@playwright/test';

const navigationLabels = ['Software', 'Books & PDFs', 'Recommendations', 'My Downloads'];

test('desktop Software catalog is calm, complete and production-off', async ({ page }) => {
    await page.goto('/market.html');
    await expect(page.getByRole('heading', { level: 1, name: 'Chess tools with a clear purpose.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'CAISSA PGN Reader' })).toBeVisible();
    await expect(page.getByText('CAISSA product', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buy — not enabled' })).toBeDisabled();
    for (const label of navigationLabels) {
        await expect(page.getByRole('navigation', { name: 'Market navigation' }).getByRole('link', { name: label })).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});

test('Reader detail exposes requirements, licensing, delivery and FAQ', async ({ page }) => {
    await page.goto('/market-reader.html');
    await expect(page.getByRole('heading', { level: 1, name: 'CAISSA PGN Reader' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Windows' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Entitlement protected' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'From your account to a short-lived download.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reader FAQ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buy — not enabled' })).toBeDisabled();
});

test('Books and Recommendations publish no products and stay unmistakably different', async ({ page }) => {
    await page.goto('/market-books.html');
    await expect(page.getByRole('heading', { level: 1, name: 'Books built around the board.' })).toBeVisible();
    await expect(page.getByText('No books released yet.')).toBeVisible();
    await expect(page.locator('main button')).toHaveCount(0);

    await page.goto('/market-recommendations.html');
    await expect(page.getByRole('heading', { level: 1, name: 'Recommended Chess Books & Gear' })).toBeVisible();
    await expect(page.getByText('Not sold by CAISSA', { exact: true })).toBeVisible();
    await expect(page.getByText('View at retailer', { exact: true })).toBeVisible();
    await expect(page.locator('main a[href^="http"]')).toHaveCount(0);
});

test('600 CSS pixel navigation remains visible, touch-sized and contained', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto('/market.html');
    const navigation = page.getByRole('navigation', { name: 'Market navigation' });
    for (const label of navigationLabels) {
        const link = navigation.getByRole('link', { name: label });
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});
