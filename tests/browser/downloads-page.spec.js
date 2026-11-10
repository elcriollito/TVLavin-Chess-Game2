import { test, expect } from '@playwright/test';

async function prepare(page, locale = 'en') {
    await page.addInitScript(value => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        localStorage.setItem('caissa.locale', value);
    }, locale);
}

test('Downloads is first-class, localized, factual and contains no fake future links', async ({ page }) => {
    await prepare(page, 'en');
    await page.goto('/downloads');
    await expect(page).toHaveTitle(/Free Chess Tools/);
    await expect(page.locator('h1')).toHaveText('Chess tools, clearly released.');
    await expect(page.locator('.download-status.is-available')).toHaveText('Available');
    await expect(page.locator('.download-status.is-pending')).toHaveText('Coming soon');
    await expect(page.locator('#book-creator')).toContainText('0.3.1');
    await expect(page.locator('#book-creator a')).toHaveCount(0);
    await expect(page.locator('.is-future a')).toHaveCount(0);
    await expect(page.locator('a[href="/tools/polyglot"]')).not.toHaveCount(0);

    const selector = page.locator('[data-caissa-locale-select]').first();
    await selector.selectOption('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('h1')).toHaveText('Herramientas de ajedrez, con lanzamientos claros.');
    await expect(page.locator('#downloads-faq-title')).toHaveText('Preguntas sobre descargas y verificación');
    await selector.selectOption('pt');
    await expect(page.locator('h1')).toHaveText('Ferramentas de xadrez, com lançamentos claros.');
});

test('Downloads remains usable from 320 through desktop without horizontal overflow', async ({ page }) => {
    await prepare(page);
    for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) {
        await test.step(`${width}px`, async () => {
            await page.setViewportSize({ width, height: width <= 430 ? 844 : 1000 });
            await page.goto('/downloads');
            const metrics = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth - innerWidth,
                mobileToggleOverlap: innerWidth <= 600
                    && document.querySelector('.caissa-standalone-mobile-toggle').getBoundingClientRect().bottom
                        > document.querySelector('.downloads-breadcrumb').getBoundingClientRect().top,
                cards: [...document.querySelectorAll('.download-card')].every(card => {
                    const rect = card.getBoundingClientRect();
                    return rect.left >= -1 && rect.right <= innerWidth + 1;
                })
            }));
            expect(metrics.overflow).toBeLessThanOrEqual(1);
            expect(metrics.mobileToggleOverlap).toBe(false);
            expect(metrics.cards).toBe(true);
        });
    }
});

test('legacy Vault URLs redirect permanently to Downloads', async ({ page }) => {
    await prepare(page);
    const response = await page.goto('/vault');
    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(/\/downloads$/);
});
