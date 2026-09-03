import { test, expect } from '@playwright/test';

test('Spanish first visit is advisory once and an explicit choice wins thereafter', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['es-AR', 'es'] });
        Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'es-AR' });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play');
    await page.evaluate(() => localStorage.removeItem('caissa.locale'));
    await page.reload();
    await page.getByRole('button', { name: 'Open navigation menu' }).first().click();

    const suggestion = page.locator('#mainNav [data-caissa-locale-suggestion="es"]');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
    await expect(suggestion).toContainText('Español');
    await suggestion.click();
    await expect(page.getByRole('link', { name: 'Jugar', exact: true })).toBeVisible();
    await expect(suggestion).toBeHidden();

    await page.reload();
    await page.getByRole('button', { name: /Open navigation menu|Abrir menú de navegación/ }).first().click();
    await expect(page.locator('#mainNav [data-caissa-locale-suggestion]')).toHaveCount(0);
    await expect(page.locator('#mainNav [data-caissa-locale-select]')).toHaveValue('es');

    await page.locator('#mainNav [data-caissa-locale-select]').selectOption('en');
    await page.reload();
    await page.getByRole('button', { name: 'Open navigation menu' }).first().click();
    await expect(page.locator('#mainNav [data-caissa-locale-suggestion]')).toHaveCount(0);
    await expect(page.locator('#mainNav [data-caissa-locale-select]')).toHaveValue('en');
});
