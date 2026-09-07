import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';
import { positions } from '../play/fixtures/positions.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('isolated Coach is internal, compact, playable, and uses clean PostGame', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
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
    const liveRailSequence = await page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot().renderSequence);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    await expect.poll(() => page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot().renderSequence))
        .toBeGreaterThan(liveRailSequence);
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
    await expect(page.locator('[data-caissa-coach-body] [data-post-game-action]:visible')).toHaveText(['Review Game']);
    await expect(page.locator('[data-caissa-coach-game-over-foot] > [data-post-game-action]:visible')).toHaveText(['New Game']);
    await expect(page.locator('[data-caissa-coach-game-over-foot] > [data-coach-game-over-menu] > summary')).toContainText('Menu');
    await expect(page.locator('[data-post-game-summary]')).toContainText('CAISSA Coach');
    expect((await page.evaluate(() => window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.assistance)).active).toBeNull();
    await expect(page.locator('.caissa-post-game')).not.toContainText(/lesson|academy|curriculum|mastery|knowledge|Stockfish|nodes|NPS|depth|threads/i);
    const analyze = page.locator('[data-post-game-action="analyze"]');
    await expect(analyze).toBeVisible();
    const handoffsBeforeReview = await page.evaluate(() =>
        window.CaissaPostGameExperienceInstance.getSnapshot().diagnostics.handoffs);
    await analyze.click();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaPostGameExperienceInstance.getSnapshot().diagnostics.handoffs)).toBe(handoffsBeforeReview + 1);
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
    const canonicalSummarySymbols = await summary.locator('[data-coach-review-classifications] [data-quality]')
        .evaluateAll(rows => Object.fromEntries(rows.map(row => [row.dataset.quality,
            row.querySelector('.caissa-coach-review-summary__quality-icon')?.textContent])));
    const expectedSummarySymbols = { Book: '📖', Best: '★', Acceptable: '✓', Inaccuracy: '?!', Mistake: '?', Blunder: '??' };
    for (const [quality, symbol] of Object.entries(canonicalSummarySymbols)) expect(symbol).toBe(expectedSummarySymbols[quality]);
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
    await page.evaluate(() => {
        window.AnalyzeSection.analysisResults.forEach((item, index) => {
            if (!item) return;
            item.quality = index === 0 ? 'Inaccuracy' : 'Acceptable';
            item.isBestMove = false; item.annotation = index === 0 ? '?!' : '';
            item.evalAfter = index === 0 ? 3 : -3; item.mateAfter = null;
        });
        window.AnalyzeSection.updateMoveList(); window.AnalyzeSection.jumpToMove(0);
    });
    await expect.poll(() => page.evaluate(() => ({
        cp: window.CaissaEvaluationRailInstance.getSnapshot().scoreCp,
        source: window.CaissaEvaluationRailInstance.getSnapshot().source
    }))).toEqual({ cp: 300, source: 'coach-review-ply' });
    await page.evaluate(() => {
        const first = window.AnalyzeSection.analysisResults[0];
        const second = window.AnalyzeSection.analysisResults[1];
        first.quality = 'Mistake'; first.annotation = '?'; first.isBestMove = false;
        second.quality = 'Blunder'; second.annotation = '??'; second.isBestMove = false;
        window.AnalyzeSection.updateMoveList(); window.AnalyzeSection.jumpToMove(0);
    });
    await page.getByRole('button', { name: 'Start Review' }).click();
    await expect(page.locator('[data-coach-review-symbol="Mistake"]')).toHaveText('?');
    await expect(page.locator('[data-coach-review-symbol="Blunder"]')).toHaveText('??');
    await page.evaluate(() => {
        const first = window.AnalyzeSection.analysisResults[0];
        const second = window.AnalyzeSection.analysisResults[1];
        first.quality = 'Acceptable'; first.annotation = ''; first.evalAfter = 3;
        second.quality = 'Mistake'; second.annotation = '?'; second.evalAfter = -3;
        window.AnalyzeSection.updateMoveList(); window.AnalyzeSection.jumpToMove(0);
    });
    const original = await page.evaluate(() => ({
        completedPgn: window.AnalyzeSection.loadedGame.pgn,
        loadedMoves: window.AnalyzeSection.getLoadedMoves({ verbose: true }),
        appMoveHistory: window.App.moveHistory.map(move => ({ ...move })),
        reviewResults: JSON.stringify(window.AnalyzeSection.analysisResults),
        accuracy: [0, 1].map(parity => window.CaissaAnalyzeReviewPolicy.accuracy(
            window.AnalyzeSection.analysisResults.filter(item => item && !item.unavailable && item.moveIndex % 2 === parity)
        ).value),
        classifications: window.AnalyzeSection.analysisResults.map(item => item?.quality || null),
        result: window.AnalyzeSection.loadedGame.result
    }));
    await expect(page.locator('[data-caissa-coach-guided-review]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
        const rail = window.CaissaEvaluationRailInstance.getSnapshot();
        return { cp: rail.scoreCp, source: rail.source, mode: rail.displayMode };
    })).toEqual({ cp: 300, source: 'coach-review-ply', mode: 'post-game' });
    const whiteAdvantageHeight = await page.locator('#evalFill').evaluate(node => Number.parseFloat(node.style.height));
    expect(whiteAdvantageHeight).toBeGreaterThan(50);
    await expect.poll(() => page.evaluate(() => {
        const rail = document.querySelector('#evalBar').getBoundingClientRect();
        const fill = document.querySelector('#evalFill').getBoundingClientRect();
        return fill.height / rail.height;
    })).toBeGreaterThan(.75);
    await verifyPermanentShell('guided-review');
    await expect(page.locator('[data-caissa-coach-head]')).toContainText(/BOOK|BEST|ACCEPTABLE|INACCURACY|MISTAKE|BLUNDER/);
    await expect(page.locator('[data-caissa-coach-body] [data-coach-guided-explain]')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-body] [data-coach-guided-next]')).toBeVisible();
    await expect(page.locator('[data-coach-guided-next]')).toHaveAttribute('aria-label', 'Next review-worthy moment');
    await expect(page.locator('[data-caissa-coach-body] #analyzeMoveList')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeNavFirst')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeNavPrev')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeNavNext')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeNavLast')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] #analyzeFlipBoard')).toHaveCount(0);
    await expect(page.locator('[data-coach-guided-navigation] #analyzeFlipBoard')).toHaveCount(0);
    await expect(page.locator('[data-coach-review-settings-dialog] [data-coach-guided-flip]')).toBeAttached();
    await expect(page.locator('[data-caissa-coach-foot] [data-coach-guided-analysis]')).toBeVisible();
    await expect(page.locator('[data-coach-guided-settings]')).toHaveCount(0);
    await expect(page.locator('[data-coach-guided-new-game]')).toBeVisible();
    await expect(page.locator('.caissa-simplified-shell__board-stage .analyze-board-navigation')).toHaveCount(0);
    await page.locator('[data-coach-guided-explain]').click();
    await expect(page.locator('[data-coach-guided-detail]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(0);
    await expect(page.locator('[data-coach-guided-next]')).toContainText('Next Moment');
    await page.locator('[data-coach-guided-next]').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(1);
    await expect(page.locator('[data-coach-guided-next]')).toContainText('Review Complete');
    await expect(page.locator('[data-coach-guided-new-game]')).toBeVisible();
    const finalActions = await page.locator('[data-coach-guided-foot-review] [data-coach-guided-flip], '
        + '[data-coach-guided-foot-review] [data-coach-guided-analysis], '
        + '[data-coach-guided-foot-review] [data-coach-guided-new-game]').evaluateAll(nodes => nodes
        .filter(node => node.getClientRects().length)
        .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)
        .map(node => node.textContent.trim()));
    expect(finalActions).toEqual(['New Game', 'Analysis']);
    await expect(page.getByRole('dialog', { name: 'Review Settings' })).not.toBeVisible();
    await expect(page.locator('[data-coach-review-settings-dialog] #analyzeFlipBoard')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot().scoreCp)).toBe(-300);
    const semanticHeight = await page.locator('#evalFill').evaluate(node => Number.parseFloat(node.style.height));
    expect(semanticHeight).toBeLessThan(50);
    await expect.poll(() => page.evaluate(() => {
        const rail = document.querySelector('#evalBar').getBoundingClientRect();
        const fill = document.querySelector('#evalFill').getBoundingClientRect();
        return fill.height / rail.height;
    })).toBeLessThan(.25);
    await page.locator('#analyzeNavFirst').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(-1);
    await expect(page.locator('[data-coach-guided-next]')).toContainText('Next Moment');
    await expect(page.locator('[data-coach-guided-next]')).toBeEnabled();
    await expect(page.locator('[data-coach-guided-new-game]')).toBeVisible();
    await page.locator('[data-coach-guided-next]').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(1);
    await expect(page.locator('[data-coach-guided-notation] [data-index="1"]')).toHaveClass(/active/);
    await expect(page.locator('[data-caissa-coach-guided-review]')).toHaveAttribute('data-authoritative-ply', '1');
    await expect(page.locator('[data-coach-guided-next]')).toContainText('Review Complete');
    await page.locator('#analyzeNavFirst').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(-1);
    await page.locator('#analyzeNavNext').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(0);
    await expect(page.locator('[data-coach-guided-next]')).toContainText('Next Moment');
    await expect(page.locator('[data-coach-guided-new-game]')).toBeVisible();
    await expect(page.locator('[data-coach-guided-notation] [data-index="0"]')).toHaveClass(/active/);
    await expect(page.locator('[data-caissa-coach-guided-review]')).toHaveAttribute('data-authoritative-ply', '0');
    await page.locator('#analyzeNavLast').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot().scoreCp)).toBe(-300);
    await expect(page.locator('[data-coach-guided-next]')).toContainText('Review Complete');
    await expect(page.locator('[data-coach-guided-new-game]')).toBeVisible();
    await page.locator('#analyzeNavPrev').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot().scoreCp)).toBe(300);
    const entryState = await page.evaluate(() => ({
        ply: window.AnalyzeSection.currentMoveIndex,
        fen: window.AnalyzeSection.getCoachReviewProjection().fen,
        lastMove: window.App.boardAdapter.getSnapshot().lastMove,
        rail: window.CaissaEvaluationRailInstance.getSnapshot().scoreCp,
        head: document.querySelector('[data-caissa-coach-head]').textContent
    }));
    await page.evaluate(() => {
        window.__coachReviewExplorationFens = [];
        const originalEnsure = window.AnalyzeSection.ensureAnalysisEngine.bind(window.AnalyzeSection);
        window.AnalyzeSection.ensureAnalysisEngine = async function ensureInstrumentedEngine() {
            const engine = await originalEnsure();
            if (engine && !engine.__coachManualStudyInstrumented) {
                const originalStart = engine.startAnalysis.bind(engine);
                engine.startAnalysis = function recordManualStudyRequest(fen, callback, depth) {
                    window.__coachReviewExplorationFens.push(fen);
                    return originalStart(fen, callback, depth);
                };
                engine.__coachManualStudyInstrumented = true;
            }
            return engine;
        };
    });
    await page.locator('[data-coach-guided-analysis]').click();
    await expect(page.locator('[data-coach-analysis-exploration]')).toBeVisible();
    await expect(page.locator('[data-coach-guided-view]')).toBeHidden();
    await expect(page.locator('[data-caissa-coach-head]')).toContainText('ANALYSIS');
    await expect(page.locator('[data-caissa-coach-head]')).toContainText('Explore this position');
    await expect(page.locator('[data-caissa-coach-head] [data-coach-exploration-pv]')).toContainText('Principal variation:');
    await expect(page.locator('[data-coach-source-game]')).toContainText('GAME MOVES (STUDY)');
    await expect(page.locator('[data-coach-source-notation] #analyzeMoveList')).toBeVisible();
    await expect(page.locator('[data-coach-exploration-workspace]')).toBeHidden();
    await expect(page.locator('[data-coach-exploration-foot]')).toBeVisible();
    await expect(page.locator('[data-caissa-coach-foot] [data-coach-exploration-nav]')).toHaveCount(4);
    await expect(page.locator('[data-caissa-coach-foot] .analyze-board-navigation:visible')).toHaveCount(0);
    await expect(page.locator('[data-coach-exploration-back]')).toBeVisible();
    await expect(page.locator('[data-coach-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');
    const visibleFootActions = (await page.locator('[data-caissa-coach-foot] button:visible').allTextContents()).join(' ');
    expect(visibleFootActions).not.toMatch(/Undo|Reset|Flip|Settings|New Game|Analysis\s*$/);
    expect(await page.evaluate(() => window.CaissaCoachReviewExploration.isActive())).toBe(true);
    const assertSourceSynchronization = async expectedIndex => {
        await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(expectedIndex);
        const synchronized = await page.evaluate(() => {
            const analyze = window.AnalyzeSection;
            const index = analyze.currentMoveIndex;
            const projection = analyze.getCoachReviewProjection();
            const item = index >= 0 ? analyze.analysisResults[index] : null;
            const model = window.CaissaCoachReviewPresentation.createGuidedModel(analyze, false, null);
            const active = document.querySelector('[data-coach-source-notation] .active');
            const rail = window.CaissaEvaluationRailInstance.getSnapshot();
            return {
                cursor: index,
                fen: projection.fen,
                lastMove: window.App.boardAdapter.getSnapshot().lastMove,
                expectedLastMove: projection.move,
                selectedIndex: active ? Number(active.dataset.index) : -1,
                studyFen: window.CaissaCoachReviewExploration.getFen(),
                railCp: rail.scoreCp,
                expectedCp: Number.isFinite(item?.evalAfter) ? item.evalAfter * 100 : rail.scoreCp
            };
        });
        expect(synchronized.studyFen).toBe(synchronized.fen);
        expect(synchronized.lastMove).toEqual(synchronized.expectedLastMove);
        expect(synchronized.selectedIndex).toBe(expectedIndex);
        expect(synchronized.railCp).toBe(synchronized.expectedCp);
    };
    await page.locator('[data-coach-exploration-nav="first"]').click(); await assertSourceSynchronization(-1);
    await page.locator('[data-coach-exploration-nav="next"]').click(); await assertSourceSynchronization(0);
    await page.locator('[data-coach-exploration-nav="last"]').click(); await assertSourceSynchronization(1);
    await page.locator('[data-coach-exploration-nav="previous"]').click(); await assertSourceSynchronization(0);
    await page.locator('[data-coach-source-notation] [data-index="1"]').click(); await assertSourceSynchronization(1);
    await page.locator('[data-coach-source-notation] [data-index="0"]').click(); await assertSourceSynchronization(0);
    const longNotationGeometry = await page.evaluate(() => {
        const phase = document.querySelector('[data-caissa-coach-body]');
        const foot = document.querySelector('[data-caissa-coach-foot]');
        const source = document.querySelector('[data-coach-source-notation]');
        const moveList = source.querySelector('.analyze-move-list');
        const list = source.querySelector('.move-list-grid');
        const template = list.querySelector('.move-row');
        const footTop = foot.getBoundingClientRect().top;
        for (let index = 0; index < 48; index += 1) {
            const clone = template.cloneNode(true); clone.dataset.hotfixQaClone = '';
            clone.querySelectorAll('button').forEach(button => button.removeAttribute('data-index'));
            list.append(clone);
        }
        const result = {
            bodyOverflow: getComputedStyle(phase).overflowY,
            notationOverflow: getComputedStyle(source).overflowY,
            moveListOverflow: getComputedStyle(moveList).overflowY,
            bodyScrollable: phase.scrollHeight > phase.clientHeight,
            nestedScrollbars: [source, moveList].filter(node => node.scrollHeight > node.clientHeight
                && ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)).length,
            footTopDelta: Math.abs(foot.getBoundingClientRect().top - footTop)
        };
        list.querySelectorAll('[data-hotfix-qa-clone]').forEach(node => node.remove());
        return result;
    });
    expect(longNotationGeometry).toEqual({
        bodyOverflow: 'auto', notationOverflow: 'visible', moveListOverflow: 'visible',
        bodyScrollable: true, nestedScrollbars: 0, footTopDelta: 0
    });
    const findExplorationMove = excluded => page.evaluate(excludedUci => {
        for (const file of 'abcdefgh') for (const rank of '12345678') {
            const move = window.CaissaCoachReviewExploration.movesFrom(`${file}${rank}`).find(candidate =>
                `${candidate.from}${candidate.to}${candidate.promotion || ''}` !== excludedUci);
            if (move) return { from: move.from, to: move.to, promotion: move.promotion,
                uci: `${move.from}${move.to}${move.promotion || ''}` };
        }
        return null;
    }, excluded || '');
    const draggedMove = await findExplorationMove(); expect(draggedMove).not.toBeNull();
    await page.locator(`#chessboard .square-${draggedMove.from}`).dragTo(
        page.locator(`#chessboard .square-${draggedMove.to}`));
    await expect.poll(() => page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot().temporaryPlyCount)).toBe(1);
    for (let index = 1; index < 3; index += 1) {
        const move = await findExplorationMove(); expect(move).not.toBeNull();
        expect(await playMove(page, move.from, move.to, move.promotion)).toBe(true);
    }
    await expect(page.locator('[data-coach-exploration-workspace]')).toBeVisible();
    await expect(page.locator('[data-coach-exploration-workspace]')).toContainText('ANALYSIS VARIATION');
    await expect(page.locator('[data-coach-exploration-move]')).toHaveCount(3);
    const longVariationGeometry = await page.evaluate(() => {
        const body = document.querySelector('[data-caissa-coach-body]');
        const foot = document.querySelector('[data-caissa-coach-foot]');
        const variation = document.querySelector('[data-coach-exploration-notation]');
        const template = variation.querySelector('.caissa-coach-exploration__notation-row');
        const footTop = foot.getBoundingClientRect().top;
        for (let index = 0; index < 48; index += 1) {
            const clone = template.cloneNode(true); clone.dataset.hotfixQaClone = ''; variation.append(clone);
        }
        const result = { bodyOverflow: getComputedStyle(body).overflowY,
            variationOverflow: getComputedStyle(variation).overflowY,
            bodyScrollable: body.scrollHeight > body.clientHeight,
            nestedScrollbar: variation.scrollHeight > variation.clientHeight
                && ['auto', 'scroll'].includes(getComputedStyle(variation).overflowY),
            footTopDelta: Math.abs(foot.getBoundingClientRect().top - footTop) };
        variation.querySelectorAll('[data-hotfix-qa-clone]').forEach(node => node.remove());
        return result;
    });
    expect(longVariationGeometry).toEqual({ bodyOverflow: 'auto', variationOverflow: 'visible',
        bodyScrollable: true, nestedScrollbar: false, footTopDelta: 0 });
    const originalLine = await page.evaluate(() => window.CaissaCoachReviewExploration.getLine().map(move => ({ ...move })));
    await page.locator('[data-coach-exploration-nav="previous"]').click();
    const replaced = originalLine[2];
    const replacement = await findExplorationMove(`${replaced.from}${replaced.to}${replaced.promotion || ''}`);
    expect(replacement).not.toBeNull();
    expect(await playMove(page, replacement.from, replacement.to, replacement.promotion)).toBe(true);
    expect(await page.evaluate(() => window.CaissaCoachReviewExploration.getLine().map(move => move.san))).toHaveLength(3);
    expect((await page.evaluate(() => window.CaissaCoachReviewExploration.getLine().at(-1).san))).not.toBe(replaced.san);
    await page.locator('[data-coach-exploration-nav="first"]').click();
    await expect.poll(() => page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot().cursor)).toBe(0);
    await page.locator('[data-coach-exploration-nav="next"]').click();
    await expect.poll(() => page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot().cursor)).toBe(1);
    await page.locator('[data-coach-exploration-nav="last"]').click();
    await expect.poll(() => page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot().cursor)).toBe(3);
    const headBeforeOff = await page.locator('[data-caissa-coach-head]').textContent();
    const railBeforeOff = await page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot());
    await page.locator('[data-coach-exploration-engine]').click();
    await expect(page.locator('[data-coach-exploration-engine]')).toHaveAttribute('aria-pressed', 'false');
    const requestsWhileOff = await page.evaluate(() => window.__coachReviewExplorationFens.length);
    await page.locator('[data-coach-exploration-nav="previous"]').click();
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.__coachReviewExplorationFens.length)).toBe(requestsWhileOff);
    expect((await page.locator('[data-caissa-coach-head]').textContent()).replace('Engine off. ', '')).toBe(headBeforeOff);
    const railWhileOff = await page.evaluate(() => window.CaissaEvaluationRailInstance.getSnapshot());
    expect({ cp: railWhileOff.scoreCp, mate: railWhileOff.mate }).toEqual({ cp: railBeforeOff.scoreCp, mate: railBeforeOff.mate });
    await page.locator('[data-coach-exploration-engine]').click();
    await expect(page.locator('[data-coach-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');
    const layoutMetrics = [];
    for (const viewport of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }]) {
        await page.setViewportSize(viewport);
        layoutMetrics.push(await page.evaluate(size => {
            const shell = document.querySelector('[data-caissa-coach-shell]');
            const head = document.querySelector('[data-caissa-coach-head]');
            const body = document.querySelector('[data-caissa-coach-body]');
            const foot = document.querySelector('[data-caissa-coach-foot]');
            const source = document.querySelector('[data-coach-source-notation]');
            const variation = document.querySelector('[data-coach-exploration-notation]');
            const rect = node => { const box = node.getBoundingClientRect(); return {
                top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height) }; };
            return { viewport: size, head: rect(head), body: { ...rect(body), clientHeight: body.clientHeight,
                scrollHeight: body.scrollHeight }, foot: rect(foot), shell: rect(shell),
                bodyOverflow: getComputedStyle(body).overflowY,
                nestedScrollbars: [source, variation].filter(node => node.scrollHeight > node.clientHeight
                    && ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)).length,
                horizontalOverflow: shell.scrollWidth > shell.clientWidth };
        }, viewport));
    }
    expect(layoutMetrics.every(item => item.bodyOverflow === 'auto' && item.nestedScrollbars === 0
        && item.horizontalOverflow === false && item.foot.bottom <= item.shell.bottom + 1)).toBe(true);
    await page.setViewportSize({ width: 1600, height: 1000 });
    if (process.env.CAISSA_QA_CAPTURE === '1') {
        console.log(`MANUAL_STUDY_DESKTOP_METRICS ${JSON.stringify(layoutMetrics)}`);
        await page.screenshot({ path: 'artifacts/play-coach-manual-study-desktop.png', fullPage: true });
    }
    const cleanAnalysisDesktopViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    const cleanAnalysisMobileGeometry = await page.locator('[data-caissa-coach-shell]').evaluate(shell => {
        const rect = shell.getBoundingClientRect();
        const buttons = [...shell.querySelectorAll('[data-coach-exploration-nav]')]
            .filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect());
        return { left: rect.left, right: rect.right, viewportWidth: innerWidth,
            scrollWidth: shell.scrollWidth, clientWidth: shell.clientWidth,
            minButtonWidth: Math.min(...buttons.map(button => button.width)),
            minButtonHeight: Math.min(...buttons.map(button => button.height)) };
    });
    expect(cleanAnalysisMobileGeometry.left).toBeGreaterThanOrEqual(0);
    expect(cleanAnalysisMobileGeometry.right).toBeLessThanOrEqual(cleanAnalysisMobileGeometry.viewportWidth);
    expect(cleanAnalysisMobileGeometry.scrollWidth).toBeLessThanOrEqual(cleanAnalysisMobileGeometry.clientWidth);
    expect(cleanAnalysisMobileGeometry.minButtonWidth).toBeGreaterThanOrEqual(44);
    expect(cleanAnalysisMobileGeometry.minButtonHeight).toBeGreaterThanOrEqual(44);
    if (process.env.CAISSA_QA_CAPTURE === '1') {
        await page.setViewportSize({ width: 390, height: 1350 });
        await page.screenshot({ path: 'artifacts/play-coach-manual-study-mobile.png', fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
    }
    const cleanAnalysisA11y = await new AxeBuilder({ page }).include('[data-caissa-coach-shell]').analyze();
    expect(cleanAnalysisA11y.violations.filter(issue => ['critical', 'serious'].includes(issue.impact))).toEqual([]);
    await page.setViewportSize(cleanAnalysisDesktopViewport);
    const during = await page.evaluate(() => ({
        completedPgn: window.AnalyzeSection.loadedGame.pgn,
        loadedMoves: window.AnalyzeSection.getLoadedMoves({ verbose: true }),
        appMoveHistory: window.App.moveHistory.map(move => ({ ...move })),
        reviewResults: JSON.stringify(window.AnalyzeSection.analysisResults),
        accuracy: [0, 1].map(parity => window.CaissaAnalyzeReviewPolicy.accuracy(
            window.AnalyzeSection.analysisResults.filter(item => item && !item.unavailable && item.moveIndex % 2 === parity)
        ).value),
        classifications: window.AnalyzeSection.analysisResults.map(item => item?.quality || null),
        result: window.AnalyzeSection.loadedGame.result,
        reviewPly: window.AnalyzeSection.currentMoveIndex
    }));
    expect(during).toEqual({ ...original, reviewPly: entryState.ply });
    expect(await page.evaluate(() => window.CaissaCoachReviewExploration.isActive())).toBe(true);
    await page.locator('[data-coach-exploration-back]').click();
    await expect(page.locator('[data-coach-guided-view]')).toBeVisible();
    await expect(page.locator('[data-coach-analysis-exploration]')).toBeHidden();
    const restoredState = await page.evaluate(() => ({
        ply: window.AnalyzeSection.currentMoveIndex,
        fen: window.AnalyzeSection.getCoachReviewProjection().fen,
        lastMove: window.App.boardAdapter.getSnapshot().lastMove,
        rail: window.CaissaEvaluationRailInstance.getSnapshot().scoreCp,
        head: document.querySelector('[data-caissa-coach-head]').textContent
    }));
    expect(restoredState).toEqual(entryState);
    expect(await page.evaluate(() => ({
        active: window.CaissaCoachReviewExploration.isActive(),
        temporaryPlyCount: window.CaissaCoachReviewExploration.getSnapshot().temporaryPlyCount
    }))).toEqual({ active: false, temporaryPlyCount: 0 });
    await expect(page.locator('#analyzeStartBtn')).toBeHidden();
    await expect(page.locator('.analyze-evidence-panel')).toBeHidden();
    await page.locator('[data-coach-guided-new-game]').click();
    await expect(page.locator('[data-caissa-coach-guided-review]')).toHaveCount(0);
    await expect(page.locator('.caissa-post-game')).toBeHidden();
    await expect(panel).toBeVisible();
    await verifyPermanentShell('setup');
    expect(pageErrors).toEqual([]);
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

test('Games-origin Analyze stays in the Play Game shell without affecting Coach presentation', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('.caissa-games-panel[data-games-phase="analysis-review"]')).toBeVisible();
    await expect(page.locator('[data-games-analysis]')).toBeVisible();
    await expect(page.locator('#analyzeSection .analyze-layout:visible')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Game Info' })).toBeHidden();
    await expect(page.locator('#analyzeStartBtn')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Critical Moments' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Move evidence' })).toBeHidden();
    await expect(page.locator('[data-caissa-coach-review-summary]')).toHaveCount(0);
    await expect(page.locator('[data-caissa-native-coach-panel]:visible')).toHaveCount(0);
});

test('Coach Game Over matches Bots Body/Foot and reuses authoritative PGN actions', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            writeText(text) { window.__coachCopiedPgn = text; return Promise.resolve(); }
        } });
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/play/beta/coach');
    const panel = page.locator('[data-caissa-native-coach-panel]');
    await panel.getByRole('button', { name: 'Play' }).click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    const authoritativePgn = await page.evaluate(() => window.CaissaGameRecord.buildFromPlay().notation.pgn);
    const bodyReview = page.locator('[data-caissa-coach-body] [data-post-game-action="analyze"]');
    const foot = page.locator('[data-caissa-coach-game-over-foot]');
    const menu = foot.locator('[data-coach-game-over-menu]');
    await expect(bodyReview).toHaveText('Review Game');
    await expect(foot.locator(':scope > [data-post-game-action]:visible')).toHaveText(['New Game']);
    await expect(menu.locator(':scope > summary')).toContainText('Menu');
    await expect(foot.locator(':scope > [data-post-game-action]:visible')).toHaveCount(1);
    const before = await page.evaluate(() => {
        const rect = selector => { const box = document.querySelector(selector).getBoundingClientRect();
            return { left: box.left, top: box.top, width: box.width, height: box.height }; };
        return { shell: rect('[data-caissa-coach-shell]'), head: rect('[data-caissa-coach-head]'),
            body: rect('[data-caissa-coach-body]'),
            foot: rect('[data-caissa-coach-foot]'), board: rect('#chessboard'),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    await menu.locator(':scope > summary').click();
    await expect(menu).toHaveAttribute('open', '');
    await expect(menu.locator('[data-post-game-action]')).toHaveText([
        'Copy PGN', 'Download PGN', 'Save PGN Locally'
    ]);
    await expect(menu.locator('[data-post-game-consent]')).not.toBeChecked();
    const after = await page.evaluate(() => {
        const rect = selector => { const box = document.querySelector(selector).getBoundingClientRect();
            return { left: box.left, top: box.top, width: box.width, height: box.height }; };
        return { shell: rect('[data-caissa-coach-shell]'), head: rect('[data-caissa-coach-head]'),
            body: rect('[data-caissa-coach-body]'),
            foot: rect('[data-caissa-coach-foot]'), board: rect('#chessboard'),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(after).toEqual(before);
    if (process.env.CAISSA_QA_CAPTURE === '1')
        console.log(`COACH_GAME_OVER_DESKTOP_GEOMETRY ${JSON.stringify({ before, after })}`);
    const copiesBefore = await page.evaluate(() =>
        window.CaissaPostGameExperienceInstance.getSnapshot().diagnostics.copies);
    await menu.locator('[data-post-game-action="copy-pgn"]').click();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaPostGameExperienceInstance.getSnapshot().diagnostics.copies)).toBe(copiesBefore + 1);
    expect(await page.evaluate(() => window.__coachCopiedPgn)).toBe(authoritativePgn);
    await expect(menu.locator('[data-post-game-feedback]')).toHaveText('PGN copied.');
    const downloadPromise = page.waitForEvent('download');
    await menu.locator('[data-post-game-action="download-pgn"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pgn$/);
    await menu.locator('[data-post-game-consent]').check();
    await expect(menu.locator('[data-post-game-action="save-game"]')).toBeEnabled();
    await menu.locator('[data-post-game-action="save-game"]').click();
    const storedPgn = await page.evaluate(() => window.CaissaGameRecordPersistence.listCompleted().value.at(0).notation.pgn);
    expect(storedPgn).toBe(authoritativePgn);
    if (process.env.CAISSA_QA_CAPTURE === '1')
        await page.screenshot({ path: 'artifacts/play-coach-game-over-menu-desktop.png', fullPage: true });
    await menu.locator(':scope > summary').click();
    await expect(menu).not.toHaveAttribute('open', '');
    await page.setViewportSize({ width: 390, height: 844 });
    await menu.locator(':scope > summary').scrollIntoViewIfNeeded();
    const mobileBefore = await page.evaluate(() => {
        const rect = selector => { const box = document.querySelector(selector).getBoundingClientRect();
            return { left: box.left, top: box.top, width: box.width, height: box.height }; };
        return { shell: rect('[data-caissa-coach-shell]'), head: rect('[data-caissa-coach-head]'),
            body: rect('[data-caissa-coach-body]'), foot: rect('[data-caissa-coach-foot]'),
            board: rect('#chessboard'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    await menu.locator(':scope > summary').click();
    const mobileAfter = await page.evaluate(() => {
        const rect = selector => { const box = document.querySelector(selector).getBoundingClientRect();
            return { left: box.left, top: box.top, width: box.width, height: box.height }; };
        return { shell: rect('[data-caissa-coach-shell]'), head: rect('[data-caissa-coach-head]'),
            body: rect('[data-caissa-coach-body]'), foot: rect('[data-caissa-coach-foot]'),
            board: rect('#chessboard'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(mobileAfter).toEqual(mobileBefore);
    if (process.env.CAISSA_QA_CAPTURE === '1')
        console.log(`COACH_GAME_OVER_MOBILE_GEOMETRY ${JSON.stringify({ before: mobileBefore, after: mobileAfter })}`);
    if (process.env.CAISSA_QA_CAPTURE === '1')
        await page.screenshot({ path: 'artifacts/play-coach-game-over-menu-mobile.png', fullPage: true });
    await menu.locator(':scope > summary').click();
    expect(pageErrors).toEqual([]);
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
    await expect.poll(() => page.evaluate(() => ({
        annotations: window.App.coachMoveAnnotations.length,
        postGameVisible: window.CaissaPostGameExperienceInstance.getSnapshot().visible,
        reviewPly: window.AnalyzeSection?.currentMoveIndex ?? -1,
        temporaryStudy: window.CaissaCoachReviewExploration?.getSnapshot?.().temporaryPlyCount || 0
    }))).toEqual({ annotations: 0, postGameVisible: false, reviewPly: -1, temporaryStudy: 0 });

    await panel.getByRole('button', { name: 'Play' }).click();
    await expect.poll(() => page.evaluate(() => ({
        gameHistory: window.App.game.history(), moveHistory: window.App.moveHistory.length
    }))).toEqual({ gameHistory: [], moveHistory: 0 });
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
            const actions = [...document.querySelectorAll('[data-coach-game-over-review], '
                + '[data-caissa-coach-game-over-foot] > [data-post-game-action], '
                + '[data-caissa-coach-game-over-foot] > details > summary')]
                .filter(node => node.getClientRects().length);
            const reviewGame = document.querySelector('[data-caissa-coach-body] [data-post-game-action="analyze"]');
            const newGame = document.querySelector('[data-caissa-coach-game-over-foot] [data-post-game-action="new-game"]');
            const menu = document.querySelector('[data-coach-game-over-menu] > summary');
            region.scrollIntoView({ block: 'center' });
            const box = region.getBoundingClientRect();
            return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                cardWidth: box.width, cardHeight: box.height, boardWidth: board.getBoundingClientRect().width,
                touchTargets: actions.every(action => action.getBoundingClientRect().height >= 44),
                reviewWidth: reviewGame.getBoundingClientRect().width,
                newGameWidth: newGame.getBoundingClientRect().width,
                newGameHeight: newGame.getBoundingClientRect().height,
                menuWidth: menu.getBoundingClientRect().width,
                newGameFontSize: parseFloat(getComputedStyle(newGame).fontSize) };
        });
        expect(geometry.overflow, JSON.stringify(viewport)).toBeLessThanOrEqual(1);
        expect(geometry.cardWidth).toBeLessThanOrEqual(432);
        expect(geometry.cardHeight).toBeLessThanOrEqual(760);
        expect(geometry.boardWidth).toBeGreaterThan(180);
        expect(geometry.touchTargets).toBe(true);
        expect(geometry.reviewWidth).toBeGreaterThanOrEqual(geometry.newGameWidth * 1.8);
        expect(Math.abs(geometry.newGameWidth - geometry.menuWidth)).toBeLessThanOrEqual(2);
        expect(geometry.newGameHeight, JSON.stringify(geometry)).toBeGreaterThanOrEqual(44);
        expect(geometry.newGameFontSize).toBeGreaterThanOrEqual(15);
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('[data-post-game-result]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-post-game-action="new-game"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-coach-game-over-menu] > summary')).toBeFocused();
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
