import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';

const prohibitedResource = /(?:academy|js\/play\/coach\/|mentor-(?:foundation|analysis|guided-replay|knowledge|summary)|guided[-_/]?replay|educational|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library)|fics|players-stack)/i;

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('native Coach is admitted while legacy Coach, Players, FICS, and educational resources remain prohibited', async ({ page }) => {
    const requests = [];
    page.on('request', request => {
        const path = new URL(request.url()).pathname;
        if (!/play-v2-fics-isolation\.js/i.test(path) && prohibitedResource.test(path)) requests.push(request.url());
    });
    await page.addInitScript(() => {
        localStorage.setItem('caissa-play-mode', 'coach');
        sessionStorage.setItem('caissa-mentor-auto-launch', 'true');
        window.__CAISSA_PLAY_CONFIG__ = { mode: 'coach', mentor: true, recovery: 'academy' };
    });
    await page.goto('/play/beta/coach?mentor=auto&lesson=1&fallback=academy');
    await expect.poll(() => page.evaluate(() => window.CaissaPlayRouteController.getCurrent().mode)).toBe('coach');
    await expect(page.locator('[data-caissa-native-coach-panel]')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Play Coach' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Players/ })).toHaveCount(0);
    await page.evaluate(async () => {
        for (const id of ['coach-stack','mentor-foundation','mentor-analysis','mentor-guided-replay','mentor-knowledge','mentor-summary']) {
            try { await window.CaissaPlayLazyLoader.load(id, { qa: true, retry: true }); } catch (_) {}
        }
        history.pushState({}, '', '/play/beta/coach'); window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect.poll(() => page.evaluate(() => window.CaissaPlayRouteController.getCurrent().mode)).toBe('coach');
    const proof = await page.evaluate(() => ({
        contract: window.CaissaPlayV2ProductBoundary.contractId,
        groups: window.CaissaPlayLoadRegistry.definitions().map(item => item.resourceId),
        coachBoundary: window.CaissaPlayV2CoachBoundary?.contractId,
        assistancePolicy: window.CaissaPlayV2CoachAssistancePolicy?.contractId,
        nativeCoach: !!window.CaissaNativeCoachPanel, legacyCoach: !!window.CaissaCoachPanel,
        legacyMentor: !!window.CaissaMentorFoundation, players: !!window.CaissaPlayersPanel,
        academyDom: document.querySelectorAll('#academySection,[data-section="academy"]').length,
        resources: [...document.scripts, ...document.styleSheets].map(item => item.src || item.href).filter(Boolean)
            .filter(source => {
                const path = new URL(source).pathname;
                return !/play-v2-fics-isolation\.js/i.test(path)
                    && /(?:academy|js\/play\/coach\/|mentor-(?:foundation|analysis|guided-replay|knowledge|summary)|guided[-_/]?replay|educational|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library)|fics|players-stack)/i.test(path);
            })
    }));
    expect(proof).toEqual({ contract: 'PlayV2ProductBoundary@1.0.0',
        groups: ['bots-stack','native-coach-stack','native-mentor-review','analyze-deep'],
        coachBoundary: 'PlayV2CoachBoundary@1.0.0', assistancePolicy: 'PlayV2CoachAssistancePolicy@1.0.0',
        nativeCoach: true, legacyCoach: false, legacyMentor: false, players: false, academyDom: 0, resources: [] });
    expect(requests).toEqual([]);
});

test('clean PostGame is result-first, writes no learning state, and retains Analyze', async ({ page }) => {
    await page.goto('/play/beta'); await page.locator('[data-games-primary]').click();
    await loadPosition(page, positions.checkmateInOne.fen); await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Won');
    await expect(page.locator('[data-post-game-reason]')).toHaveText('By Checkmate');
    expect(await page.locator('[data-post-game-action]').allTextContents()).toEqual([
        'Analyze This Game','Rematch','New Game','Review with Mentor','Copy PGN','Download PGN','Save PGN Locally'
    ]);
    await expect(page.locator('[data-post-game-action="analyze"]')).toHaveClass(/--primary/);
    await expect(page.locator('[data-post-game-action="rematch"],[data-post-game-action="new-game"]')).toHaveCount(2);
    await expect(page.locator('[data-post-game-action="mentor-review"]')).toBeVisible();
    await expect(page.locator('[data-mentor-summary],[data-post-game-concepts]')).toHaveCount(0);
    const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage },
        state: window.CaissaPostGameExperienceInstance.getSnapshot(), policy: window.CaissaPlayV2PostGamePolicy }));
    expect(before.state).toMatchObject({ trainingMemoryWrites: 0, masteryWrites: 0 });
    expect(before.policy).toMatchObject({ contractId: 'PlayV2PostGamePolicy@1.1.0', primaryAction: 'analyze',
        analyticsTransport: 'disabled', automaticAnalyze: 'prohibited', automaticMentor: 'prohibited' });
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    const url = new URL(page.url());
    expect(url.searchParams.has('handoff') || url.searchParams.has('pgn') || url.searchParams.has('fen')).toBe(false);
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().diagnostics.handoffs)).toBe(1);
});

test('remaining mode tabs retain coherent keyboard navigation and one runtime owner', async ({ page }) => {
    await page.goto('/play/beta'); const games = page.getByRole('tab', { name: 'Play Game' }); await games.focus();
    await page.keyboard.press('ArrowRight'); await expect(page).toHaveURL(/\/play\/beta\/bots/);
    await expect(page.getByRole('tab', { name: 'Play Bots' })).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('ArrowRight'); await expect(page).toHaveURL(/\/play\/beta\/coach/);
    await expect(page.getByRole('tab', { name: 'Play Coach' })).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('ArrowRight'); await expect(page).toHaveURL(/\/play\/beta(?:\/games)?$/);
    expect(await page.evaluate(() => ({ boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        lifecycle: window.CaissaEventLifecycle.inspect().activeScopes }))).toMatchObject({ boards: 1, workers: 0 });
});
