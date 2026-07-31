import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const events = page => page.evaluate(() =>
    window.CaissaPlayAnalytics.getSnapshot({ qa: true, includeEvents: true }).events);

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('mode selection analytics stay private, singular, and resource-neutral across route cycles', async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push({ url: request.url(), type: request.resourceType() }));
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    const initialStorage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
    let captured = await events(page);
    expect(captured.filter(event => event.eventId === 'play_mode_selected' && event.payload.mode === 'games')).toHaveLength(1);

    await page.getByRole('tab', { name: 'Bots' }).click();
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    captured = await events(page);
    expect(captured.filter(event => event.eventId === 'play_mode_selected' && event.payload.mode === 'bots')).toHaveLength(1);
    expect(captured.some(event => event.eventId === 'play_mode_load_started' && event.payload.mode === 'bots')).toBe(true);
    expect(captured.some(event => event.eventId === 'play_mode_load_succeeded' && event.payload.mode === 'bots')).toBe(true);

    const coach = page.getByRole('tab', { name: 'Coach' });
    await coach.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.caissa-coach-panel')).toBeVisible();
    await page.getByRole('tab', { name: 'Players', exact: true }).click();
    await expect(page.locator('[data-players-panel]')).toContainText('unavailable');
    await page.goBack(); await expect(page.getByRole('tab', { name: 'Coach' })).toHaveAttribute('aria-selected', 'true');
    await page.goForward(); await expect(page.getByRole('tab', { name: 'Players', exact: true })).toHaveAttribute('aria-selected', 'true');

    captured = await events(page);
    for (const mode of ['coach', 'players'])
        expect(captured.filter(event => event.eventId === 'play_mode_selected' && event.payload.mode === mode).length).toBeGreaterThanOrEqual(1);
    const player = captured.findLast(event => event.eventId === 'play_mode_selected' && event.payload.mode === 'players');
    expect(player.payload).toMatchObject({ qaEligible: true, productionEligible: false, accessState: 'qa-only' });
    expect(captured.some(event => event.payload.routeSource === 'browser-history')).toBe(true);
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toMatch(/(?:pgn|fen|moves|email|username|accountId|mentorContent|providerPayload|https?:|\?simplified)/i);

    const finalStorage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie,
        resources: window.__caissaPlayHarness.snapshot(), boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        humanGames: window.CaissaHumanPlayInfrastructure.getSnapshot().diagnostics.humanGamesStarted }));
    expect(finalStorage.local).toEqual(initialStorage.local); expect(finalStorage.session).toEqual(initialStorage.session);
    expect(finalStorage.cookies).toBe(initialStorage.cookies); expect(finalStorage.boards).toBe(1);
    expect(finalStorage.resources.workersCreated).toBeLessThanOrEqual(1); expect(finalStorage.humanGames).toBe(0);
    expect(requests.filter(request => ['fetch', 'xhr'].includes(request.type)
        && /analytics|telemetry/i.test(request.url))).toEqual([]);
});

test('non-QA Players is blocked and normalized without a false Players selection', async ({ page }) => {
    await page.goto('/play/players');
    await expect(page.locator('[data-caissa-simplified-shell]')).toBeHidden();
    const captured = await events(page);
    expect(captured.some(event => event.eventId === 'play_mode_selection_blocked'
        && event.payload.mode === 'players' && event.payload.accessState === 'blocked')).toBe(true);
    expect(captured.some(event => event.eventId === 'play_mode_route_normalized' && event.payload.mode === 'games')).toBe(true);
    expect(captured.some(event => event.eventId === 'play_mode_selected' && event.payload.mode === 'players')).toBe(false);
});

test('Coach lazy failure is bounded and cannot reverse the authoritative route', async ({ page }) => {
    await page.route('**/js/play/coach-panel.js*', route => route.abort());
    await page.goto('/play/games?simplified=1');
    await page.getByRole('tab', { name: 'Coach' }).click();
    await expect(page).toHaveURL(/\/play\/coach\?simplified=1/);
    await expect.poll(async () => (await events(page)).some(event =>
        event.eventId === 'play_mode_load_failed' && event.payload.mode === 'coach')).toBe(true);
    await expect(page.getByRole('tab', { name: 'Coach' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.caissa-simplified-shell__status')).toBeVisible();
});
