import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

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

test('Play v2 setup, active play, URL, storage, and history cannot manufacture Analyze', async ({ page }) => {
    await page.goto('/play/beta?handoff=fabricated_token_123#analyze');
    await page.evaluate(() => {
        sessionStorage.setItem('caissa:analyze:active:v1', 'fabricated_token_123');
        sessionStorage.setItem('caissa:analyze:handoff:v1:fabricated_token_123', '{}');
        history.replaceState({ section: 'analyze', handoff: 'fabricated_token_123' }, '', location.href);
        dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/active/);
    expect((await page.evaluate(() => window.CaissaPostGameExperienceInstance.execute('analyze'))).ok).toBe(false);
    await page.locator('[data-games-primary]').click();
    await expect.poll(() => page.evaluate(() => window.App.gameActive)).toBe(true);
    expect((await page.evaluate(() => window.CaissaPostGameExperienceInstance.execute('analyze'))).ok).toBe(false);
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/active/);
});

test('completed Play v2 PostGame opens inline Analyze and Back restores the same record', async ({ page }) => {
    await page.goto('/play/beta');
    await page.locator('[data-games-primary]').click();
    await playMove(page, 'e2', 'e4');
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    const before = await page.evaluate(() => ({
        recordId: window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId,
        url: location.href
    }));
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active.*caissa-play-v2-inline-analyze|caissa-play-v2-inline-analyze.*active/);
    expect(page.url()).toBe(before.url);
    expect(new URL(page.url()).searchParams.has('handoff')).toBe(false);
    expect(await page.evaluate(() => Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
        .some(key => key?.startsWith('caissa:analyze:handoff:v1:')))).toBe(false);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    await expect(page.locator('[data-post-game-result]')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(before.recordId);
    expect((await page.evaluate(() => window.CaissaPlayV2InlineAnalyze.open({ token: 'consumed_token_123' }))).ok).toBe(false);
});

test('Legacy active-position Analyze retains its independent non-inline contract', async ({ page }) => {
    await page.goto('/play');
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const command = await page.evaluate(() => window.CaissaPlayCompatibility.execute('openAnalyze'));
    expect(command.ok).toBe(true);
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/caissa-play-v2-inline-analyze/);
    await page.evaluate(() => window.CaissaNavigation.navigateToSection('play'));
    await expect(page.locator('#playSection')).toHaveClass(/active/);
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
