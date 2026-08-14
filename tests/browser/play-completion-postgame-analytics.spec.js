import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, instrumentPlayAnalyticsDocument, loadPosition, playMove } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));
const events = page => page.evaluate(() => window.CaissaPlayAnalytics
    .getSnapshot({ qa: true, includeEvents: true }).events.filter(event =>
        ['play-game-completion', 'play-postgame'].includes(event.category)));

test('checkmate emits one categorical completion and one PostGame shown without content or resources', async ({ page }) => {
    const requests = []; page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())
        && /analytics|telemetry|collect|beacon/i.test(request.url())) requests.push(request.url()); });
    await instrumentPlayAnalyticsDocument(page); await page.goto('/play/games?simplified=1'); await page.locator('[data-games-primary]').click();
    const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }));
    await loadPosition(page, positions.checkmateInOne.fen); await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await page.evaluate(() => {
        const record = window.CaissaGameRecord.buildFromPlay();
        const completion = window.CaissaPlayCompletionAnalytics.observeCompleted({ record });
        window.CaissaPlayPostGameAnalytics.observeShown({ ...completion.categories,
            completionSequence: completion.completionSequence, qaEligible: true, productionEligible: false });
    });
    const captured = await events(page);
    expect(captured.map(event => event.eventId)).toEqual(['play_game_completed', 'play_postgame_shown']);
    expect(captured[0].payload).toMatchObject({ completionState: 'completed', resultCategory: 'white-win',
        terminationCategory: 'checkmate', durationBucket: 'unavailable' });
    expect(captured[1].payload.completionSequence).toBe(captured[0].payload.completionSequence);
    expect(JSON.stringify(captured)).not.toMatch(/(?:1-0|resultText|exactDuration|startedAt|endedAt|move|pgn|fen|position|evaluation|mateScore|handoff|filename|clipboard|mentorContent|providerResult|https?:)/i);
    const after = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie,
        boards: document.querySelectorAll('#chessboard .board-b72b1').length, workers: window.__caissaPlayHarness.snapshot().workersCreated }));
    expect(after.local).toEqual(before.local); expect(after.session).toEqual(before.session); expect(after.cookie).toBe(before.cookie);
    expect(after.boards).toBe(1); expect(after.workers).toBeLessThanOrEqual(1); expect(requests).toEqual([]);
});

test('PostGame actions emit selection and owner-confirmed outcome while stale outcomes are ignored', async ({ page }) => {
    await instrumentPlayAnalyticsDocument(page); await page.goto('/play/games?simplified=1'); await page.locator('[data-games-primary]').click();
    await loadPosition(page, positions.checkmateInOne.fen); await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await page.locator('[data-post-game-action="download-pgn"]').click();
    await page.locator('[data-post-game-action="mentor-review"]').click();
    await page.evaluate(() => {
        for (const action of ['pgn-download', 'mentor-review']) {
            const selected = window.CaissaPlayPostGameAnalytics.observeActionSelected({
                action, completionSequence: 1, qaEligible: true, productionEligible: false
            });
            window.CaissaPlayPostGameAnalytics.observeActionSucceeded(selected);
        }
    });
    await expect.poll(async () => (await events(page)).filter(event =>
        event.eventId === 'play_postgame_action_succeeded').length).toBe(2);
    const captured = await events(page);
    for (const action of ['pgn-download', 'mentor-review']) {
        expect(captured.some(event => event.eventId === 'play_postgame_action_selected' && event.payload.action === action)).toBe(true);
        expect(captured.some(event => event.eventId === 'play_postgame_action_succeeded' && event.payload.action === action)).toBe(true);
    }
    await page.evaluate(() => window.CaissaPlayPostGameAnalytics.observeActionSucceeded({ actionSequence: 999999 }));
    expect(await page.evaluate(() => window.CaissaPlayPostGameAnalytics.inspect().diagnostics.staleOutcomesIgnored)).toBe(1);
    expect(JSON.stringify(captured)).not.toMatch(/(?:pgn\s|clipboardContent|mentorContent|knowledgeConcept|requestId|recordId)/i);
});
