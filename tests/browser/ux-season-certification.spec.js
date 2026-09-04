import { test, expect } from '@playwright/test';

const responsiveWidths = [320, 360, 375, 390, 412, 430, 768, 1024, 1440];

test('desktop and mobile breakpoint matrix has usable navigation without horizontal scroll', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('caissa.locale', 'es');
        localStorage.setItem('caissa_onboarding_completed', 'true');
    });
    for (const width of responsiveWidths) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/play');
        const nav = page.locator('#mainNav');
        if (width <= 768) {
            const toggle = page.getByRole('button', { name: /Open navigation menu|Abrir menú de navegación/ }).first();
            await toggle.click();
            await expect(nav.locator('[data-nav-key="play"] .nav-label')).toBeVisible();
            await expect(nav.locator('[data-caissa-locale-select]')).toBeVisible();
        } else {
            await expect(nav).toBeVisible();
            await expect(nav.locator('[data-caissa-locale-select]')).toBeVisible();
            await expect(nav.locator('[data-nav-key="play"]').first()).toHaveAttribute('aria-label', 'Jugar');
            if (width > 1200) await expect(nav.locator('[data-nav-key="about"] .nav-label')).toBeVisible();
        }
        const geometry = await page.evaluate(() => ({
            document: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            nav: document.getElementById('mainNav').scrollWidth <= document.getElementById('mainNav').clientWidth + 1
        }));
        expect(geometry, `${width}px`).toEqual({ document: true, nav: true });
        if (width <= 768) {
            await page.keyboard.press('Escape');
            await expect(nav).toHaveAttribute('aria-hidden', 'true');
        }
    }
});

test('manual locale survives reload and continues to beat Spanish browser preference', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['es-MX', 'es'] });
    });
    await page.goto('/play');
    await page.locator('[data-caissa-locale-select]').first().selectOption('en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-caissa-locale-select]').first()).toHaveValue('en');
    await expect(page.locator('[data-caissa-locale-suggestion]')).toHaveCount(0);
});

test('Classic, Play modes, PGN Reader, and Game Library retain protected route identity', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('caissa.locale', 'es');
        localStorage.setItem('caissa_onboarding_completed', 'true');
    });
    for (const route of [
        '/yahoo-classic', '/play', '/play/games', '/play/bots', '/play/coach', '/pgn-replayer', '/game-library'
    ]) {
        const response = await page.goto(route);
        expect(response?.status(), route).toBeLessThan(400);
        await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}$`));
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
        if (route === '/game-library') {
            await expect(page.getByRole('heading', { name: 'Biblioteca de partidas' })).toBeVisible();
        } else {
            await expect(page.locator('#mainNav [data-caissa-locale-select]')).toHaveValue('es');
        }
    }
});

test('every internal UX-001 destination remains locally routable', async ({ page }) => {
    await page.goto('/play');
    const routes = await page.evaluate(() => window.CaissaPrimaryNavigation.inventory.all
        .map(item => item.route)
        .filter(route => route.startsWith('/')));
    expect(routes).toHaveLength(33);
    for (const route of routes) {
        const response = await page.request.get(route);
        expect(response.status(), route).toBeLessThan(400);
    }
});

test('DOS Chess catalog alias serves the authoritative versioned asset', async ({ request }) => {
    const response = await request.get('/dos/dos_chess_games.json');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const catalog = await response.json();
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog).toHaveLength(25);
    expect(catalog.every(game => game.id && game.name && game.sourceUrl)).toBe(true);
});
