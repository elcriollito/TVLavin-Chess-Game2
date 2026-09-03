import { test, expect } from '@playwright/test';

async function openMobileNavigation(page) {
    const toggle = page.getByRole('button', { name: /Open navigation menu|Abrir menú de navegación/ }).first();
    await toggle.click();
}

test('language selector is a compact native part of desktop navigation', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/play');

    const control = page.locator('#mainNav .nav-language-control');
    const selector = control.getByRole('combobox', { name: 'Interface language' });
    await expect(control).toContainText('🌐');
    await expect(selector.locator('option')).toHaveText(['English', 'Español']);
    await expect(selector).toHaveValue('en');

    const geometry = await control.evaluate(element => ({
        width: element.getBoundingClientRect().width,
        navWidth: element.closest('nav').getBoundingClientRect().width
    }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.navWidth);
});

test('language selector supports keyboard focus and exposes the selected language', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play');
    await openMobileNavigation(page);

    const selector = page.locator('#mainNav [data-caissa-locale-select]');
    await selector.focus();
    await expect(selector).toBeFocused();
    expect(await selector.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
    expect(await selector.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);

    await selector.selectOption('es');
    await expect(selector).toHaveValue('es');
    await expect(page.locator('#mainNav .nav-language-label')).toContainText('Idioma');
    await expect(page.getByRole('link', { name: 'Jugar', exact: true })).toBeVisible();
});
