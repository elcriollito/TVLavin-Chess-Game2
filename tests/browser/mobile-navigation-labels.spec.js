import { test, expect } from '@playwright/test';

const widths = [320, 360, 375, 390, 412, 430];

for (const width of widths) {
    test(`${width}px drawer shows every real icon with its translated page name`, async ({ page }) => {
        await page.addInitScript(locale => {
            localStorage.setItem('caissa_onboarding_completed', 'true');
            localStorage.setItem('caissa.locale', locale);
        }, width % 2 ? 'en' : 'es');
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/play');
        await page.getByRole('button', { name: /Open navigation menu|Abrir menú de navegación/ }).first().click();

        const nav = page.locator('#mainNav');
        const result = await nav.evaluate(element => {
            const destinations = [...element.querySelectorAll('.nav-item[data-nav-key]')];
            const failures = destinations.flatMap(item => {
                const icon = item.querySelector('i:first-child');
                const label = item.querySelector('.nav-label');
                const itemBox = item.getBoundingClientRect();
                const iconBox = icon?.getBoundingClientRect();
                const labelBox = label?.getBoundingClientRect();
                const invalid = !icon || !label || !iconBox.width || !labelBox.width
                    || labelBox.left < iconBox.right
                    || item.scrollWidth > item.clientWidth + 1;
                return invalid ? [item.dataset.navKey] : [];
            });
            return {
                count: destinations.length,
                failures,
                navOverflow: element.scrollWidth > element.clientWidth + 1,
                documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
            };
        });

        expect(result.count).toBe(37);
        expect(result.failures).toEqual([]);
        expect(result.navOverflow).toBe(false);
        expect(result.documentOverflow).toBe(false);
        await expect(nav.locator('[data-nav-key="play"] .nav-label')).toHaveText(width % 2 ? 'Play' : 'Jugar');
        await expect(nav.locator('[data-nav-key="library"]')).toHaveAttribute('href', '/game-library');
    });
}

test('desktop expanded and collapsed navigation retain their established behavior', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/play');
    const nav = page.locator('#mainNav');
    await expect(nav.locator('[data-nav-key="play"] .nav-label')).toBeVisible();
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(nav.locator('[data-nav-key="play"] .nav-label')).toBeHidden();
    await expect(nav.locator('[data-nav-key="play"]')).toHaveAttribute('aria-label', 'Play');
});
