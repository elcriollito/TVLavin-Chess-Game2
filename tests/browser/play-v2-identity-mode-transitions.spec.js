import { test, expect } from '@playwright/test';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';
import { positions } from '../play/fixtures/positions.js';

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const labels = { games: 'Play Game', bots: 'Play Bots', coach: 'Play Coach' };
const panels = { games: '[data-caissa-games-panel]', bots: '.caissa-bots-panel', coach: '.caissa-native-coach-panel' };
const primary = { games: '[data-games-primary]', bots: '[data-bot-primary]', coach: '[data-coach-primary]' };
const focusTarget = { games: '[data-games-setup-summary]', bots: '.caissa-bots-panel h2', coach: '.caissa-native-coach-panel h2' };

test.beforeEach(async ({ page }) => instrumentPlay(page));

async function complete(page, mode) {
    await page.goto(`/play/beta/${mode}`);
    await expect(page.locator(panels[mode])).toBeVisible();
    await page.locator(primary[mode]).click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
}

for (const [source, target] of [
    ['games', 'bots'], ['games', 'coach'], ['bots', 'games'],
    ['bots', 'coach'], ['coach', 'games'], ['coach', 'bots']
]) {
    test(`${source} PostGame transitions directly to clean ${target} setup`, async ({ page }) => {
        await complete(page, source);
        await page.getByRole('tab', { name: labels[target] }).click();
        await expect(page.locator(panels[target])).toBeVisible();
        await expect(page.locator(focusTarget[target])).toBeFocused();
        await expect(page.locator('.caissa-post-game')).toBeHidden();
        await expect(page.getByRole('tab', { name: labels[target] })).toHaveAttribute('aria-selected', 'true');
        expect(new URL(page.url()).pathname).toBe(`/play/beta/${target}`);
        const state = await page.evaluate(() => ({
            fen: window.App.game.fen(), history: window.App.game.history(), active: window.App.gameActive,
            boards: document.querySelectorAll('#chessboard .board-b72b1').length,
            clocksRunning: window.CaissaClockService.getSnapshot().running,
            workers: window.CaissaPlayV2BotWorkerReadiness?.getSnapshot?.().activeWorkerCount || 0,
            activeRequests: Object.keys(window.CaissaEngineRequestIsolation.inspect().activeRequests),
            lifecycle: window.CaissaGameLifecycle.getSnapshot().state,
            postGame: window.CaissaPostGameExperienceInstance.getSnapshot(),
            resultVisible: document.querySelector('.game-result')?.classList?.contains('show') === true,
            activeWorkers: window.__caissaPlayHarness.snapshot().workersCreated
                - window.__caissaPlayHarness.snapshot().workersTerminated
        }));
        expect(state).toMatchObject({ fen: STANDARD_FEN, history: [], active: false, boards: 1,
            clocksRunning: false, workers: 0, activeRequests: [], lifecycle: 'idle', resultVisible: false,
            activeWorkers: 0 });
        expect(state.postGame.visible).toBe(false); expect(state.postGame.gameRecordId).toBeNull();
        await expect(page.locator(primary[target])).toBeVisible();
    });
}

test('new Games identity is CAISSA through active, PostGame, PGN, Analyze, Back and Rematch', async ({ page }) => {
    await page.goto('/play/beta/games'); await page.locator('[data-games-primary]').click();
    await expect(page.locator('#playerBlackName')).toHaveText('CAISSA');
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('[data-post-game-summary]')).toContainText('CAISSA');
    const record = await page.evaluate(() => window.CaissaGameRecord.buildFromPlay());
    expect(record.opponent.name).toBe('CAISSA');
    expect(record.notation.pgn).toContain('[Black "CAISSA"]');
    expect(record.notation.pgn).not.toMatch(/CAISSA Engine/i);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    await expect(page.locator('#analyzeBlackPlayer')).toHaveText('CAISSA');
    await page.getByRole('button', { name: 'Back to game result' }).click();
    await expect(page.locator('[data-post-game-summary]')).toContainText('CAISSA');
    await page.locator('[data-post-game-action="rematch"]').click();
    await expect(page.locator('#playerBlackName')).toHaveText('CAISSA');
    await expect(page.locator('#playSection')).not.toContainText(/CAISSA Engine/i);
});

test('same-mode PostGame tab is inert and duplicate different-mode activation creates one setup', async ({ page }) => {
    await complete(page, 'games');
    const id = await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
    await page.getByRole('tab', { name: labels.games }).click();
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(id);
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await page.getByRole('tab', { name: labels.bots }).dblclick();
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    expect(await page.locator('.caissa-bots-panel').count()).toBe(1);
    expect(await page.evaluate(() => { const state = window.__caissaPlayHarness.snapshot();
        return state.workersCreated - state.workersTerminated; })).toBe(0);
});

test('keyboard transition and Back/Forward retain clean setup without stale ownership', async ({ page }) => {
    await complete(page, 'games');
    const bots = page.getByRole('tab', { name: labels.bots });
    await bots.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await page.goBack(); await expect(page.locator('[data-caissa-games-panel]')).toBeVisible();
    await page.goForward(); await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    const state = await page.evaluate(() => { const workers = window.__caissaPlayHarness.snapshot(); return {
        active: window.App.gameActive, fen: window.App.game.fen(), postGame: window.CaissaPostGameExperienceInstance.getSnapshot().visible,
        workers: workers.workersCreated - workers.workersTerminated,
        clocks: window.CaissaClockService.getSnapshot().running,
        boards: document.querySelectorAll('#chessboard .board-b72b1').length
    }; });
    expect(state).toEqual({ active: false, fen: STANDARD_FEN, postGame: false, workers: 0, clocks: false, boards: 1 });
});

test('target initialization failure remains local, recoverable and provider-neutral', async ({ page }) => {
    let failures = 0;
    await page.route('**/js/play/bots-panel.js*', route => {
        if (failures < 2) { failures += 1; return route.abort(); }
        return route.continue();
    });
    await complete(page, 'games');
    await page.evaluate(() => { window.__caissaTerminalLoadEvents = [];
        addEventListener('caissa-play-load-terminal', event => window.__caissaTerminalLoadEvents.push(event.detail)); });
    await page.getByRole('tab', { name: labels.bots }).click();
    await expect.poll(() => page.evaluate(() => ({
        shellStatus: document.querySelector('.caissa-simplified-shell__status')?.dataset?.status,
        mode: window.CaissaSimplifiedPlayShellInstance.getSnapshot().mode,
        loader: window.CaissaPlayLazyLoader.getState('bots-stack'), events: window.__caissaTerminalLoadEvents
    }))).toMatchObject({ shellStatus: 'unavailable', mode: 'bots', loader: { state: 'failed' },
        events: [{ resourceId: 'bots-stack', state: 'failed' }] });
    expect(new URL(page.url()).pathname).toBe('/play/beta/bots');
    await expect(page.locator('.caissa-post-game')).toBeHidden();
    expect(await page.evaluate(() => ({ active: window.App.gameActive,
        workers: window.CaissaPlayV2BotWorkerReadiness?.getSnapshot?.().activeWorkerCount || 0,
        external: performance.getEntriesByType('resource').map(item => item.name)
            .filter(name => new URL(name).origin !== location.origin) }))).toEqual({ active: false, workers: 0, external: [] });
    await page.getByRole('tab', { name: labels.games }).click();
    await page.getByRole('tab', { name: labels.bots }).click();
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
});
