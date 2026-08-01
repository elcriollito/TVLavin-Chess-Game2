import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';

const educationalResource = /(?:academy|\/coach(?:\/|-panel)|mentor|guided[-_/]?replay|educational|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library))/i;

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('Coach, Mentor, Players, and educational resources are unreachable through hostile activation paths', async ({ page }) => {
    const requests = [];
    page.on('request', request => { if (educationalResource.test(new URL(request.url()).pathname)) requests.push(request.url()); });
    await page.addInitScript(() => {
        localStorage.setItem('caissa-play-mode', 'coach');
        sessionStorage.setItem('caissa-mentor-auto-launch', 'true');
        window.__CAISSA_PLAY_CONFIG__ = { mode: 'coach', mentor: true, recovery: 'academy' };
    });
    await page.goto('/play/coach?simplified=1&mentor=auto&lesson=1&fallback=academy');
    await expect.poll(() => page.evaluate(() => window.CaissaPlayRouteController.getCurrent().mode)).toBe('games');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Coach|Players/ })).toHaveCount(0);
    await page.evaluate(async () => {
        for (const id of ['coach-stack','mentor-foundation','mentor-analysis','mentor-guided-replay','mentor-knowledge','mentor-summary']) {
            try { await window.CaissaPlayLazyLoader.load(id, { qa: true, retry: true }); } catch (_) {}
        }
        history.pushState({}, '', '/play/coach?simplified=1'); window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect.poll(() => page.evaluate(() => window.CaissaPlayRouteController.getCurrent().mode)).toBe('games');
    const proof = await page.evaluate(() => ({
        contract: window.CaissaPlayV2ProductBoundary.contractId,
        groups: window.CaissaPlayLoadRegistry.definitions().map(item => item.resourceId),
        coach: !!window.CaissaCoachPanel, mentor: !!window.CaissaMentorFoundation, players: !!window.CaissaPlayersPanel,
        academyDom: document.querySelectorAll('#academySection,[data-section="academy"]').length,
        resources: [...document.scripts, ...document.styleSheets].map(item => item.src || item.href).filter(Boolean)
            .filter(source => /(?:academy|\/coach(?:\/|-panel)|mentor|guided[-_/]?replay|educational|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library))/i.test(new URL(source).pathname))
    }));
    expect(proof).toEqual({ contract: 'PlayV2ProductBoundary@1.0.0', groups: ['bots-stack','analyze-deep'],
        coach: false, mentor: false, players: false, academyDom: 0, resources: [] });
    expect(requests).toEqual([]);
});

test('clean PostGame is result-first, writes no learning state, and retains Analyze', async ({ page }) => {
    await page.goto('/play/games?simplified=1'); await page.locator('[data-games-primary]').click();
    await loadPosition(page, positions.checkmateInOne.fen); await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-result]')).toHaveText('White wins.');
    await expect(page.locator('[data-post-game-summary]')).toContainText('checkmate');
    expect(await page.locator('[data-post-game-action]').allTextContents()).toEqual([
        'Rematch','Analyze This Game','Copy PGN','Download PGN','Save Game','New Game'
    ]);
    await expect(page.locator('[data-post-game-action="mentor-review"],[data-mentor-summary],[data-post-game-concepts]')).toHaveCount(0);
    const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage },
        state: window.CaissaPostGameExperienceInstance.getSnapshot() }));
    expect(before.state).toMatchObject({ trainingMemoryWrites: 0, masteryWrites: 0 });
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    const url = new URL(page.url()); expect(url.searchParams.get('handoff')).toBeTruthy();
    expect(url.searchParams.has('pgn') || url.searchParams.has('fen')).toBe(false);
});

test('remaining mode tabs retain coherent keyboard navigation and one runtime owner', async ({ page }) => {
    await page.goto('/play/games?simplified=1'); const games = page.getByRole('tab', { name: 'Games' }); await games.focus();
    await page.keyboard.press('ArrowRight'); await expect(page).toHaveURL(/\/play\/bots\?simplified=1/);
    await expect(page.getByRole('tab', { name: 'Bots' })).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('ArrowRight'); await expect(page).toHaveURL(/\/play\/games\?simplified=1/);
    expect(await page.evaluate(() => ({ boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        lifecycle: window.CaissaEventLifecycle.inspect().activeScopes }))).toMatchObject({ boards: 1, workers: 1 });
});
