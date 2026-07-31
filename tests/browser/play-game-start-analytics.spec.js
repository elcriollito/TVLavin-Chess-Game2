import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));
const events = page => page.evaluate(() => window.CaissaPlayAnalytics
    .getSnapshot({ qa: true, includeEvents: true }).events.filter(event => event.category === 'play-game-start'));

test('Games start emits one categorical request and authoritative success without side effects', async ({ page }) => {
    const analyticsRequests = [];
    page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())
        && /analytics|telemetry|collect|beacon/i.test(request.url())) analyticsRequests.push(request.url()); });
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-time="blitz-5"]').check();
    await page.getByRole('radio', { name: 'Black', exact: true }).check();
    const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }));
    await page.locator('[data-games-primary]').click();
    const captured = await events(page);
    expect(captured.map(event => event.eventId)).toEqual(['play_game_start_requested', 'play_game_start_succeeded']);
    expect(captured[0].payload).toMatchObject({ mode: 'games', startSource: 'primary-cta',
        timeControlCategory: 'blitz', colorCategory: 'black', opponentType: 'engine',
        assistanceCategory: 'engine-opponent', startState: 'requested' });
    expect(captured[1].payload.attemptSequence).toBe(captured[0].payload.attemptSequence);
    expect(JSON.stringify(captured)).not.toMatch(/(?:exactMinutes|incrementSeconds|timeControlSeconds|gameId|sessionId|workerId|opponentName|botName|coachName|moves|pgn|fen|result|evaluation|https?:|\?)/i);
    const after = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie,
        state: window.CaissaGameLifecycle.getSnapshot()?.state, boards: document.querySelectorAll('#chessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated }));
    expect(after.local).toEqual(before.local); expect(after.session).toEqual(before.session); expect(after.cookie).toBe(before.cookie);
    expect(after.state).toBe('active'); expect(after.boards).toBe(1); expect(after.workers).toBeLessThanOrEqual(1);
    expect(analyticsRequests).toEqual([]);
});

test('blocked/provider fixtures and stale outcomes cannot claim proprietary human success', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.evaluate(() => {
        const A = window.CaissaPlayGameStartAnalytics;
        A.observeBlocked({ mode: 'players', startSource: 'primary-cta', opponentType: 'human-unavailable',
            assistanceCategory: 'blocked', productionEligible: false, failureReason: 'production-blocked' });
        const provider = A.observeRequest({ mode: 'players', startSource: 'provider-entry',
            timeControlCategory: 'provider-owned', colorCategory: 'provider-assigned', opponentType: 'human-provider',
            assistanceCategory: 'provider-owned', qaEligible: true, productionEligible: false, actionKey: 'provider-fixture' });
        A.observeFailure({ attemptSequence: provider.attemptSequence, failureReason: 'provider-unavailable' });
        A.observeSuccess({ attemptSequence: provider.attemptSequence, ready: true });
    });
    const captured = await events(page);
    expect(captured.some(event => event.eventId === 'play_game_start_blocked'
        && event.payload.failureReason === 'production-blocked')).toBe(true);
    expect(captured.some(event => event.payload.timeControlCategory === 'provider-owned'
        && event.payload.colorCategory === 'provider-assigned')).toBe(true);
    expect(captured.some(event => event.eventId === 'play_game_start_succeeded' && event.payload.mode === 'players')).toBe(false);
    const diagnostics = await page.evaluate(() => window.CaissaPlayGameStartAnalytics.inspect().diagnostics);
    expect(diagnostics.staleOutcomesIgnored).toBe(1);
});
