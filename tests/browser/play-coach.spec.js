import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

async function openCoach(page, viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto('/play/coach?simplified=1');
    await expect(page.locator('.caissa-coach-panel')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
}

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('Coach is QA-only with two differentiated safe profiles and accessible controls', async ({ page }) => {
    await page.goto('/play/coach');
    expect(new URL(page.url()).pathname).toBe('/play/games');
    await openCoach(page);
    await expect(page.locator('.caissa-coach-panel__card')).toHaveCount(2);
    await expect(page.locator('.caissa-coach-panel')).toContainText('never reveal a best move');
    await expect(page.locator('.caissa-coach-panel')).not.toContainText(/AI Coach|Mentor|principal variation/i);
    await page.getByLabel(/Tactical Awareness/).check();
    await expect(page.locator('[data-coach-detail]')).toContainText('immediate checks, captures, and threats');
    await page.locator('[data-coach-assistance]').selectOption('teaching');
    await expect(page.locator('[data-coach-status]')).toContainText('teaching assistance');
});

test('Play Coach starts once on the selected engine foundation with one board and worker', async ({ page }) => {
    await openCoach(page);
    await page.getByLabel(/Tactical Awareness/).check();
    await page.locator('[data-coach-assistance]').selectOption('guided');
    await page.locator('[data-coach-primary]').click();
    await expect(page.locator('[data-coach-goal]')).toContainText('Learning goal');
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    const proof = await page.evaluate(() => ({
        coach: window.CaissaCoachSession.getSnapshot(),
        bot: window.CaissaBotSession.getSnapshot(),
        harness: window.__caissaPlayHarness.snapshot()
    }));
    expect(proof.coach.active.coachId).toBe('caissa-tactical-awareness');
    expect(proof.coach.search).toEqual({ depth: 9 });
    expect(proof.bot.activeBotId).toBeNull();
    expect(proof.harness.boardConstructions).toBe(1);
    expect(proof.harness.workersCreated).toBe(1);
    expect(proof.harness.workerMessages).toContain('go depth 9');
});

test('bounded intervention presentation dismisses without engine request or clock pause', async ({ page }) => {
    await openCoach(page);
    await page.locator('[data-coach-primary]').click();
    const before = await page.evaluate(() => window.__caissaPlayHarness.snapshot().workerMessages.filter(message => message.startsWith('go')).length);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('caissa-coach-observation', {
        detail: { trigger: 'development-reminder', message: {
            message: 'Development check: can another minor piece join the game?', revealsMove: false, includesPv: false
        } }
    })));
    await expect(page.locator('[data-coach-intervention]')).toBeVisible();
    await expect(page.locator('[data-coach-message]')).not.toContainText(/\b[a-h][1-8]\b|best move/i);
    await page.locator('[data-coach-dismiss]').click();
    await expect(page.locator('[data-coach-intervention]')).toBeHidden();
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workerMessages.filter(message => message.startsWith('go')).length)).toBe(before);
});

test('Games and Bots clear Coach, Games restores Full Power, and layout remains bounded', async ({ page }) => {
    await openCoach(page, { width: 320, height: 568 });
    await page.locator('[data-coach-primary]').click();
    await page.getByRole('tab', { name: 'Bots' }).click();
    expect(await page.evaluate(() => window.CaissaCoachSession.getSnapshot().active)).toBeNull();
    await page.getByRole('tab', { name: 'Games' }).click();
    await page.locator('[data-games-primary]').click();
    const reset = await page.evaluate(() => ({
        coach: window.CaissaCoachSession.getSnapshot(),
        bot: window.CaissaBotSession.getSnapshot()
    }));
    expect(reset.coach.active).toBeNull();
    expect(reset.bot.fullPower).toBe(true);
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
});

test('PostGame identifies Coach, Rematch retains it with reset interventions, and Analyze remains independent', async ({ page }) => {
    await openCoach(page);
    await page.locator('[data-coach-primary]').click();
    await page.evaluate(() => {
        window.CaissaCoachSession.recordIntervention(8);
        window.confirm = () => true;
        window.resignGame();
    });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-summary]')).toContainText('CAISSA Foundations');
    await page.locator('[data-post-game-action="rematch"]').click();
    let session = await page.evaluate(() => window.CaissaCoachSession.getSnapshot().active);
    expect(session.coachId).toBe('caissa-foundations');
    expect(session.interventionCount).toBe(0);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.App.gameMode)).toBe('engine');
});
