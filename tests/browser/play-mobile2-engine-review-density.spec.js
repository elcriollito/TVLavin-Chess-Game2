import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, monitorRuntime, playMove } from '../play/playwright-helpers.js';

const VIEWPORTS = [
    { width: 390, height: 844, layout: 'phone-standard' },
    { width: 430, height: 932, layout: 'phone-standard' },
    { width: 844, height: 390, layout: 'phone-landscape' },
    { width: 932, height: 430, layout: 'phone-landscape' }
];

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => instrumentPlay(page, { delayMs: 35,
    scores: [34, 21, 52, -18, 41], bestMoves: ['e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6'] }));

const settleLayout = page => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));

const rectsOverlap = (left, right) => !!left && !!right
    && left.left < right.right && left.right > right.left
    && left.top < right.bottom && left.bottom > right.top;

async function playOneMoveAndResign(page, route, start) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.locator(start).click();
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-ui-state', 'active');
    const before = await page.evaluate(() => window.App.game.history().length);
    const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
    expect(await playMove(page, move.from, move.to)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length), { timeout: 15_000 })
        .toBeGreaterThan(before);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
}

async function openSharedReview(page, product) {
    if (product === 'games') {
        await playOneMoveAndResign(page, '/play', '[data-games-primary]');
        await page.locator('[data-post-game-action="analyze"]').click();
        await expect.poll(() => page.evaluate(() => window.AnalyzeSection?.analysisPhase || 'loading'),
            { timeout: 30_000 }).toBe('complete');
        await page.getByRole('button', { name: 'Start Review', exact: true }).click();
        await expect(page.locator('.caissa-games-panel')).toHaveAttribute('data-games-phase', 'guided-review');
    } else {
        await page.goto('/play/bots?simplified=1', { waitUntil: 'domcontentloaded' });
        await page.getByRole('tab', { name: /^.*Advanced/ }).click();
        await page.getByLabel(/Vera, 1500 Elo target/).check();
        await page.locator('[data-bot-primary]').click();
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length), { timeout: 15_000 })
            .toBeGreaterThanOrEqual(2);
        await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
        await page.locator('[data-bots-primary-post-game-action]').click();
        const panel = page.locator('[data-caissa-bots-shell]');
        await expect(panel).toHaveAttribute('data-bot-shell-phase', 'analysis-summary');
        await expect(panel.locator('.caissa-bots-analysis-summary__review')).toBeEnabled({ timeout: 30_000 });
        await panel.locator('.caissa-bots-analysis-summary__review').click();
        await expect(panel).toHaveAttribute('data-bot-shell-phase', 'guided-review');
    }
    await expect(page.locator('[data-bots-guided-review]')).toBeVisible();
}

async function sharedEvidence(page) {
    return page.evaluate(() => {
        const state = window.CaissaBotsAnalysisExploration.getSnapshot();
        const sourcePly = state.mode === 'source' ? state.sourceCursor - 1 : null;
        const model = Number.isInteger(sourcePly) && sourcePly >= 0
            ? window.CaissaBotsGuidedReviewPresentation.createGuidedModel({
                analyze: window.AnalyzeSection,
                handoff: window.CaissaAnalyzeHandoff?.getCurrent?.() || null,
                index: sourcePly
            }) : null;
        const snapshot = window.CaissaBotsGuidedReviewPresentation.getSnapshot();
        const evidence = document.querySelector('[data-bots-exploration-review-evidence]');
        const board = document.querySelector('#chessboard .caissa-board').getBoundingClientRect();
        return {
            state,
            sourcePly,
            model: model && { index: model.index, quality: model.quality, playedMove: model.playedMove,
                bestMove: model.bestMove, bestMoveAvailable: model.bestMoveAvailable,
                bestMovePending: model.bestMovePending, evaluation: model.evaluation, message: model.message },
            dom: {
                classification: document.querySelector('[data-bots-exploration-classification]')?.textContent,
                played: document.querySelector('[data-bots-exploration-played]')?.textContent,
                best: document.querySelector('[data-bots-exploration-best]')?.textContent,
                reviewEvaluation: document.querySelector('[data-bots-exploration-review-evaluation]')?.textContent,
                commentary: document.querySelector('[data-bots-exploration-commentary]')?.textContent,
                engineEvaluation: document.querySelector('[data-bots-exploration-evaluation]')?.textContent,
                engineStatus: document.querySelector('[data-bots-exploration-engine-status]')?.textContent,
                pv: document.querySelector('[data-bots-exploration-pv]')?.textContent,
                authoritativePly: evidence?.dataset.authoritativePly,
                authoritativeFen: evidence?.dataset.authoritativeFen,
                engineFen: evidence?.dataset.engineFen,
                engineState: evidence?.dataset.engineStatus,
                positionMode: evidence?.dataset.positionMode
            },
            presenter: snapshot.explorationEvidence,
            analysis: snapshot.exploration,
            boardTop: board.top,
            boardFen: window.App.boardProjection?.getSnapshot?.().positionFen || null,
            analyzeCursor: window.AnalyzeSection.currentMoveIndex
        };
    });
}

test.fixme('M2-003G Coach Mobile 2.0 phone density is held from this release', async ({ page }) => {
    const runtime = monitorRuntime(page); const frames = []; let boardNodeStable = true;
    for (const [index, viewport] of VIEWPORTS.entries()) {
        await page.setViewportSize(viewport);
        if (index === 0) {
            await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
            await expect(page.locator('[data-caissa-native-coach-panel]')).toBeVisible();
        }
        await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', viewport.layout);
        await settleLayout(page);
        const frame = await page.evaluate(() => {
            const rect = selector => {
                const node = document.querySelector(selector); const box = node?.getBoundingClientRect();
                return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right,
                    width: box.width, height: box.height } : null;
            };
            const phase = document.querySelector('.caissa-native-coach-panel__phase');
            const play = document.getElementById('playSection');
            const preview = document.querySelector('.caissa-simplified-shell__preview');
            const board = document.querySelector('#chessboard .caissa-board');
            if (!window.__m2003gBoard) window.__m2003gBoard = board;
            const menu = rect('#mobileNavToggle'); const action = rect('.caissa-native-coach-panel__foot button');
            return {
                layout: document.querySelector('[data-caissa-simplified-shell]').dataset.layout,
                headingText: document.querySelector('.caissa-simplified-shell__purpose')?.textContent,
                documentTitle: document.title,
                preview: { ...rect('.caissa-simplified-shell__preview'), position: getComputedStyle(preview).position },
                board: rect('#chessboard .caissa-board'), menu, action,
                boardStable: board === window.__m2003gBoard,
                playOverflow: getComputedStyle(play).overflowY,
                playScrollTop: play.scrollTop,
                phase: { ...rect('.caissa-native-coach-panel__phase'), overflowY: getComputedStyle(phase).overflowY,
                    scrollTop: phase.scrollTop, scrollHeight: phase.scrollHeight, clientHeight: phase.clientHeight },
                personaHeight: rect('.caissa-native-coach-panel__persona')?.height,
                horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
        });
        frames.push(frame); boardNodeStable &&= frame.boardStable;
        expect(frame).toMatchObject({ layout: viewport.layout, headingText: 'Play',
            preview: { position: 'absolute', width: 1, height: 1 }, boardStable: true,
            playOverflow: 'clip', playScrollTop: 0, horizontalOverflow: 0 });
        expect(frame.documentTitle).toMatch(/Play Chess Online/);
        expect(frame.board.top).toBeGreaterThanOrEqual(0);
        expect(frame.board.bottom).toBeLessThanOrEqual(viewport.height);
        expect(frame.personaHeight).toBeLessThanOrEqual(109);
        expect(frame.phase.overflowY).toBe('auto');
        expect(frame.phase.clientHeight).toBeGreaterThanOrEqual(44);
        expect(frame.phase.scrollHeight).toBeGreaterThanOrEqual(frame.phase.clientHeight);
        expect(rectsOverlap(frame.menu, frame.board)).toBe(false);
        expect(rectsOverlap(frame.menu, frame.action)).toBe(false);
        const boardTop = frame.board.top;
        await page.locator('.caissa-native-coach-panel__phase').evaluate(node => node.scrollTo(0, node.scrollHeight));
        await settleLayout(page);
        expect(Math.abs((await page.locator('#chessboard .caissa-board').boundingBox()).y - boardTop)).toBeLessThanOrEqual(1);
        await page.locator('.caissa-native-coach-panel__phase').evaluate(node => node.scrollTo(0, 0));
    }
    expect(boardNodeStable).toBe(true);
    expect(frames.slice(0, 2).some(frame => frame.phase.scrollHeight > frame.phase.clientHeight)).toBe(true);
    await page.setViewportSize(VIEWPORTS[0]); await settleLayout(page);
    expect(Math.abs((await page.locator('#chessboard .caissa-board').boundingBox()).y - frames[0].board.top)).toBeLessThanOrEqual(1);
    const snapshot = await page.locator('body').ariaSnapshot();
    expect(snapshot).toContain('heading "Play"');

    await page.setViewportSize({ width: 800, height: 1000 }); await settleLayout(page);
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', 'tablet-portrait-stacked');
    await expect(page.locator('.caissa-simplified-shell__purpose')).toBeVisible();
    await page.setViewportSize({ width: 1600, height: 1000 }); await settleLayout(page);
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', 'desktop-split');
    await expect(page.locator('.caissa-simplified-shell__purpose')).toBeVisible();
    console.log(`M2_003G_PHONE_DENSITY ${JSON.stringify(frames)}`);
    runtime.assertClean();
});

for (const product of ['games', 'bots']) {
    test(`M2-003G ${product === 'games' ? 'Play' : 'Bots'} Engine ON projects one-FEN canonical review evidence`, async ({ page }) => {
        test.setTimeout(120_000); const runtime = monitorRuntime(page);
        await page.setViewportSize(product === 'games' ? VIEWPORTS[0] : VIEWPORTS[1]);
        await openSharedReview(page, product);
        const beforeTop = (await page.locator('#chessboard .caissa-board').boundingBox()).y;
        await page.evaluate(() => window.__caissaPlayHarness.configure({ delayMs: 300 }));
        await page.locator('.caissa-bots-guided__analysis').click();
        await expect(page.locator('[data-bots-analysis-exploration]')).toBeVisible();
        await expect(page.locator('[data-bots-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('[data-bots-exploration-engine-status]')).toHaveText('Analyzing…');
        await expect(page.locator('[data-bots-exploration-engine-status]')).toHaveText('Engine ready', { timeout: 10_000 });
        await settleLayout(page);

        const samples = [await sharedEvidence(page)];
        for (const action of ['last', 'previous', 'first', 'next']) {
            const button = page.locator(`[data-bots-exploration-nav="${action}"]`);
            if (await button.isEnabled()) await button.click();
            await expect(page.locator('[data-bots-exploration-engine-status]')).toHaveText('Engine ready', { timeout: 10_000 });
            await settleLayout(page); samples.push(await sharedEvidence(page));
        }
        for (const sample of samples.filter(value => value.sourcePly >= 0)) {
            expect(sample.state.currentFen).toBe(sample.boardFen);
            expect(sample.dom.authoritativeFen).toBe(sample.state.currentFen);
            expect(sample.dom.engineFen).toBe(sample.state.currentFen);
            expect(sample.dom.authoritativePly).toBe(String(sample.sourcePly));
            expect(sample.dom.positionMode).toBe('source');
            expect(sample.model.index).toBe(sample.sourcePly);
            expect(sample.dom.classification).toBe(sample.model.quality);
            expect(sample.dom.played).toBe(sample.model.playedMove);
            expect(sample.dom.best).toBe(sample.model.bestMoveAvailable ? sample.model.bestMove
                : sample.model.bestMovePending ? 'Analyzing…' : 'Not available');
            expect(sample.dom.reviewEvaluation).toBe(sample.model.evaluation === '—'
                ? 'Not available' : sample.model.evaluation);
            expect(sample.dom.commentary).toBe(sample.model.message);
            expect(sample.dom.engineState).toBe('ready');
            expect(sample.dom.engineStatus).toBe('Engine ready');
            expect(sample.dom.pv).toMatch(/^Principal variation: (?!preparing)/);
        }
        expect(Math.max(...samples.map(sample => sample.boardTop))
            - Math.min(...samples.map(sample => sample.boardTop))).toBeLessThanOrEqual(1);
        expect(Math.abs(samples[0].boardTop - beforeTop)).toBeLessThanOrEqual(1);

        await page.locator('[data-bots-exploration-engine]').click();
        await expect(page.locator('[data-bots-exploration-engine-status]')).toHaveText('Engine Off');
        await expect(page.locator('[data-bots-exploration-evaluation]').first()).toHaveText('Engine Off');
        await expect(page.locator('[data-bots-exploration-pv]')).toHaveText('Principal variation: Engine Off');
        await page.locator('[data-bots-exploration-engine]').click();
        await expect(page.locator('[data-bots-exploration-engine-status]')).toHaveText('Analyzing…');
        await expect(page.locator('[data-bots-exploration-engine-status]')).toHaveText('Engine ready', { timeout: 10_000 });

        await page.screenshot({ path: `test-results/m2-003g-${product}-engine-review.png`, fullPage: false });
        const axe = await new AxeBuilder({ page }).include('#playSection').analyze();
        expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
        console.log(`M2_003G_${product.toUpperCase()}_ENGINE ${JSON.stringify(samples)}`);
        runtime.assertClean();
    });
}

test.fixme('M2-003G Coach Mobile 2.0 manual-analysis layout is held from this release', async ({ page }) => {
    test.setTimeout(120_000); const runtime = monitorRuntime(page);
    await page.setViewportSize(VIEWPORTS[0]);
    await playOneMoveAndResign(page, '/play/coach', '[data-caissa-native-coach-panel] button:has-text("Play")');
    const board = page.locator('#chessboard .caissa-board'); const boardTop = (await board.boundingBox()).y;
    await page.getByRole('button', { name: 'Analyze Game', exact: true }).scrollIntoViewIfNeeded();
    await settleLayout(page);
    expect(Math.abs((await board.boundingBox()).y - boardTop)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Analyze Game', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection?.analysisPhase || 'loading'),
        { timeout: 30_000 }).toBe('complete');
    const startReview = page.getByRole('button', { name: 'Start Review', exact: true });
    await expect(startReview).toBeVisible();
    await startReview.click();
    const manual = page.locator('[data-coach-guided-analysis]');
    await expect(manual).toBeVisible();
    const reviewBoardTop = (await board.boundingBox()).y;
    const controls = await page.evaluate(() => {
        const rect = selector => { const box = document.querySelector(selector)?.getBoundingClientRect();
            return box && { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height }; };
        return { menu: rect('#mobileNavToggle'), analysis: rect('[data-coach-guided-analysis]'),
            phaseOverflow: getComputedStyle(document.querySelector('.caissa-native-coach-panel__phase')).overflowY };
    });
    expect(controls.analysis.height).toBeGreaterThanOrEqual(44);
    expect(rectsOverlap(controls.menu, controls.analysis)).toBe(false);
    expect(controls.phaseOverflow).toBe('auto');
    await manual.click();
    await expect(page.locator('[data-coach-analysis-exploration]')).toBeVisible();
    await expect(page.locator('[data-coach-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');
    console.log('M2_003G_COACH_ANCHOR', JSON.stringify(await page.evaluate(reviewTop => ({
        reviewTop,
        board: document.querySelector('#chessboard .caissa-board')?.getBoundingClientRect().toJSON(),
        stage: document.querySelector('.caissa-simplified-shell__board-stage')?.getBoundingClientRect().toJSON(),
        navigation: document.querySelector('[data-mobile-review-navigation]')?.getBoundingClientRect().toJSON(),
        phase: document.querySelector('.caissa-native-coach-panel__phase')?.getBoundingClientRect().toJSON(),
        layout: document.querySelector('[data-caissa-simplified-shell]')?.dataset.layout
    }), reviewBoardTop)));
    expect(Math.abs((await board.boundingBox()).y - reviewBoardTop)).toBeLessThanOrEqual(1);

    await page.setViewportSize(VIEWPORTS[2]); await settleLayout(page);
    await page.setViewportSize(VIEWPORTS[0]); await settleLayout(page);
    expect(Math.abs((await board.boundingBox()).y - reviewBoardTop)).toBeLessThanOrEqual(1);
    const axe = await new AxeBuilder({ page }).include('#playSection').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await page.screenshot({ path: 'test-results/m2-003g-coach-manual-analysis.png', fullPage: false });
    runtime.assertClean();
});
