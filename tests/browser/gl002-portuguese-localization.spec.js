import { test, expect } from '@playwright/test';

test.setTimeout(240_000);

const routes = ['/play', '/play/games', '/play/bots', '/play/coach', '/game-library', '/pgn-replayer'];
const playRoutes = ['/play', '/play/games', '/play/bots', '/play/coach'];
const widths = [320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1440, 1920];

async function prepare(page, locale = 'pt') {
    await page.addInitScript(value => {
        if (!localStorage.getItem('caissa.locale')) localStorage.setItem('caissa.locale', value);
        localStorage.setItem('caissa_onboarding_completed', 'true');
    }, locale);
}

function surface(page, route) {
    if (route === '/game-library') return page.locator('[data-caissa-library-public-presentation]');
    if (route === '/pgn-replayer') return page.locator('[data-pgn-app]');
    return page.locator('[data-caissa-simplified-shell]');
}

async function presentation(page, route) {
    const selector = route === '/game-library' ? '[data-caissa-library-public-presentation]'
        : route === '/pgn-replayer' ? '[data-pgn-app]' : '[data-caissa-simplified-shell]';
    return page.locator(`${selector}, #sidebarAuthArea`).evaluateAll(elements => elements.flatMap(element => [
        element.innerText,
        ...[...element.querySelectorAll('[aria-label], [title], [placeholder], [alt]')]
            .filter(node => node.getClientRects().length > 0 && !node.closest('[hidden], [aria-hidden="true"]'))
            .flatMap(node => ['aria-label', 'title', 'placeholder', 'alt']
                .map(name => node.getAttribute(name)).filter(Boolean))
    ]).join('\n'));
}

test('Portuguese renders every certified Season 1 surface and public selector entry', async ({ page }) => {
    await prepare(page);
    const expected = new Map([
        ['/play', ['Configuração da partida', 'Controle de tempo', 'Força do adversário']],
        ['/play/games', ['Jogar partida', 'Brancas', 'Nova partida|Jogar']],
        ['/play/bots', ['Jogar contra bots', 'Novo no xadrez']],
        ['/play/coach', ['Jogar com Coach', 'Nível']],
        ['/game-library', ['Biblioteca de partidas', 'Em construção', 'Voltar para Jogar']],
        ['/pgn-replayer', ['Leitor PGN', 'Abrir PGN', 'Posição inicial']]
    ]);
    for (const route of routes) {
        await page.goto(route);
        await expect(surface(page, route)).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', 'pt');
        const copy = await surface(page, route).innerText();
        for (const phrase of expected.get(route)) expect(copy, route).toMatch(new RegExp(phrase, 'i'));
        const options = await page.locator('[data-caissa-locale-select]').first().locator('option').allTextContents();
        expect(options).toEqual(['English', 'Español', 'Português']);
    }
    await page.goto('/play/bots');
    await expect(page.locator('[data-bot-time] option').first()).toHaveText('Sem relógio');
    await page.goto('/play/coach');
    await expect(page.locator('[data-coach-experience] option')).toContainText(['Casual', 'Iniciante', 'Intermediário', 'Avançado', 'Especialista', 'Mestre', 'Grande mestre']);
    await expect(page.locator('#sidebarCreateAccount')).toHaveText('Criar conta');
    await expect(page.locator('#sidebarCreateAccount')).toHaveAttribute('aria-label', 'Criar conta');
});

test('Portuguese dynamic states, dialogs, tooltips, and accessible controls are localized', async ({ page }) => {
    await prepare(page);
    await page.goto('/play');
    await page.locator('[data-games-time="blitz-5"]').click();
    for (const [color, expected] of [
        ['white', '5+0 · Brancas selecionadas.'], ['black', '5+0 · Pretas selecionadas.'],
        ['random', '5+0 · Aleatório selecionado.']
    ]) {
        await page.locator(`[data-games-color="${color}"]`).click();
        await expect(page.locator('[data-games-status]')).toHaveText(expected);
    }
    await expect(page.locator('[data-active-game-settings]')).toContainText('Configurações do tabuleiro');
    await expect(page.locator('[data-caissa-play-share]')).toContainText('Compartilhar partida');
    await expect(page.locator('[data-caissa-post-game]')).toContainText('Analisar esta partida');
    await expect(page.locator('[data-active-game-action="settings"]')).toHaveAttribute('aria-label', 'Configurações');

    await page.goto('/play/bots');
    await page.locator('[data-bot-color="black"]').check({ force: true });
    await page.locator('[data-bot-time]').selectOption({ index: 1 });
    await expect(page.locator('[data-caissa-bots-panel]')).toContainText('Elo desejado');
    await expect(page.locator('.caissa-bots-panel__bot input').first()).toHaveAttribute('aria-label', /Elo desejado/);

    await page.goto('/play/coach');
    await page.locator('[data-coach-color-choice="black"]').check({ force: true });
    await page.locator('[data-coach-experience]').selectOption({ index: 1 });
    await expect(page.locator('[data-caissa-native-coach-panel]')).toHaveAttribute('aria-label', 'Configuração de jogo com Coach');
    await expect(page.locator('[data-coach-experience]')).toHaveAttribute('aria-label', 'Nível do Coach');

    await page.goto('/pgn-replayer');
    await page.locator('[data-pgn-options]').click();
    await expect(page.locator('[data-pgn-options-dialog]')).toContainText('Guia do leitor');
    await expect(page.locator('[data-pgn-options-dialog]')).toContainText('Acesso gratuito à biblioteca');
    await page.locator('[data-pgn-options-dialog] .pgn-button[value="close"]').click();
    await page.locator('[data-pgn-tab="albums"]').click();
    await expect(page.locator('[data-pgn-library-search]')).toHaveAttribute('placeholder', 'Pesquisar jogadores');
});

test('Portuguese residual detector covers initial and interacted first-party content', async ({ page }) => {
    await prepare(page);
    const forbidden = /\b(?:Create Account|Account unavailable|Game setup|Time control|Play as|Opponent Strength|New Game|Start Game|Play Computer|Games setup|White selected|Black selected|Random selected|Choose a bot|No Timer|Coming soon|Preview ready|Under Construction|Reader guide|Free library access|Search players|Jugar|Jugadas|Tablas|Configuración|Próximamente|Blancas seleccionadas|Negras seleccionadas)\b/i;
    for (const route of routes) {
        await page.goto(route);
        await expect(surface(page, route)).toBeVisible();
        if (route === '/play') {
            await page.locator('[data-games-time="blitz-5"]').click();
            await page.locator('[data-games-color="black"]').click();
        }
        if (route === '/play/bots') await page.locator('[data-bot-time]').selectOption({ index: 1 });
        if (route === '/play/coach') await page.locator('[data-coach-experience]').selectOption({ index: 1 });
        if (route === '/pgn-replayer') await page.locator('[data-pgn-options]').click();
        await expect.poll(() => presentation(page, route), { message: route }).not.toMatch(forbidden);
    }
});

test('EN, ES, and PT switch live in every direction and Portuguese persists', async ({ page }) => {
    await prepare(page, 'en');
    await page.goto('/play');
    const select = page.locator('[data-caissa-locale-select]').first();
    await expect(page.getByText('Game setup', { exact: true })).toBeVisible();
    await select.selectOption('pt');
    await expect(page.getByText('Configuração da partida', { exact: true })).toBeVisible();
    await select.selectOption('es');
    await expect(page.getByText('Configuración de partida', { exact: true })).toBeVisible();
    await select.selectOption('pt');
    await page.goto('/play/bots');
    await expect(page.getByText('Jogar contra bots', { exact: true })).toBeVisible();
    await page.goto('/play/coach');
    await expect(page.getByText('Jogar com Coach', { exact: true })).toBeVisible();
    await page.goto('/play/games');
    await page.goto('/pgn-replayer');
    await expect(page.getByRole('heading', { name: 'Leitor PGN' })).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-caissa-locale-select]').first()).toHaveValue('pt');
    await page.locator('[data-caissa-locale-select]').first().selectOption('en');
    await expect(page.getByRole('heading', { name: 'PGN Reader' })).toBeVisible();
    await page.locator('[data-caissa-locale-select]').first().selectOption('pt');
    await page.locator('[data-caissa-locale-select]').first().selectOption('es');
    await expect(page.getByRole('heading', { name: 'Lector PGN' })).toBeVisible();
});

test('Portuguese Play tabs remain bounded at all certified widths and effective sidebar states', async ({ page }) => {
    await prepare(page);
    for (const width of widths) {
        await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
        for (const route of playRoutes) {
            await page.goto(route);
            const geometry = await page.locator('.caissa-simplified-shell__modes').evaluate(nav => {
                const root = nav.getBoundingClientRect();
                const tabs = [...nav.querySelectorAll('[role="tab"]')].map(node => {
                    const rect = node.getBoundingClientRect();
                    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                        text: node.textContent.trim(), clipped: node.scrollWidth > node.clientWidth + 1
                            || node.scrollHeight > node.clientHeight + 1 };
                });
                const overlap = tabs.some((a, index) => tabs.slice(index + 1).some(b =>
                    a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1));
                return { root: { left: root.left, right: root.right }, tabs, overlap,
                    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
            });
            expect(geometry.overflow, `${route} ${width}px`).toBeLessThanOrEqual(1);
            expect(geometry.overlap, `${route} ${width}px`).toBe(false);
            for (const tab of geometry.tabs) {
                expect(tab.text).not.toBe('');
                expect(tab.clipped, `${tab.text} ${width}px`).toBe(false);
                expect(tab.left).toBeGreaterThanOrEqual(geometry.root.left - 1);
                expect(tab.right).toBeLessThanOrEqual(geometry.root.right + 1);
            }
        }
        if (width >= 1024) {
            for (const collapsed of [false, true]) {
                await page.locator('.app-container').evaluate((node, value) => node.classList.toggle('nav-collapsed', value), collapsed);
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                expect(overflow, `sidebar ${collapsed} ${width}px`).toBeLessThanOrEqual(1);
            }
        }
    }
});

test('Portuguese localization preserves player names, bot names, PGN, FEN, and move notation', async ({ page }) => {
    await prepare(page);
    await page.goto('/play/bots');
    await expect(page.getByText('Pip', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Nia', { exact: true })).toBeVisible();
    await page.goto('/pgn-replayer');
    await page.locator('[data-pgn-paste]').first().click();
    await page.locator('[data-pgn-paste-input]').fill('[Event "London Classic"]\n[White "White"]\n[Black "Black"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 e5 2. Nf3 Nc6 *');
    await page.locator('[data-pgn-load-paste]').click();
    await expect(page.locator('[data-pgn-title]')).toHaveText('White — Black');
    await expect(page.locator('[data-pgn-notation]')).toContainText('e4');
    await expect(page.locator('[data-pgn-notation]')).toContainText('Nf3');
});
