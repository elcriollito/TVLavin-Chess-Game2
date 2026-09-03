import { test, expect } from '@playwright/test';

async function openMobileNavigation(page) {
    const toggle = page.getByRole('button', { name: /Open navigation menu|Abrir menú de navegación/ }).first();
    await expect(toggle).toBeVisible();
    await toggle.click();
}

test('desktop language selection translates navigation in place and persists', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/play');

    const selector = page.locator('[data-caissa-locale-select]').first();
    await expect(selector).toHaveValue('en');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toHaveAttribute('href', '/play');
    await selector.selectOption('es');

    await expect(page.getByRole('link', { name: 'Jugar', exact: true })).toHaveAttribute('href', '/play');
    await expect(page.locator('.nav-group-heading').first()).toHaveText('Jugar y competir');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('caissa.locale'))).toBe('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    await page.reload();
    await expect(page.locator('[data-caissa-locale-select]').first()).toHaveValue('es');
    await expect(page.getByRole('link', { name: 'Jugar', exact: true })).toHaveAttribute('aria-current', 'page');

    await page.locator('[data-caissa-locale-select]').first().selectOption('en');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('caissa.locale'))).toBe('en');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toHaveAttribute('href', '/play');
});

test('Spanish browser receives a recognizable suggestion and keeps English until accepted', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.removeItem('caissa.locale');
        localStorage.setItem('caissa_onboarding_completed', 'true');
        Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['es-MX', 'es'] });
        Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'es-MX' });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play');
    await openMobileNavigation(page);

    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
    const suggestion = page.locator('[data-caissa-locale-suggestion="es"]');
    await expect(suggestion).toContainText('Español');
    await suggestion.click();
    await expect(page.getByRole('link', { name: 'Jugar', exact: true })).toBeVisible();
    await expect(page.locator('[data-caissa-locale-select]').first()).toHaveValue('es');
});

test('mobile selector fits the shared PGN Reader drawer without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/pgn-replayer');
    await openMobileNavigation(page);

    const nav = page.locator('#mainNav');
    const selector = nav.locator('[data-caissa-locale-select]');
    await expect(selector).toBeVisible();
    const geometry = await nav.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        selectorRight: element.querySelector('[data-caissa-locale-select]').getBoundingClientRect().right,
        navRight: element.getBoundingClientRect().right
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.selectorRight).toBeLessThanOrEqual(geometry.navRight);
});

test('Classic, Play, and PGN Reader retain route identity with the localized shell', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('caissa.locale', 'es');
        localStorage.setItem('caissa_onboarding_completed', 'true');
    });
    for (const [route, activeName] of [
        ['/play', 'Jugar'],
        ['/yahoo-classic', 'CAISSA Classic'],
        ['/pgn-replayer', 'Lector PGN de CAISSA']
    ]) {
        await page.goto(route);
        const current = page.locator('#mainNav [aria-current="page"]');
        await expect(current).toHaveCount(1);
        await expect(current).toContainText(activeName);
        await expect(page.locator('[data-caissa-locale-select]').first()).toHaveValue('es');
    }
});

test('localized protected shells start without new console or page errors', async ({ page }) => {
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`console: ${message.text()} (${message.location().url})`);
    });
    page.on('pageerror', error => errors.push(`page: ${error.message}`));
    await page.addInitScript(() => {
        localStorage.setItem('caissa.locale', 'es');
        localStorage.setItem('caissa_onboarding_completed', 'true');
    });
    for (const route of ['/play', '/yahoo-classic', '/pgn-replayer']) {
        await page.goto(route);
        await expect(page.locator('[data-caissa-locale-select]').first()).toHaveValue('es');
    }
    const knownOptionalOpeningCatalog404 = errors.filter(error => error.includes('/api/pgn/opening'));
    const unexpected = errors.filter(error => !error.includes('/api/pgn/opening'));
    expect(knownOptionalOpeningCatalog404.length).toBeLessThanOrEqual(1);
    expect(unexpected).toEqual([]);
});
