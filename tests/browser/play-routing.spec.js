import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('home remains independent while canonical Play cold-loads one board', async ({ page, request }) => {
    const home = await request.get('/', { maxRedirects: 0 });
    expect(home.status()).toBe(200);
    await page.goto('/play');
    expect(new URL(page.url()).pathname).toBe('/play');
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toHaveCount(1);
});

test('historical root Analyze query keeps its current fail-closed behavior unchanged', async ({ page }) => {
    const historical = '/?section=analyze&handoff=historical_probe';
    const response = await page.goto(historical);
    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${historical.replace('?', '\\?')}$`));
    await expect(page.locator('#analyzeSection, [data-caissa-analyze-v2]')).toHaveCount(0);
});

for (const mode of ['bots', 'coach']) {
    test(`${mode} public route retains its canonical URL and selects its released mode`, async ({ page }) => {
        await page.goto(`/play/${mode}`);
        await expect(page.locator('#playSection')).toHaveClass(/active/);
        expect(new URL(page.url()).pathname).toBe(`/play/${mode}`);
        await expect(page.locator(`[data-shell-mode="${mode}"]`)).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);
        await expect(page.locator(`#${mode}Panel`)).toHaveCount(0);
    });
}

for (const mode of ['players', 'unknown']) {
    test(`${mode} public descendant fails closed`, async ({ page }) => {
        await page.goto(`/play/${mode}`);
        expect(new URL(page.url()).pathname).toBe(`/play/${mode}`);
        await expect(page.locator('#playSection')).toHaveCount(0);
        await expect(page.locator('body')).toContainText(/unavailable/i);
    });
}

test('current navigation API preserves Back and Forward without duplicate entries', async ({ page }) => {
    await page.goto('/play?simplified=1');
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/bots?simplified=1'));
    await expect(page.locator('[data-shell-mode="bots"]')).toHaveAttribute('aria-selected', 'true');
    await page.goBack();
    await expect(page.locator('[data-shell-mode="games"]')).toHaveAttribute('aria-selected', 'true');
    await page.goForward();
    await expect(page.locator('[data-shell-mode="bots"]')).toHaveAttribute('aria-selected', 'true');
    const before = page.url();
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/bots?simplified=1'));
    expect(page.url()).toBe(before);
});

test('Play v2 setup, active play, URL, storage, and history cannot manufacture Analyze', async ({ page }) => {
    await page.goto('/play?handoff=fabricated_token_123#analyze');
    await page.evaluate(() => {
        sessionStorage.setItem('caissa:analyze:active:v1', 'fabricated_token_123');
        sessionStorage.setItem('caissa:analyze:handoff:v1:fabricated_token_123', '{}');
        history.replaceState({ section: 'analyze', handoff: 'fabricated_token_123' }, '', location.href);
        dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await expect(page.locator('#analyzeSection')).toHaveCount(0);
    expect((await page.evaluate(() => window.CaissaPostGameExperienceInstance.execute('analyze'))).ok).toBe(false);
    await page.locator('[data-games-primary]').click();
    await expect.poll(() => page.evaluate(() => window.App.gameActive)).toBe(true);
    expect((await page.evaluate(() => window.CaissaPostGameExperienceInstance.execute('analyze'))).ok).toBe(false);
    await expect(page.locator('#analyzeSection')).toHaveCount(0);
});

test('completed Play v2 PostGame opens the canonical Analyzer and Back restores the same record', async ({ page }) => {
    await page.goto('/play/games');
    await page.locator('[data-games-primary]').click();
    await playMove(page, 'e2', 'e4');
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    const before = await page.evaluate(() => ({
        recordId: window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId,
        url: location.href
    }));
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.locator('[data-post-game-action="analyze"]').click()
    ]);
    await expect(page).toHaveURL(/\/analyze\?handoff=[A-Za-z0-9_-]+$/);
    await expect(page.locator('[data-caissa-analyze-v2]')).toHaveAttribute('data-analyze-v2-ready', 'true');
    expect(new URL(page.url()).searchParams.has('handoff')).toBe(true);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    expect(page.url()).toBe(before.url);
    const restored = await page.evaluate(() => ({
        gameActive: window.App?.gameActive === true,
        postGame: window.CaissaPostGameExperienceInstance?.getSnapshot?.(),
        activeWorkers: window.CaissaPlayV2BotWorkerReadiness?.getSnapshot?.().activeWorkerCount ?? 0
    }));
    expect(restored.gameActive).toBe(false);
    expect(restored.activeWorkers).toBe(0);
    if (restored.postGame?.visible) expect(restored.postGame.gameRecordId).toBe(before.recordId);
});

test('general Analyze navigation opens the canonical document without a handoff token', async ({ page }) => {
    await page.goto('/play/games');
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.locator('a[href="/analyze"][data-nav-key="analyze"]').click()
    ]);
    await expect(page).toHaveURL(/\/analyze$/);
    expect(new URL(page.url()).search).toBe('');
    await expect(page.locator('[data-caissa-analyze-v2]')).toHaveAttribute('data-analyze-v2-ready', 'true');
});

test('official Play denies the legacy active-position Analyze contract without mutation', async ({ page }) => {
    await page.goto('/play?simplified=1');
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const before = await page.evaluate(() => window.CaissaPlayCompatibility.getCurrentFen());
    const command = await page.evaluate(() => window.CaissaPlayCompatibility.execute('openAnalyze'));
    expect(command.ok).toBe(false);
    await expect(page.locator('#analyzeSection')).toHaveCount(0);
    expect(await page.evaluate(() => window.CaissaPlayCompatibility.getCurrentFen())).toBe(before);
});

test('controller owns one popstate strategy and adds no runtime resources', async ({ page }) => {
    await page.goto('/play?simplified=1');
    const state = await page.evaluate(() => ({
        route: window.CaissaPlayRouteController.inspect(),
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        fakePanels: document.querySelectorAll('#botsPanel,#coachPanel,#playersPanel').length
    }));
    expect(state.route.listening).toBe(true);
    expect(state.boards).toBe(1);
    expect(state.fakePanels).toBe(0);
});
