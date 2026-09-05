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
    await panel.evaluate(node => { node.dataset.qaPersistentIdentity = 'coach-shell-one'; });
    const verifyPermanentShell = async expectedPhase => {
        const proof = await page.evaluate(() => {
            const shell = document.querySelector('[data-caissa-coach-shell]');
            const persistent = shell?.querySelector('[data-caissa-coach-persistent]')?.getBoundingClientRect();
            const phase = shell?.querySelector('[data-caissa-coach-phase-host]')?.getBoundingClientRect();
            const foot = shell?.querySelector('[data-caissa-coach-foot]')?.getBoundingClientRect();
            const tabs = document.querySelector('.caissa-simplified-shell__modes')?.getBoundingClientRect();
            const regions = [...(shell?.children || [])].filter(node => node.matches(
                '[data-caissa-coach-head], [data-caissa-coach-body], [data-caissa-coach-foot]'));
            return { identity: shell?.dataset.qaPersistentIdentity, phaseName: shell?.dataset.coachShellPhase,
                regionCount: regions.length,
                regionOrder: regions.map(node => node.hasAttribute('data-caissa-coach-head') ? 'head'
                    : node.hasAttribute('data-caissa-coach-body') ? 'body' : 'foot'),
                footPhase: shell?.querySelector('[data-caissa-coach-foot-content]:not([hidden])')
                    ?.getAttribute('data-caissa-coach-foot-content'),
                avatarCount: document.querySelectorAll('img[src*="caissa-coach-goddess.png"]:not([hidden])').length,
                tabGap: persistent && tabs ? persistent.top - tabs.bottom : null,
                phaseGap: persistent && phase ? phase.top - persistent.bottom : null,
                footAfterBody: phase && foot ? foot.top >= phase.top : false };
        });
        expect(proof.identity).toBe('coach-shell-one');
        expect(proof.phaseName).toBe(expectedPhase);
        expect(proof.avatarCount).toBe(1);
        expect(proof.regionCount).toBe(3);
        expect(proof.regionOrder).toEqual(['head', 'body', 'foot']);
        expect(proof.footPhase).toBe(expectedPhase);
        expect(proof.footAfterBody).toBe(true);
        expect(proof.tabGap).toBeGreaterThanOrEqual(0);
        expect(proof.tabGap).toBeLessThanOrEqual(24);
        expect(proof.phaseGap).toBeGreaterThanOrEqual(0);
        expect(proof.phaseGap).toBeLessThanOrEqual(20);
    };
    await verifyPermanentShell('setup');
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
    await expect(panel.locator('[data-caissa-coach-foot]')).toContainText('Play');
    await expect(panel.locator('[data-caissa-coach-body]')).not.toContainText(/^Play$/);
    await expect(panel).not.toContainText(/lesson|curriculum|academy|mentor|mastery|knowledge|best move/i);
    await panel.getByRole('button', { name: 'Play' }).click();
    await expect(panel.locator('[data-coach-narration]')).toContainText('game is ready');
    await verifyPermanentShell('active-game');
    await expect(panel.locator('[data-caissa-coach-foot] [data-active-game-action="coach-hint"]')).toBeVisible();
    await expect(panel.locator('[data-caissa-coach-body] [data-active-game-action]')).toHaveCount(0);
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
    await verifyPermanentShell('game-over');
    await expect(page.locator('[data-post-game-result]')).toHaveText('Coach Won'); await expect(page.locator('[data-post-game-reason]')).toHaveText('By Resignation');
    const coachShell = page.locator('[data-caissa-coach-shell]');
    await expect(coachShell.getByAltText('Caissa, goddess of chess')).toBeVisible();
    await expect(coachShell.locator('[data-coach-narration]')).toContainText('review');
    await expect(page.getByAltText('Caissa, goddess of chess')).toHaveCount(1);
    await expect(page.locator('[data-coach-game-over-qualities]')).toContainText(/Blunder\s*1/);
    await expect(page.locator('[data-coach-game-over-qualities]')).toContainText(/Good\s*2/);
    await expect(page.locator('[data-coach-game-over-qualities]')).toContainText(/Book\s*1/);
    await expect(page.locator('[data-caissa-coach-game-over-foot] [data-post-game-action]:visible')).toHaveText(['Review Game', 'New Game']);
    await expect(page.locator('[data-caissa-coach-body] [data-post-game-action]')).toHaveCount(0);
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
    await verifyPermanentShell('review-summary');
    await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
    await expect(page.locator('#analyzeStartBtn')).toBeHidden();
    await expect(page.locator('#analyzeCriticalMoments').locator('..')).toBeHidden();
    await expect(page.locator('.analyze-evidence-panel')).toBeHidden();
    await expect(page.locator('#analyzeSection')).toBeHidden();
    await expect(page.locator('#playSection')).toBeVisible();
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
    await expect(page.locator('.analyze-board-navigation .nav-btn-sm:visible')).toHaveCount(0);
    await expect(page.locator('[data-caissa-coach-review-foot] [data-coach-review-guided-action]')).toHaveText('Start Review');
    await expect(summary.locator('[data-coach-review-guided-action]')).toHaveCount(0);
    await page.evaluate(() => window.AnalyzeSection.jumpToMove(0));
    await expect(page.locator('#analyzeEvalBar')).toBeHidden();
    await expect(page.locator('#evalBar')).toBeVisible();
    const review = await page.evaluate(() => ({
        path: location.pathname,
        context: document.querySelector('[data-caissa-coach-review-summary]')?.dataset.caissaReviewContext,
        phase: document.querySelector('[data-caissa-coach-review-summary]')?.dataset.coachReviewPhase,
        plyOwner: window.CaissaCoachReviewPresentation.getSnapshot().activePlyOwner,
        analysisStartRequests: window.CaissaCoachReviewPresentation.getSnapshot().analysisStartRequests,
        authoritativePly: window.AnalyzeSection.currentMoveIndex,
        duplicatePly: 'reviewMoveIndex' in window || 'reviewMoveIndex' in window.CaissaCoachReviewPresentation.getSnapshot(),
        playInert: document.querySelector('#playSection').inert,
        analyzeTakeover: document.querySelector('#analyzeSection').classList.contains('active')
            || document.body.classList.contains('caissa-play-v2-analyze-open'),
        visibleBoards: [...document.querySelectorAll('.board-b72b1')]
            .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').length,
        belowBoardChrome: [...document.querySelectorAll('.caissa-simplified-shell__player--current, .caissa-simplified-shell__board-actions')]
            .filter(node => node.getClientRects().length).length
    }));
    expect(review).toMatchObject({ path: '/play/coach', context: 'coach', phase: 'summary',
        plyOwner: 'AnalyzeSection.currentMoveIndex', analysisStartRequests: 1,
        authoritativePly: 0, duplicatePly: false, playInert: false, analyzeTakeover: false,
        visibleBoards: 1, belowBoardChrome: 0 });
    const original = await page.evaluate(() => ({
        pgn: window.AnalyzeSection.loadedGame.pgn,
        moves: window.App.moveHistory.map(move => ({ ...move })),
        reviewResults: JSON.stringify(window.AnalyzeSection.analysisResults)
    }));
    await page.getByRole('button', { name: 'Start Review' }).click();
    await expect(page.locator('[data-caissa-coach-guided-review]')).toBeVisible();
    await verifyPermanentShell('guided-review');
    await expect(page.locator('[data-caissa-coach-head]')).toContainText(/BOOK|BEST|ACCEPTABLE|INACCURACY|MISTAKE|BLUNDER/);
    await expect(page.locator('[data-caissa-coach-body] [data-coach-guided-explain]')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-body] [data-coach-guided-next]')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-body] #analyzeMoveList')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeNavFirst')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeNavPrev')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeNavNext')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeNavLast')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeFlipBoard')).toBeVisible();
    await expect(page.locator('[data-coach-guided-navigation] #analyzeFlipBoard')).toHaveCount(0);
    await expect(page.locator('[data-coach-guided-flip]')).toHaveAttribute('aria-label', 'Flip board');
    await expect(page.locator('[data-coach-guided-flip]')).toContainText('Flip board');
    await expect(page.locator('[data-caissa-coach-foot] [data-coach-guided-analysis]')).toBeVisible();
    await expect(page.locator('.caissa-simplified-shell__board-stage .analyze-board-navigation')).toHaveCount(0);
    await page.locator('[data-coach-guided-explain]').click();
    await expect(page.locator('[data-coach-guided-detail]')).toBeVisible();
    await page.locator('[data-coach-guided-next]').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(0);
    await expect(page.locator('[data-coach-guided-next]')).toContainText('Review Complete');
    await expect(page.locator('[data-coach-guided-new-game]')).toBeVisible();
    await page.locator('#analyzeNavFirst').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(-1);
    await page.locator('#analyzeNavNext').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(0);
    await expect(page.locator('[data-coach-guided-notation] [data-index="0"]')).toHaveClass(/active/);
    await expect(page.locator('[data-caissa-coach-guided-review]')).toHaveAttribute('data-authoritative-ply', '0');
    await page.locator('#analyzeNavLast').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(1);
    await page.locator('#analyzeNavPrev').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(0);
    const orientation = await page.locator('#playSection #chessboard').evaluate(node => node.innerHTML);
    await page.locator('#analyzeFlipBoard').click();
    await expect.poll(() => page.locator('#playSection #chessboard').evaluate(node => node.innerHTML)).not.toBe(orientation);

    const entryPly = await page.evaluate(() => window.AnalyzeSection.currentMoveIndex);
    await page.locator('[data-coach-guided-analysis]').click();
    await expect(page.locator('[data-coach-analysis-exploration]')).toBeVisible();
    await expect(page.locator('[data-coach-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.handlePlayBoardSquareSelection('g8'));
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().legalTargets.length)).toBeGreaterThan(0);
    expect(await playMove(page, 'g8', 'f6')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot().temporaryPlyCount)).toBe(1);
    await page.locator('[data-coach-exploration-engine]').click();
    await expect(page.locator('[data-coach-exploration-engine]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-coach-exploration-status]')).toContainText('Engine is off');
    await page.locator('[data-coach-exploration-engine]').click();
    await expect(page.locator('[data-coach-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');
    const during = await page.evaluate(() => ({
        pgn: window.AnalyzeSection.loadedGame.pgn,
        moves: window.App.moveHistory.map(move => ({ ...move })),
        reviewResults: JSON.stringify(window.AnalyzeSection.analysisResults),
        reviewPly: window.AnalyzeSection.currentMoveIndex
    }));
    expect(during).toEqual({ ...original, reviewPly: entryPly });
    await page.locator('[data-coach-exploration-back]').click();
    await expect(page.locator('[data-coach-guided-view]')).toBeVisible();
    expect(await page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(entryPly);
    expect(await page.evaluate(() => window.CaissaCoachReviewExploration.isActive())).toBe(false);
    await expect.poll(() => page.evaluate(() => window.App.boardAdapter.getSnapshot().lastMove)).toEqual({ from: 'e2', to: 'e4' });
    await expect(page.locator('#analyzeStartBtn')).toBeHidden();
    await expect(page.locator('.analyze-evidence-panel')).toBeHidden();
    await page.locator('[data-coach-guided-new-game]').click();
    await expect(page.locator('[data-caissa-coach-guided-review]')).toHaveCount(0);
    await expect(page.locator('.caissa-post-game')).toBeHidden();
    await expect(panel).toBeVisible();
    await verifyPermanentShell('setup');
});

test('Coach Review Summary remains inside Play, is responsive, keyboard ordered, and accessible', async ({ page }) => {
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
    for (const viewport of [{ width: 320, height: 568 }, { width: 1600, height: 1000 }]) {
        await page.setViewportSize(viewport);
        if (viewport.width > 900) {
            await expect.poll(() => page.locator('#playSection #chessboard').evaluate(node => node.getBoundingClientRect().width))
                .toBeGreaterThan(500);
        }
        const geometry = await page.evaluate(() => {
            const board = document.querySelector('#playSection #chessboard').getBoundingClientRect();
            const panel = document.querySelector('[data-caissa-coach-shell]').getBoundingClientRect();
            const evalRail = document.querySelector('#playSection #evalBar').getBoundingClientRect();
            const persistentNode = document.querySelector('[data-caissa-coach-persistent]');
            const phaseNode = document.querySelector('[data-caissa-coach-phase-host]');
            const contextNode = document.querySelector('.caissa-simplified-shell__context');
            const persistentTop = persistentNode.getBoundingClientRect().top;
            phaseNode.scrollTop = Math.min(32, Math.max(0, phaseNode.scrollHeight - phaseNode.clientHeight));
            const actions = [...document.querySelectorAll('[data-play-v2-analyze-close], [data-coach-review-guided-action]')]
                .filter(node => getComputedStyle(node).display !== 'none');
            const rows = [...document.querySelectorAll('[data-coach-review-classifications] [data-quality]')]
                .filter(node => getComputedStyle(node).display !== 'none');
            const action = document.querySelector('[data-coach-review-guided-action]')?.getBoundingClientRect();
            const finalRow = rows.at(-1)?.getBoundingClientRect();
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                board: { left: board.left, right: board.right, top: board.top, bottom: board.bottom, width: board.width },
                panel: { left: panel.left, top: panel.top, bottom: panel.bottom, width: panel.width, height: panel.height },
                evalRailWidth: evalRail.width,
                touchTargets: actions.every(node => node.getBoundingClientRect().height >= 44),
                persistentStable: Math.abs(persistentNode.getBoundingClientRect().top - persistentTop) <= 1,
                phaseOverflow: getComputedStyle(phaseNode).overflowY,
                contextOverflow: getComputedStyle(contextNode).overflowY,
                actionGap: action && finalRow ? action.top - finalRow.bottom : null,
                footBottomGap: panel.bottom - document.querySelector('[data-caissa-coach-foot]').getBoundingClientRect().bottom,
                phaseScrollable: phaseNode.scrollHeight > phaseNode.clientHeight + 1,
                playVisible: document.querySelector('#playSection').getClientRects().length > 0,
                playInert: document.querySelector('#playSection').inert,
                analyzeHidden: document.querySelector('#analyzeSection').getClientRects().length === 0,
                analyzeTakeover: document.querySelector('#analyzeSection').classList.contains('active')
                    || document.body.classList.contains('caissa-play-v2-analyze-open'),
                tabsVisible: document.querySelector('.caissa-simplified-shell__modes').getClientRects().length > 0,
                sidebarVisible: document.querySelector('#mainNav').getClientRects().length > 0,
                summaryInsidePhase: phaseNode.contains(document.querySelector('[data-caissa-coach-review-summary]')),
                navigationInsideSummary: document.querySelector('[data-caissa-coach-review-summary]')
                    .contains(document.querySelector('.analyze-board-navigation')),
                reviewActionInFoot: document.querySelector('[data-caissa-coach-foot]')
                    .contains(document.querySelector('[data-coach-review-guided-action]')),
                visibleBoards: [...document.querySelectorAll('.board-b72b1')]
                    .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').length,
                boardChrome: [...document.querySelectorAll('.caissa-simplified-shell__board-stage > :not(.caissa-simplified-shell__board-region):not(.caissa-simplified-shell__sr-heading)')]
                    .filter(node => node.getClientRects().length).length
            };
        });
        expect(geometry.overflow, JSON.stringify(viewport)).toBeLessThanOrEqual(1);
        expect(geometry.board.width).toBeGreaterThan(180);
        expect(geometry.evalRailWidth).toBeGreaterThan(0);
        expect(geometry.touchTargets).toBe(true);
        expect(geometry.persistentStable).toBe(true);
        expect(geometry.playVisible).toBe(true);
        expect(geometry.playInert).toBe(false);
        expect(geometry.analyzeHidden).toBe(true);
        expect(geometry.analyzeTakeover).toBe(false);
        expect(geometry.tabsVisible).toBe(true);
        expect(geometry.summaryInsidePhase).toBe(true);
        expect(geometry.navigationInsideSummary).toBe(false);
        expect(geometry.reviewActionInFoot).toBe(true);
        expect(geometry.visibleBoards).toBe(1);
        expect(geometry.boardChrome).toBe(0);
        if (viewport.width <= 900) {
            expect(geometry.board.bottom).toBeLessThanOrEqual(geometry.panel.top + 1);
            expect(geometry.panel.width).toBeGreaterThanOrEqual(viewport.width - 50);
        } else {
            expect(geometry.sidebarVisible).toBe(true);
            expect(geometry.phaseOverflow).toBe('auto');
            expect(geometry.contextOverflow).toBe('hidden');
            expect(geometry.board.right).toBeLessThanOrEqual(geometry.panel.left + 1);
            expect(geometry.panel.width).toBeGreaterThanOrEqual(340);
            expect(geometry.footBottomGap).toBeLessThanOrEqual(2);
            const reviewShare = geometry.panel.width / (geometry.board.width + geometry.evalRailWidth + geometry.panel.width);
            expect(reviewShare).toBeGreaterThanOrEqual(.32);
            expect(reviewShare).toBeLessThanOrEqual(.40);
        }
    }
    await page.setViewportSize({ width: 320, height: 568 });
    const back = page.getByRole('button', { name: 'Back to game result' });
    await back.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Start Review' })).toBeFocused();
    const axe = await new AxeBuilder({ page }).include('#playSection').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await page.getByRole('button', { name: 'Start Review' }).click();
    for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        await expect.poll(() => page.locator('.caissa-simplified-shell').getAttribute('data-layout'))
            .toBe(viewport.width <= 900 ? 'phone-compact' : 'desktop-split');
        const guidedGeometry = await page.evaluate(() => {
            const board = document.querySelector('#playSection #chessboard').getBoundingClientRect();
            const shell = document.querySelector('[data-caissa-coach-shell]').getBoundingClientRect();
            const head = document.querySelector('[data-caissa-coach-head]').getBoundingClientRect();
            const body = document.querySelector('[data-caissa-coach-body]').getBoundingClientRect();
            const foot = document.querySelector('[data-caissa-coach-foot]').getBoundingClientRect();
            const controls = [...document.querySelectorAll('[data-caissa-coach-guided-review] button, [data-caissa-coach-guided-foot] button')]
                .filter(node => node.getClientRects().length && !node.disabled);
            const navigation = [...document.querySelectorAll('[data-coach-guided-navigation] .nav-btn-sm')]
                .filter(node => node.getClientRects().length);
            const navHost = document.querySelector('[data-coach-guided-navigation]').getBoundingClientRect();
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                boardBottom: board.bottom, boardRight: board.right, shellTop: shell.top, shellLeft: shell.left,
                regionOrder: head.top <= body.top && body.top <= foot.top,
                touchTargets: controls.every(node => node.getBoundingClientRect().height >= 44),
                navigationCount: navigation.length,
                navigationFill: navigation.reduce((sum, node) => sum + node.getBoundingClientRect().width, 0) / navHost.width,
                visibleBoards: [...document.querySelectorAll('.board-b72b1')]
                    .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').length
            };
        });
        expect(guidedGeometry.overflow, JSON.stringify(viewport)).toBeLessThanOrEqual(1);
        expect(guidedGeometry.regionOrder).toBe(true);
        expect(guidedGeometry.touchTargets).toBe(true);
        expect(guidedGeometry.navigationCount).toBe(4);
        expect(guidedGeometry.navigationFill).toBeGreaterThan(.82);
        expect(guidedGeometry.visibleBoards).toBe(1);
        if (viewport.width <= 900) expect(guidedGeometry.boardBottom).toBeLessThanOrEqual(guidedGeometry.shellTop + 1);
        else expect(guidedGeometry.boardRight).toBeLessThanOrEqual(guidedGeometry.shellLeft + 1);
    }
    await page.setViewportSize({ width: 320, height: 568 });
    const guidedAxe = await new AxeBuilder({ page }).include('[data-caissa-coach-shell]').analyze();
    expect(guidedAxe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
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
        await expect.poll(() => page.locator('.caissa-simplified-shell').getAttribute('data-layout'))
            .toBe(viewport.width <= 900 ? 'phone-compact' : 'desktop-split');
        const geometry = await page.evaluate(() => {
            const region = document.querySelector('.caissa-coach-game-over-context');
            const board = document.querySelector('#chessboard');
            const actions = [...document.querySelectorAll('[data-caissa-coach-game-over-foot] [data-post-game-action]:not([hidden])')];
            region.scrollIntoView({ block: 'center' });
            const box = region.getBoundingClientRect();
            return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                cardWidth: box.width, cardHeight: box.height, boardWidth: board.getBoundingClientRect().width,
                touchTargets: actions.every(action => action.getBoundingClientRect().height >= 44) };
        });
        expect(geometry.overflow, JSON.stringify(viewport)).toBeLessThanOrEqual(1);
        expect(geometry.cardWidth).toBeLessThanOrEqual(432);
        expect(geometry.cardHeight).toBeLessThanOrEqual(760);
        expect(geometry.boardWidth).toBeGreaterThan(180);
        expect(geometry.touchTargets).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('[data-post-game-result]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-post-game-action="new-game"]')).toBeFocused();
    const axe = await new AxeBuilder({ page }).include('[data-caissa-coach-shell]').analyze();
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
    const scrollState = await page.locator('[data-caissa-coach-phase-host]').evaluate(element => ({
        overflowY: getComputedStyle(element).overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
    }));
    expect(scrollState.overflowY).toBe('auto');
    expect(scrollState.scrollHeight).toBeGreaterThanOrEqual(scrollState.clientHeight);
    await page.locator('[data-caissa-coach-phase-host]').evaluate(element => { element.scrollTop = element.scrollHeight; });
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
