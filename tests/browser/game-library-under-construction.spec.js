import { test, expect } from '@playwright/test';

const localeCopy = {
    en: { title: 'Game Library', status: 'Under Construction', positions: 'Positions', games: 'Games', filters: 'Advanced Filters' },
    es: { title: 'Biblioteca de partidas', status: 'En construcción', positions: 'Posiciones', games: 'Partidas', filters: 'Filtros avanzados' },
    pt: { title: 'Biblioteca de partidas', status: 'Em construção', positions: 'Posições', games: 'Partidas', filters: 'Filtros avançados' }
};

async function prepare(page, locale = 'en') {
    await page.addInitScript(selected => {
        localStorage.setItem('caissa.locale', selected);
        localStorage.setItem('caissa_onboarding_completed', 'true');
    }, locale);
}

async function expectNoClassic(page) {
    for (const selector of [
        '#yahooClassicSection', '#yc-classic-root', '.chess-room', '.room-tables',
        '.fics-lobby', '.player-lobby', 'iframe'
    ]) await expect(page.locator(selector)).toHaveCount(0);
}

for (const locale of ['en', 'es', 'pt']) {
    test(`public first-party Game Library keeps the ${locale.toUpperCase()} release boundary`, async ({ page }) => {
        await prepare(page, locale);
        await page.goto('/game-library');
        await expect(page.locator('[data-caissa-standalone-sidebar]')).toBeVisible();
        const surface = page.locator('[data-caissa-library-public-presentation]');
        await expect(surface).toBeVisible();
        await expect(surface.getByRole('heading', { level: 1 })).toHaveText(localeCopy[locale].title);
        await expect(surface.locator('.game-library-status')).toHaveText(localeCopy[locale].status);
        await expect(page.locator('[data-game-library-workspace]')).toBeHidden();
        await expect(page).toHaveURL(/\/game-library$/);
        await expectNoClassic(page);
    });
}

test('future functional boundary preserves tabs, IndexedDB persistence, filters, and backup', async ({ page }) => {
    await prepare(page, 'en');
    await page.goto('/game-library');
    await page.evaluate(() => {
        document.body.dataset.gameLibraryRelease = 'available';
        window.CaissaGameLibraryPage.render();
    });
    const workspace = page.locator('[data-game-library-workspace]');
    await expect(workspace).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Positions' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /Advanced Filters/ })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: /Advanced Filters/ }).click();
    await expect(page.getByRole('button', { name: /Advanced Filters/ })).toHaveAttribute('aria-expanded', 'true');

    await page.evaluate(async () => {
        await CaissaLibrary.savePosition({
            fen: '8/8/8/8/8/8/4K3/7k w - - 0 1', title: 'LIB-006 persistence', tags: ['qa']
        });
        await CaissaLibrary.upsertTag('qa');
        await window.LibraryUI.renderPositionList();
        await window.LibraryUI.renderTagFilter();
        await window.LibraryUI.updateStats();
    });
    await expect(page.getByText('LIB-006 persistence', { exact: true })).toBeVisible();
    await expect(page.locator('#libraryTagFilter')).toContainText('qa');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Backup' }).click();
    expect((await download).suggestedFilename()).toBe('caissa-library-backup.json');
    await page.locator('#libraryImportInput').setInputFiles({
        name: 'library-import.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ positions: [{
            fen: '8/8/8/8/8/8/3K4/7k b - - 0 1', title: 'LIB-006 import', tags: []
        }] }))
    });
    await expect(page.getByText('LIB-006 import', { exact: true })).toBeVisible();

    await page.reload();
    await page.evaluate(() => {
        document.body.dataset.gameLibraryRelease = 'available';
        window.CaissaGameLibraryPage.render();
    });
    await expect(page.getByText('LIB-006 persistence', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Positions' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Games' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#libraryGamesPanel')).toBeVisible();
    await expectNoClassic(page);
});

test('functional Library changes EN to ES to PT without route or control regressions', async ({ page }) => {
    await prepare(page, 'en');
    await page.goto('/game-library');
    await page.evaluate(() => { document.body.dataset.gameLibraryRelease = 'available'; window.CaissaGameLibraryPage.render(); });
    for (const locale of ['en', 'es', 'pt']) {
        await page.evaluate(selected => window.CaissaI18n.setLocale(selected), locale);
        await expect(page.locator('#game-library-workspace-title')).toHaveText(localeCopy[locale].title);
        await expect(page.getByRole('tab', { name: localeCopy[locale].positions })).toBeVisible();
        await expect(page.getByRole('tab', { name: localeCopy[locale].games })).toBeVisible();
        await expect(page.getByRole('button', { name: new RegExp(localeCopy[locale].filters) })).toBeVisible();
        await expect(page.locator('#librarySearch')).toHaveAttribute('aria-label', locale === 'en' ? 'Search positions' : locale === 'es' ? 'Buscar posiciones' : 'Pesquisar posições');
    }
});

test('responsive matrix has no overflow, clipping, overlay, or Classic content', async ({ page }) => {
    const profiles = [320, 360, 375, 390, 393, 412, 430, 768, 1024, 1280, 1440, 1920];
    await prepare(page, 'pt');
    for (const width of profiles) {
        await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
        await page.goto('/game-library');
        const geometry = await page.evaluate(() => ({
            documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            surfaceOverflow: [...document.querySelectorAll('[data-caissa-library-public-presentation]')]
                .some(element => element.scrollWidth > element.clientWidth + 1)
        }));
        expect(geometry, `${width}px`).toEqual({ documentOverflow: false, surfaceOverflow: false });
        await expect(page.locator('[data-caissa-library-public-presentation]')).toBeVisible();
        await expectNoClassic(page);
    }
});
