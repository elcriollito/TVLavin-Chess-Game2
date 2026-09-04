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
    await expect(analyze).toBeVisible();
    const activation = await page.evaluate(async () => {
        const instance = window.CaissaPostGameExperienceInstance;
        const first = instance.execute('analyze');
        const second = instance.execute('analyze');
        return { first: await first, second };
    });
    expect(activation.first.ok).toBe(true);
    expect(activation.second.reasonCode).toBe('ACTION_BUSY');
    const summary = page.locator('[data-caissa-coach-review-summary]');
    await expect(summary).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
    await expect(page.locator('#analyzeStartBtn')).toBeHidden();
    await expect(page.locator('#analyzeCriticalMoments').locator('..')).toBeHidden();
    await expect(page.locator('.analyze-evidence-panel')).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Coach game review' })
        .getByText('Stockfish 16', { exact: true })).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.analysisPhase), { timeout: 30_000 }).toBe('complete');
    await expect(page.locator('[data-coach-review-comparison]')).toBeVisible();
    await expect(summary.getByText('Player', { exact: true })).toBeVisible();
    await expect(summary.getByText('Coach', { exact: true })).toBeVisible();
    const comparison = await page.evaluate(() => {
        const results = window.AnalyzeSection.analysisResults.filter(item => item && !item.unavailable);
        const side = parity => {
            const values = results.filter(item => item.moveIndex % 2 === parity);
            const counts = Object.fromEntries(['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']
                .map(label => [label, values.filter(item => item.quality === label).length]));
            counts.Best = values.filter(item => item.isBestMove === true).length;
            return { accuracy: window.CaissaAnalyzeReviewPolicy.accuracy(values).value, counts };
        };
        const rendered = [...document.querySelectorAll('[data-coach-review-classifications] [data-quality]')]
            .map(row => ({ label: row.dataset.quality,
                player: row.querySelector('[data-side="player"]').textContent,
                coach: row.querySelector('[data-side="coach"]').textContent }));
        return { white: side(0), black: side(1), rendered,
            playerAccuracy: document.querySelector('[data-coach-review-player-accuracy]').textContent,
            coachAccuracy: document.querySelector('[data-coach-review-coach-accuracy]').textContent };
    });
    expect(comparison.playerAccuracy).toBe(comparison.white.accuracy === null ? '\u2014' : `${comparison.white.accuracy}%`);
    expect(comparison.coachAccuracy).toBe(comparison.black.accuracy === null ? '\u2014' : `${comparison.black.accuracy}%`);
    for (const row of comparison.rendered) {
        expect(row.player).toBe(comparison.white.counts[row.label] ? String(comparison.white.counts[row.label]) : '\u2014');
        expect(row.coach).toBe(comparison.black.counts[row.label] ? String(comparison.black.counts[row.label]) : '\u2014');
    }
    await expect(summary).not.toContainText(/Brilliant|Great|Miss/);
    await page.evaluate(() => window.AnalyzeSection.jumpToMove(0));
    await expect(page.locator('#analyzeEvalBar')).toBeVisible();
    const review = await page.evaluate(() => ({
        path: location.pathname,
        context: document.querySelector('#analyzeSection')?.dataset.caissaReviewContext,
        phase: document.querySelector('#analyzeSection')?.dataset.coachReviewPhase,
        plyOwner: window.CaissaCoachReviewPresentation.getSnapshot().activePlyOwner,
        analysisStartRequests: window.CaissaCoachReviewPresentation.getSnapshot().analysisStartRequests,
        authoritativePly: window.AnalyzeSection.currentMoveIndex,
        duplicatePly: 'reviewMoveIndex' in window || 'reviewMoveIndex' in window.CaissaCoachReviewPresentation.getSnapshot()
    }));
    expect(review).toMatchObject({ path: '/play/coach', context: 'coach', phase: 'summary',
        plyOwner: 'AnalyzeSection.currentMoveIndex', analysisStartRequests: 1,
        authoritativePly: 0, duplicatePly: false });
    await summary.getByRole('button', { name: 'Review Game' }).click();
    await expect(page.locator('[data-coach-review-guided-placeholder]')).toBeVisible();
    await expect(page.locator('#analyzeStartBtn')).toBeHidden();
    await expect(page.locator('.analyze-evidence-panel')).toBeHidden();
    await page.getByRole('button', { name: 'Back to game result' }).click();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
});

test('Coach Review Summary is board-first, responsive, keyboard ordered, and accessible', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/play/beta/coach');
    await page.locator('[data-caissa-native-coach-panel]').getByRole('button', { name: 'Play' }).click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await page.locator('[data-post-game-action="analyze"]').click();
    const summary = page.locator('[data-caissa-coach-review-summary]');
    await expect(summary).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.analysisPhase), { timeout: 30_000 }).toBe('complete');
    for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        const geometry = await page.evaluate(() => {
            const board = document.querySelector('#analyzeChessboard').getBoundingClientRect();
            const panel = document.querySelector('[data-caissa-coach-review-summary]').getBoundingClientRect();
            const evalRail = document.querySelector('#analyzeEvalBar').getBoundingClientRect();
            const actions = [...document.querySelectorAll('[data-play-v2-analyze-close], [data-coach-review-guided-action]')]
                .filter(node => getComputedStyle(node).display !== 'none');
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                board: { left: board.left, right: board.right, top: board.top, bottom: board.bottom, width: board.width },
                panel: { left: panel.left, top: panel.top, width: panel.width },
                evalRailWidth: evalRail.width,
                touchTargets: actions.every(node => node.getBoundingClientRect().height >= 44)
            };
        });
        expect(geometry.overflow, JSON.stringify(viewport)).toBeLessThanOrEqual(1);
        expect(geometry.board.width).toBeGreaterThan(180);
        expect(geometry.evalRailWidth).toBeGreaterThan(0);
        expect(geometry.touchTargets).toBe(true);
        if (viewport.width <= 900) expect(geometry.board.bottom).toBeLessThanOrEqual(geometry.panel.top + 1);
        else expect(geometry.board.right).toBeLessThanOrEqual(geometry.panel.left + 1);
    }
    await page.setViewportSize({ width: 320, height: 568 });
    const back = page.getByRole('button', { name: 'Back to game result' });
    await back.focus();
    await page.keyboard.press('Tab');
    await expect(summary.getByRole('button', { name: 'Review Game' })).toBeFocused();
    const axe = await new AxeBuilder({ page }).include('#analyzeSection').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});

test('Games-origin Analyze retains the generic technical presentation', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Game Info' })).toBeVisible();
    await expect(page.locator('#analyzeStartBtn')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Critical Moments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Move evidence' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })
        .getByText('Stockfish 16', { exact: true })).toBeVisible();
    await expect(page.locator('[data-caissa-coach-review-summary]')).toHaveCount(0);
    expect(await page.evaluate(() => window.AnalyzeSection.analysisPhase)).toBe('idle');
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
