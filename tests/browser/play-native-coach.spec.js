import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('isolated Coach is internal, compact, playable, and uses clean PostGame', async ({ page }) => {
    await page.goto('/play/beta/coach');
    await expect(page.getByRole('tab', { name: /Coach/ })).toHaveAttribute('aria-selected', 'true');
    const panel = page.locator('[data-caissa-native-coach-panel]');
    await expect(panel).toBeVisible(); await expect(panel.locator('.caissa-native-coach-panel__title')).toHaveCount(0);
    await expect(panel.getByAltText('Caissa, goddess of chess')).toBeVisible();
    await expect(panel.locator('[data-coach-narration]')).toContainText("Let's play");
    await expect(panel).not.toContainText(/Internal|locally certified|bounded assistance/i);
    await expect(panel.getByRole('combobox')).toHaveCount(0);
    await expect(panel.getByLabel('Casual')).toBeChecked();
    await expect(panel.getByLabel('Balanced')).toBeVisible();
    await expect(panel.getByLabel('Challenging')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Show All Levels ↓' })).toBeVisible();
    await expect(panel.getByLabel('Beginner')).toBeHidden();
    await panel.getByRole('button', { name: 'Show All Levels ↓' }).click();
    await expect(panel.getByLabel('Beginner')).toBeVisible();
    await expect(panel.getByLabel('Grandmaster')).toBeVisible();
    await panel.getByRole('button', { name: 'Show Fewer Levels ↑' }).click();
    await expect(panel.getByLabel('White')).toBeChecked();
    await expect(panel.getByLabel('Random')).toBeVisible();
    await expect(panel.getByLabel('Black')).toBeVisible();
    const assistance = page.locator('[data-play-assistance]');
    await expect(assistance).toBeHidden();
    await expect(panel.getByRole('button', { name: 'Play' })).toHaveCount(1);
    await expect(panel).not.toContainText(/lesson|curriculum|academy|mentor|mastery|knowledge|best move/i);
    await panel.getByRole('button', { name: 'Play' }).click();
    await expect(panel.locator('[data-coach-narration]')).toContainText('game is ready');
    const help = page.locator('[data-active-game-action="coach-hint"]');
    await expect(help).toBeVisible(); await help.click();
    await expect(page.locator('[data-active-game-status]')).toContainText(/highlighted|opponent/);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    const proof = await page.evaluate(() => ({ snapshot: window.CaissaSimplifiedPlayShellInstance.getSnapshot(),
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        educational: !!window.CaissaCoachRegistry || !!window.CaissaCoachSession }));
    expect(proof.boards).toBe(1); expect(proof.workers).toBe(1); expect(proof.educational).toBe(false);
    expect(proof.snapshot.coachPanel.assistance).toMatchObject({ moveCommits: 0, hiddenAnswers: 0, trainingMemoryWrites: 0, masteryWrites: 0 });
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Lost'); await expect(page.locator('[data-post-game-reason]')).toHaveText('By Resignation');
    await expect(page.locator('[data-post-game-summary]')).toContainText('CAISSA Coach');
    expect((await page.evaluate(() => window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.assistance)).active).toBeNull();
    await expect(page.locator('.caissa-post-game')).not.toContainText(/lesson|academy|curriculum|mastery|knowledge/i);
    const analyze = page.locator('[data-post-game-action="analyze"]');
    await expect(analyze).toBeVisible(); await analyze.click();
    await expect(page.locator('[data-caissa-coach-review-shell]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Coach Review' })).toBeVisible();
    const review = await page.evaluate(() => ({
        path: location.pathname,
        context: document.querySelector('#analyzeSection')?.dataset.caissaReviewContext,
        phase: document.querySelector('#analyzeSection')?.dataset.coachReviewPhase,
        plyOwner: window.CaissaCoachReviewPresentation.getSnapshot().activePlyOwner,
        authoritativePly: window.AnalyzeSection.currentMoveIndex,
        duplicatePly: 'reviewMoveIndex' in window || 'reviewMoveIndex' in window.CaissaCoachReviewPresentation.getSnapshot()
    }));
    expect(review).toMatchObject({ path: '/play/coach', context: 'coach', phase: 'shell',
        plyOwner: 'AnalyzeSection.currentMoveIndex', duplicatePly: false });
    expect(Number.isInteger(review.authoritativePly)).toBe(true);
});

test('Coach setup is keyboard accessible, responsive, and serious-violation free', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 }); await page.goto('/play/beta/coach');
    const panel = page.locator('[data-caissa-native-coach-panel]');
    await expect(panel.getByRole('combobox')).toHaveCount(0);
    await panel.getByLabel('Casual').check();
    await panel.getByLabel('Random').focus();
    await page.keyboard.press('Space');
    await expect(panel.getByLabel('Random')).toBeChecked();
    await panel.getByRole('button', { name: 'Show All Levels ↓' }).click();
    await expect(panel.getByLabel('Grandmaster')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 600 });
    await expect.poll(() => page.locator('.caissa-simplified-shell').getAttribute('data-layout')).toBe('constrained-height');
    const scrollState = await page.locator('.caissa-simplified-shell__context').evaluate(element => ({
        overflowY: getComputedStyle(element).overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
    }));
    expect(scrollState.overflowY).toBe('auto');
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
    await page.locator('.caissa-simplified-shell__context').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(panel.getByRole('button', { name: 'Play' })).toBeVisible();
    await panel.getByRole('button', { name: 'Show Fewer Levels ↑' }).click();
    await page.setViewportSize({ width: 320, height: 568 });
    await panel.getByRole('button', { name: 'Play' }).focus();
    expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
    const axe = await new AxeBuilder({ page }).include('[data-caissa-native-coach-panel]').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('public navigation does not advertise internal Coach', async ({ page }) => {
    await page.goto('/'); await expect(page.getByRole('link', { name: /Play Coach/ })).toHaveCount(0);
});
