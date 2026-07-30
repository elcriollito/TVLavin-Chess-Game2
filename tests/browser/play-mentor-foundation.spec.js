import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

async function complete(page, route, startSelector) {
    await page.goto(`${route}?simplified=1`);
    await page.locator(startSelector).click();
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
}

test('transversal Mentor foundation is truthful, immutable, and separate from Play modes', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.evaluate(() => window.CaissaPlayLazyLoader.load('mentor-foundation', { qa: true }));
    const proof = await page.evaluate(() => ({
        modes: window.CaissaSimplifiedPlayShell.modes,
        capabilities: window.CaissaMentorCapabilities.snapshot,
        profiles: window.CaissaMentorRegistry.list(),
        resources: window.__playTestInstrumentation?.snapshot?.()
    }));
    expect(JSON.stringify(proof.modes)).not.toMatch(/mentor/i);
    expect(proof.profiles).toHaveLength(8);
    expect(proof.capabilities.capabilities.filter(item => item.status === 'available')
        .map(item => item.id)).toEqual(['mentor-summary']);
    expect(proof.capabilities.capabilities.find(item => item.id === 'critical-moment-review').status).toBe('disabled');
});

for (const scenario of [
    { name: 'Games', route: '/play/games', start: '[data-games-primary]', source: 'games' },
    { name: 'Bot', route: '/play/bots', start: '[data-bot-primary]', source: 'bot' },
    { name: 'Coach', route: '/play/coach', start: '[data-coach-primary]', source: 'coach' }
]) {
    test(`completed ${scenario.name} record creates one foundation-only Mentor request`, async ({ page }) => {
        await complete(page, scenario.route, scenario.start);
        await expect(page.locator('[data-post-game-action="mentor-review"]')).toBeEnabled();
        await page.locator('[data-post-game-action="mentor-review"]').click();
        await page.locator('[data-post-game-action="mentor-review"]').click();
        const proof = await page.evaluate(() => ({
            snapshot: window.CaissaPostGameExperienceInstance.getSnapshot(),
            mentor: window.CaissaMentorFoundation.getSnapshot(),
            url: location.href,
            boards: document.querySelectorAll('#chessboard').length,
            workers: window.__playTestInstrumentation?.snapshot?.().workers
        }));
        const expectedSource = scenario.source === 'games' ? 'play-game' : `${scenario.source}-game`;
        expect(proof.snapshot.mentor.request.source.type).toBe(expectedSource);
        expect(proof.snapshot.mentor.request.metadata.reviewImplemented).toBe(false);
        expect(proof.mentor.diagnostics.requests).toBe(1);
        expect(proof.mentor.diagnostics.duplicates).toBe(1);
        expect(proof.url).not.toMatch(/(?:fen|pgn|mentor-request)=/i);
        expect(proof.boards).toBe(1);
        await expect(page.locator('.caissa-post-game')).not.toContainText(
            /critical moment|strength|weakness|recommendation|move grade/i);
    });
}

test('Academy selection remains authoritative without automatic overwrite', async ({ page }) => {
    await page.goto('/?section=academy');
    const result = await page.evaluate(async () => {
        await window.CaissaPlayLazyLoader.load('mentor-foundation', { qa: true });
        window.CaissaAcademySection.selectMentor('academyMentorCapablanca');
        const academy = window.CaissaAcademySection.getMentorSelection();
        const resolved = window.CaissaMentorSelectionResolver.resolve({ academyMentorId: academy.mentorId });
        return { academy, resolved, foundation: window.CaissaMentorFoundation.getSnapshot() };
    });
    expect(result.academy.mentorId).toBe('academyMentorCapablanca');
    expect(result.resolved.source).toBe('academy');
    expect(result.resolved.mentor.id).toBe('academyMentorCapablanca');
    expect(result.foundation.status).toBe('idle');
});
