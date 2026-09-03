import { test, expect } from '@playwright/test';

const routes = ['/play', '/play/games', '/play/bots', '/play/coach', '/game-library', '/pgn-replayer'];

async function prepare(page, locale = 'en') {
    await page.addInitScript(value => {
        if (!localStorage.getItem('caissa.locale')) localStorage.setItem('caissa.locale', value);
        localStorage.setItem('caissa_onboarding_completed', 'true');
    }, locale);
}

async function visibleSurface(page, route) {
    if (route === '/game-library') return page.locator('[data-caissa-library-public-presentation]');
    if (route === '/pgn-replayer') return page.locator('[data-pgn-app]');
    return page.locator('[data-caissa-simplified-shell]');
}

test('six priority routes render their first-party surface in English and Spanish', async ({ page }) => {
    await prepare(page, 'en');
    for (const route of routes) {
        await page.goto(route);
        const surface = await visibleSurface(page, route);
        await expect(surface).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    }
    await page.evaluate(() => localStorage.setItem('caissa.locale', 'es'));
    const expected = new Map([
        ['/play', ['Configuración de partida', 'Control de tiempo', 'Fuerza del oponente']],
        ['/play/games', ['Jugar partida', 'Blancas', 'Nueva partida|Jugar']],
        ['/play/bots', ['Jugar contra bots', 'Nuevo en ajedrez', 'Sin reloj']],
        ['/play/coach', ['Jugar con Coach', 'Nivel', 'Gran maestro']],
        ['/game-library', ['Biblioteca de partidas', 'En construcción', 'Volver a Jugar']],
        ['/pgn-replayer', ['Lector PGN', 'Abrir PGN', 'Posición inicial']]
    ]);
    for (const route of routes) {
        await page.goto(route);
        const surface = await visibleSurface(page, route);
        await expect(surface).toBeVisible();
        const copy = await surface.innerText();
        for (const phrase of expected.get(route)) expect(copy).toMatch(new RegExp(phrase, 'i'));
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    }
});

test('locale changes live, survives reload, and persists through navigation', async ({ page }) => {
    await prepare(page, 'en');
    await page.goto('/play');
    await expect(page.getByText('Game setup', { exact: true })).toBeVisible();
    await page.locator('[data-caissa-locale-select]').first().selectOption('es');
    await expect(page.getByText('Configuración de partida', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Configuración de partida', { exact: true })).toBeVisible();
    await page.goto('/pgn-replayer');
    await expect(page.getByRole('heading', { name: 'Lector PGN' })).toBeVisible();
    await expect(page.locator('[data-caissa-locale-select]').first()).toHaveValue('es');
});

test('Spanish priority surfaces reject known English residual UI copy', async ({ page }) => {
    await prepare(page, 'es');
    const forbidden = /\b(?:Game setup|Time control|Play as|Opponent Strength|New Game|Choose a bot|No Timer|Checking Coach access|Open PGN|Notation will appear|Start position|Under Construction)\b/i;
    for (const route of routes) {
        await page.goto(route);
        const surface = await visibleSurface(page, route);
        await expect(surface).toBeVisible();
        expect(await surface.innerText(), route).not.toMatch(forbidden);
    }
    await page.goto('/play');
    expect(await page.locator('[data-active-game-settings]').innerText()).toContain('Configuración del tablero');
    expect(await page.locator('[data-caissa-play-share]').innerText()).toContain('Compartir partida');
    expect(await page.locator('[data-caissa-post-game]').innerText()).toContain('Analizar esta partida');
    await page.goto('/pgn-replayer');
    await page.locator('[data-pgn-options]').click();
    const guide = await page.locator('[data-pgn-options-dialog]').innerText();
    expect(guide).not.toMatch(/\b(?:Reader guide|Options & About|Player figurines|Find a collection quickly|Free library access)\b/i);
    await page.locator('[data-pgn-options-dialog] .pgn-button[value="close"]').click();
    await page.locator('[data-pgn-tab="albums"]').click();
    await expect(page.locator('[data-pgn-library-search]')).toHaveAttribute('placeholder', 'Buscar jugadores');
    const albums = await page.locator('[data-pgn-tabpanel="albums"]').innerText();
    expect(albums).not.toMatch(/\b(?:Player game collection|player game collections|stored by|Search players|July)\b/i);
});

test('longer Spanish copy has no page-level horizontal overflow on desktop or mobile', async ({ page }) => {
    await prepare(page, 'es');
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const route of routes) {
            await page.goto(route);
            await expect(await visibleSurface(page, route)).toBeVisible();
            const geometry = await page.evaluate(() => ({
                viewport: document.documentElement.clientWidth,
                content: document.documentElement.scrollWidth
            }));
            expect(geometry.content, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(geometry.viewport + 2);
        }
    }
});

test('PGN player names, moves, PGN data, and bot character names remain unchanged', async ({ page }) => {
    await prepare(page, 'es');
    await page.goto('/play/bots');
    await expect(page.getByText('Pip', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Nia', { exact: true })).toBeVisible();
    await page.goto('/pgn-replayer');
    await page.locator('[data-pgn-paste]').first().click();
    await page.locator('[data-pgn-paste-input]').fill('[Event "London Classic"]\n[White "White"]\n[Black "Black"]\n\n1. e4 e5 2. Nf3 Nc6 *');
    await page.locator('[data-pgn-load-paste]').click();
    await expect(page.locator('[data-pgn-title]')).toHaveText('White — Black');
    await expect(page.locator('[data-pgn-notation]')).toContainText('e4');
    await expect(page.locator('[data-pgn-notation]')).toContainText('Nf3');
});
