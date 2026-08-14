import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, instrumentPlayAnalyticsDocument, loadPosition, playMove } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('authoritative Mentor request emits one content-free engagement with no transport or storage', async ({ page }) => {
    const requests = []; page.on('request', request => { if (['fetch', 'xhr'].includes(request.resourceType())
        && /analytics|telemetry|collect|beacon/i.test(request.url())) requests.push(request.url()); });
    await instrumentPlayAnalyticsDocument(page); await page.goto('/play/games?simplified=1'); await page.locator('[data-games-primary]').click();
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }));
    await page.locator('[data-post-game-action="mentor-review"]').click();
    await page.evaluate(() => window.CaissaPlayMentorEngagementAnalytics.observeReviewRequested({
        completionSequence: 1, source: 'postgame'
    }));
    await expect.poll(() => page.evaluate(() => window.CaissaPlayMentorEngagementAnalytics
        .inspect().diagnostics.emitted)).toBe(1);
    const result = await page.evaluate(() => {
        const events = window.CaissaPlayAnalytics.getSnapshot({ qa: true, includeEvents: true }).events
            .filter(event => event.category === 'play-mentor');
        return { events, after: { local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie },
            observer: window.CaissaPlayMentorEngagementAnalytics.inspect() };
    });
    expect(result.events.map(event => event.eventId)).toEqual(['play_mentor_review_requested']);
    expect(result.events[0].payload).toMatchObject({ engagement: 'review', stage: 'review-request',
        state: 'requested', qaEligible: true, productionEligible: false });
    expect(JSON.stringify(result.events)).not.toMatch(/(?:fen|pgn|san|uci|square|prompt|explanation|summaryText|requestId|recordId|sessionId)/i);
    expect(result.after).toEqual(before); expect(result.observer.diagnostics.emitted).toBe(1);
    expect(requests).toEqual([]);
});
