import { test, expect } from '@playwright/test';

for (const [locale, expected] of [
    ['en', {
        title: 'Game Library', status: 'Under Construction',
        primary: 'We’re building your personal chess library.', back: 'Back to Play'
    }],
    ['es', {
        title: 'Biblioteca de partidas', status: 'En construcción',
        primary: 'Estamos creando tu biblioteca personal de ajedrez.', back: 'Volver a Jugar'
    }]
]) {
    test(`Game Library presents the localized ${locale.toUpperCase()} construction surface`, async ({ page }) => {
        await page.addInitScript(selected => {
            localStorage.setItem('caissa.locale', selected);
            localStorage.setItem('caissa_onboarding_completed', 'true');
        }, locale);
        await page.setViewportSize({ width: locale === 'en' ? 1440 : 390, height: 844 });
        await page.goto('/game-library');

        const panel = page.locator('#libraryPanel.caissa-library-construction-mode.open');
        const surface = panel.locator('[data-caissa-library-public-presentation]');
        await expect(surface).toBeVisible();
        await expect(surface.getByRole('heading', { level: 1 })).toHaveText(expected.title);
        await expect(surface.locator('.caissa-library-construction-status')).toHaveText(expected.status);
        await expect(surface).toContainText(expected.primary);
        await expect(surface.getByRole('link', { name: expected.back })).toHaveAttribute('href', '/play');
        await expect(page).toHaveURL(/\/game-library$/);
        await expect(page).toHaveTitle(locale === 'en'
            ? 'Game Library — Under Construction | CAISSA Chess'
            : 'Biblioteca de partidas — En construcción | CAISSA Chess');

        await expect(panel.locator('#libraryTabPositions')).toBeHidden();
        expect(await page.locator('#libraryTabPositions').count()).toBe(1);
        expect(await page.locator('#libraryImportInput').count()).toBe(1);
        const overflow = await surface.evaluate(element => ({
            surface: element.scrollWidth > element.clientWidth + 1,
            document: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        }));
        expect(overflow).toEqual({ surface: false, document: false });
    });
}

test('construction copy updates immediately when the shared selector changes locale', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('caissa.locale', 'en');
        localStorage.setItem('caissa_onboarding_completed', 'true');
    });
    await page.goto('/game-library');
    const title = page.locator('#caissaLibraryConstructionTitle');
    await expect(title).toHaveText('Game Library');
    await page.evaluate(() => window.CaissaI18n.setLocale('es'));
    await expect(title).toHaveText('Biblioteca de partidas');
    await expect(page).toHaveURL(/\/game-library$/);
});
