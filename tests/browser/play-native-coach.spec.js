import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';
import { positions } from '../play/fixtures/positions.js';

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
    await page.evaluate(() => { window.App.coachMoveAnnotations = [
        { key: 'good' }, { key: 'good' }, { key: 'book' }, { key: 'blunder' }
    ]; });
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-result]')).toHaveText('Coach Won'); await expect(page.locator('[data-post-game-reason]')).toHaveText('By Resignation');
    await expect(page.locator('.caissa-post-game').getByAltText('Caissa, goddess of chess')).toBeVisible();
    await expect(page.locator('[data-coach-game-over-message]')).toContainText('review');
    await expect(page.locator('[data-coach-game-over-qualities]')).toContainText(/Blunder\s*1/);
    await expect(page.locator('[data-coach-game-over-qualities]')).toContainText(/Good\s*2/);
    await expect(page.locator('[data-coach-game-over-qualities]')).toContainText(/Book\s*1/);
    await expect(page.locator('.caissa-post-game [data-post-game-action]:visible')).toHaveText(['Review Game', 'New Game']);
    await expect(page.locator('[data-post-game-summary]')).toContainText('CAISSA Coach');
    expect((await page.evaluate(() => window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.assistance)).active).toBeNull();
    await expect(page.locator('.caissa-post-game')).not.toContainText(/lesson|academy|curriculum|mastery|knowledge|Stockfish|nodes|NPS|depth|threads/i);
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

test('Coach game-over preserves player wins, draws, timeouts, and the existing New Game reset', async ({ page }) => {
    await page.goto('/play/beta/coach');
    const panel = page.locator('[data-caissa-native-coach-panel]');
    await panel.getByRole('button', { name: 'Play' }).click();
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Won');
    await expect(page.locator('[data-post-game-reason]')).toHaveText('By Checkmate');
    await page.locator('[data-post-game-action="new-game"]').click();
    await expect(panel).toBeVisible();
    await expect(page.locator('.caissa-post-game')).toBeHidden();

    await panel.getByRole('button', { name: 'Play' }).click();
    await loadPosition(page, positions.stalemate);
    await page.evaluate(() => window.handleGameOver());
    await expect(page.locator('[data-post-game-result]')).toHaveText('Draw');
    await expect(page.locator('[data-post-game-reason]')).toHaveText('By Stalemate');
    await page.locator('[data-post-game-action="new-game"]').click();

    await panel.getByRole('button', { name: 'Play' }).click();
    await page.evaluate(() => { window.App.gameActive = false;
        window.setGameStatus('Timeout', '0-1', 'Black wins on time.'); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-result]')).toHaveText('Coach Won');
    await expect(page.locator('[data-post-game-reason]')).toHaveText('On Time');
    await expect(page).toHaveURL(/\/play\/coach$/);
});

test('Coach game-over is compact, responsive, accessible, and keyboard ordered', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/play/beta/coach');
    await page.locator('[data-caissa-native-coach-panel]').getByRole('button', { name: 'Play' }).click();
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    const card = page.locator('.caissa-coach-game-over-context');
    await expect(card).toBeVisible();
    for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        const geometry = await page.evaluate(() => {
            const region = document.querySelector('.caissa-coach-game-over-context');
            const board = document.querySelector('#chessboard');
            const actions = [...region.querySelectorAll('[data-post-game-action]:not([hidden])')];
            region.scrollIntoView({ block: 'center' });
            const box = region.getBoundingClientRect();
            return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                cardWidth: box.width, cardHeight: box.height, boardWidth: board.getBoundingClientRect().width,
                touchTargets: actions.every(action => action.getBoundingClientRect().height >= 44) };
        });
        expect(geometry.overflow, JSON.stringify(viewport)).toBeLessThanOrEqual(1);
        expect(geometry.cardWidth).toBeLessThanOrEqual(432);
        expect(geometry.cardHeight).toBeLessThan(520);
        expect(geometry.boardWidth).toBeGreaterThan(180);
        expect(geometry.touchTargets).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('[data-post-game-result]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-post-game-action="new-game"]')).toBeFocused();
    const axe = await new AxeBuilder({ page }).include('[data-play-v2-post-game-core]').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
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
