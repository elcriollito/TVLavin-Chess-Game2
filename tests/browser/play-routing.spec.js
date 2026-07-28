import { test, expect } from '@playwright/test';

test('root remains Classic and direct canonical Play cold loads one board', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
    await page.goto('/play');
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toHaveCount(1);
});

test('legacy query canonicalizes with FEN preserved', async ({ page }) => {
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';
    await page.goto(`/?section=play&fen=${encodeURIComponent(fen)}&opponent=computer`);
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    expect(new URL(page.url()).pathname).toBe('/play');
    expect(new URL(page.url()).searchParams.get('fen')).toBe(fen);
    expect(new URL(page.url()).searchParams.get('opponent')).toBe('computer');
});

for (const mode of ['bots', 'coach', 'players', 'unknown']) {
    test(`${mode} route safely normalizes to Games without fake UI`, async ({ page }) => {
        await page.goto(`/play/${mode}`);
        await expect(page.locator('#playSection')).toHaveClass(/active/);
        expect(new URL(page.url()).pathname).toBe('/play/games');
        await expect(page.locator(`#${mode}Panel`)).toHaveCount(0);
    });
}

test('Classic to Play to Back and Forward restores sections without duplicate entries', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-section="play"]').first().click();
    await expect(page).toHaveURL(/\/play$/);
    await page.goBack();
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
    await page.goForward();
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    const before = page.url();
    await page.locator('[data-section="play"]').first().click();
    expect(page.url()).toBe(before);
});

test('Play to Analyze to Back preserves tokenized handoff and Play route', async ({ page }) => {
    await page.goto('/play');
    await page.locator('[data-section="analyze"]').first().click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    const analyze = new URL(page.url());
    expect(analyze.searchParams.get('section')).toBe('analyze');
    expect(analyze.searchParams.get('handoff')).toBeTruthy();
    await page.goBack();
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    expect(new URL(page.url()).pathname).toBe('/play');
});

test('controller owns one popstate strategy and adds no runtime resources', async ({ page }) => {
    await page.goto('/play');
    const state = await page.evaluate(() => ({
        route: window.CaissaPlayRouteController.inspect(),
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        fakePanels: document.querySelectorAll('#botsPanel,#coachPanel,#playersPanel').length
    }));
    expect(state.route.listening).toBe(true);
    expect(state.boards).toBe(1);
    expect(state.fakePanels).toBe(0);
});
