import { test, expect } from '@playwright/test';
import { instrumentPlay, monitorRuntime, playMove } from '../play/playwright-helpers.js';

const VIEWPORTS = [
    { width: 390, height: 844, layout: 'phone-standard' },
    { width: 430, height: 932, layout: 'phone-standard' },
    { width: 844, height: 390, layout: 'phone-landscape' },
    { width: 932, height: 430, layout: 'phone-landscape' }
];

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => instrumentPlay(page, {
    delayMs: 35,
    scores: [34, 21, 52, -18, 41],
    bestMoves: ['e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6']
}));

const settle = page => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function centerAboveFoot(page, locator) {
    await locator.evaluate(node => {
        const owner = document.getElementById('mainContent');
        const foot = document.querySelector('[data-caissa-coach-foot-wrap]');
        const target = node.getBoundingClientRect(); const footBox = foot.getBoundingClientRect();
        const desiredTop = Math.max(8, (footBox.top - target.height) / 2);
        owner.scrollTop += target.top - desiredTop;
    });
    await settle(page);
    await page.waitForTimeout(350);
}

async function openCoach(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-caissa-native-coach-panel]')).toBeVisible();
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', viewport.layout);
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-scroll-owner', 'document');
    await page.locator('#mainContent').evaluate(node => node.scrollTo(0, 0));
    await settle(page);
}

async function rememberBoard(page) {
    await page.evaluate(() => {
        const root = document.querySelector('#chessboard .caissa-board');
        window.__coachC2cBoard = { root, squares: [...root.querySelectorAll('.caissa-board__square')] };
    });
}

async function flowProof(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const box = document.querySelector(selector)?.getBoundingClientRect();
            return box && { top: box.top, bottom: box.bottom, left: box.left, right: box.right,
                width: box.width, height: box.height };
        };
        const visible = node => !!node && node.getClientRects().length > 0
            && getComputedStyle(node).visibility !== 'hidden';
        const owner = document.getElementById('mainContent');
        const body = document.querySelector('[data-caissa-coach-body-wrap]');
        const panel = document.querySelector('[data-caissa-native-coach-panel]');
        const context = document.querySelector('.caissa-simplified-shell__context');
        const contextBody = document.querySelector('.caissa-simplified-shell__context-body');
        const foot = document.querySelector('[data-caissa-coach-foot-wrap]');
        const board = document.querySelector('#chessboard .caissa-board');
        const navigation = document.querySelector('[data-mobile-review-navigation]');
        const identity = window.__coachC2cBoard;
        const candidates = [owner, document.getElementById('playSection'), context, contextBody, panel, body]
            .filter(Boolean).map(node => ({ node, overflow: getComputedStyle(node).overflowY,
                scrollable: node.scrollHeight > node.clientHeight + 1
                    && ['auto', 'scroll'].includes(getComputedStyle(node).overflowY) }));
        return {
            ownerOverflow: getComputedStyle(owner).overflowY,
            ownerScrollable: owner.scrollHeight > owner.clientHeight + 1,
            ownerScrollTop: owner.scrollTop,
            internalOverflows: [context, contextBody, panel, body].map(node => getComputedStyle(node).overflowY),
            scrollOwners: candidates.filter(item => item.scrollable).map(item =>
                item.node === owner ? 'application-page' : item.node.className || item.node.id),
            board: rect('#chessboard .caissa-board'),
            stage: rect('.caissa-simplified-shell__board-stage'),
            navigation: rect('[data-mobile-review-navigation]'),
            head: rect('[data-caissa-coach-head-wrap]'),
            body: rect('[data-caissa-coach-body-wrap]'),
            foot: rect('[data-caissa-coach-foot-wrap]'),
            footPosition: getComputedStyle(foot).position,
            footBottom: parseFloat(getComputedStyle(foot).bottom),
            footCount: document.querySelectorAll('[data-caissa-coach-foot-wrap]').length,
            footLabels: [...foot.querySelectorAll('[data-shell-mode]')].filter(visible)
                .map(node => node.textContent.trim().replace(/\s+/g, ' ')),
            navigationCount: document.querySelectorAll('[data-mobile-review-navigation]').length,
            navInSlot: navigation?.parentElement?.hasAttribute('data-caissa-phase-action-slot') === true,
            boardRootStable: !identity || identity.root === board,
            squaresStable: !identity || identity.squares.every((square, index) =>
                square === board.querySelectorAll('.caissa-board__square')[index]),
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

function assertHybrid(proof, viewport, { review = false, requireScroll = false } = {}) {
    expect(proof.ownerOverflow).toBe('auto');
    expect(proof.internalOverflows).toEqual(['visible', 'visible', 'visible', 'visible']);
    if (requireScroll) {
        expect(proof.ownerScrollable).toBe(true);
        expect(proof.scrollOwners).toEqual(['application-page']);
    }
    expect(proof.footPosition).toBe('fixed');
    expect(proof.footBottom).toBe(0);
    expect(proof.footCount).toBe(1);
    expect(proof.foot.bottom).toBeCloseTo(viewport.height, 0);
    expect(proof.footLabels).toEqual(['Play Game', 'Play Bots', 'Play Coach']);
    expect(proof.boardRootStable).toBe(true);
    expect(proof.squaresStable).toBe(true);
    expect(proof.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(proof.stage.bottom).toBeLessThanOrEqual(proof.head.top + 1);
    expect(proof.head.bottom).toBeLessThanOrEqual(proof.body.top + 6);
    if (review) {
        expect(proof.navigationCount).toBe(1);
        expect(proof.navInSlot).toBe(true);
        expect(proof.navigation.top).toBeGreaterThanOrEqual(proof.board.bottom);
        expect(proof.navigation.bottom).toBeLessThanOrEqual(proof.stage.bottom + 1);
    }
}

async function addLongTail(page, hostSelector) {
    await page.locator(hostSelector).evaluate(host => {
        const tail = document.createElement('div');
        tail.dataset.coachC2cLongTail = '';
        tail.style.cssText = 'display:grid;gap:12px;min-height:1100px;padding-top:12px';
        for (let index = 0; index < 18; index += 1) {
            const line = document.createElement('p');
            line.textContent = `Coach continuation ${index + 1}: keep the position and evidence aligned.`;
            tail.append(line);
        }
        const finalAction = document.createElement('button');
        finalAction.type = 'button'; finalAction.dataset.coachC2cFinalAction = '';
        finalAction.style.minHeight = '44px'; finalAction.textContent = 'Final Coach action';
        tail.append(finalAction); host.append(tail);
    });
}

async function assertNaturalScroll(page, viewport, { review = false } = {}) {
    const owner = page.locator('#mainContent');
    const before = await flowProof(page);
    const requested = Math.min(280, await owner.evaluate(node => node.scrollHeight - node.clientHeight));
    await owner.evaluate((node, top) => node.scrollTo({ top, behavior: 'instant' }), requested);
    await settle(page);
    const after = await flowProof(page);
    expect(after.ownerScrollTop).toBeGreaterThan(0);
    for (const region of ['board', 'head']) {
        expect(after[region].top).toBeLessThan(before[region].top);
        expect(Math.abs(after[region].width - before[region].width)).toBeLessThanOrEqual(1);
        expect(Math.abs(after[region].height - before[region].height)).toBeLessThanOrEqual(1);
    }
    if (review) expect(after.navigation.top).toBeLessThan(before.navigation.top);
    expect(after.foot.top).toBeCloseTo(before.foot.top, 1);
    expect(after.foot.bottom).toBeCloseTo(viewport.height, 0);
    const finalAction = page.locator('[data-coach-c2c-final-action]');
    await centerAboveFoot(page, finalAction);
    const clearance = await page.evaluate(() => {
        const action = document.querySelector('[data-coach-c2c-final-action]').getBoundingClientRect();
        const foot = document.querySelector('[data-caissa-coach-foot-wrap]').getBoundingClientRect();
        const owner = document.getElementById('mainContent');
        const shell = document.querySelector('[data-caissa-simplified-shell]');
        return { gap: foot.top - action.bottom, visible: action.top >= 0 && action.bottom <= foot.top,
            action: { top: action.top, bottom: action.bottom }, foot: { top: foot.top, bottom: foot.bottom },
            scrollTop: owner.scrollTop, maxScroll: owner.scrollHeight - owner.clientHeight,
            shellPaddingBottom: getComputedStyle(shell).paddingBottom };
    });
    expect(clearance.visible, JSON.stringify(clearance)).toBe(true);
    expect(clearance.gap).toBeGreaterThanOrEqual(8);
}

async function installGuidedReviewFixture(page) {
    await page.evaluate(() => {
        window.CaissaCoachReviewPresentation.unmount?.();
        const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];
        const qualities = ['Acceptable', 'Mistake', 'Acceptable', 'Inaccuracy', 'Acceptable', 'Blunder'];
        const moveList = document.createElement('div'); moveList.id = 'analyzeMoveList';
        moves.forEach((move, index) => {
            const button = document.createElement('button');
            button.type = 'button'; button.dataset.index = String(index); button.textContent = move;
            moveList.append(button);
        });
        const navigation = document.createElement('div'); navigation.className = 'analyze-board-navigation';
        const navButtons = {};
        for (const [action, id, label] of [
            ['first', 'analyzeNavFirst', 'First'], ['previous', 'analyzeNavPrev', 'Previous'],
            ['next', 'analyzeNavNext', 'Next'], ['last', 'analyzeNavLast', 'Last']
        ]) {
            const button = document.createElement('button');
            button.type = 'button'; button.id = id; button.className = 'nav-btn-sm';
            button.setAttribute('aria-label', label); button.textContent = label;
            navigation.append(button); navButtons[action] = button;
        }
        const source = document.createElement('div'); source.append(moveList, navigation);
        const analyze = {
            analysisPhase: 'complete', currentMoveIndex: -1, analyzedPositions: 7, totalPositions: 7,
            analysisResults: qualities.map((quality, moveIndex) => ({ moveIndex, quality,
                unavailable: false, isBestMove: false, loss: quality === 'Acceptable' ? .1 : 1,
                evalAfter: moveIndex / 10, mateAfter: null })),
            elements: { moveList, navFirst: navButtons.first, navPrev: navButtons.previous,
                navNext: navButtons.next, navLast: navButtons.last, flipBoard: null },
            getLoadedMoves: () => moves,
            getCurrentEvaluation: () => ({ evaluation: 0, mate: null }),
            startAnalysis: async () => true,
            jumpToMove(index) {
                this.currentMoveIndex = index; window.__coachC2cJumps.push(index);
                moveList.querySelectorAll('[data-index]').forEach(node =>
                    node.classList.toggle('active', Number(node.dataset.index) === index));
            }
        };
        window.__coachC2cJumps = [];
        const context = window.CaissaCoachReviewContext.create({
            owner: 'post-game-core', sourceMode: 'coach'
        }).value;
        const mounted = window.CaissaCoachReviewPresentation.mount({
            section: document.querySelector('#analyzeSection'), host: document.body, context,
            handoff: { payload: { mode: 'coach', playerColor: 'white',
                whiteLabel: 'You', blackLabel: 'Coach-assisted game' } }
        });
        if (!mounted.ok) throw new Error(`Coach fixture mount failed: ${mounted.reasonCode}`);
        const begun = window.CaissaCoachReviewPresentation.begin({ analyze });
        if (!begun.ok) throw new Error(`Coach fixture begin failed: ${begun.reasonCode}`);
    });
    const review = page.getByRole('button', { name: 'Review Game', exact: true });
    await centerAboveFoot(page, review); await review.click();
    await expect(page.locator('[data-caissa-coach-shell][data-coach-shell-phase="guided-review"]')).toBeVisible();
}

test('COACH-C2C setup and active play use natural page mobility with only FOOT fixed', async ({ page }) => {
    test.setTimeout(120_000);
    const runtime = monitorRuntime(page);
    for (const viewport of VIEWPORTS) {
        await openCoach(page, viewport); await rememberBoard(page);
        await addLongTail(page, '[data-caissa-coach-body-wrap]');
        assertHybrid(await flowProof(page), viewport, { requireScroll: true });
        await assertNaturalScroll(page, viewport);
        await page.locator('#mainContent').evaluate(node => node.scrollTo(0, 0));
        const play = page.locator('[data-coach-primary]');
        await centerAboveFoot(page, play); await play.click();
        await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-ui-state', 'active');
        await expect(page.locator('[data-active-game-action]:visible')).toHaveCount(4);
        await expect(page.locator('[data-mobile-review-navigation]')).toHaveCount(0);
        const active = await flowProof(page);
        expect(active.navigationCount).toBe(0);
        expect(active.stage.bottom).toBeLessThanOrEqual(active.head.top + 1);
        expect(active.boardRootStable).toBe(true); expect(active.squaresStable).toBe(true);
    }
    runtime.assertClean();
});

test('COACH-C2C guided review restores multi-moment progression in the natural flow', async ({ page }) => {
    test.setTimeout(120_000);
    const runtime = monitorRuntime(page);
    for (const viewport of VIEWPORTS) {
        await openCoach(page, viewport); await rememberBoard(page); await installGuidedReviewFixture(page);
        const next = page.locator('[data-coach-guided-next]');
        await expect(page.locator('[data-coach-guided-explain]')).toBeVisible();
        await expect(next).toBeVisible(); await expect(next).toBeEnabled();
        await expect(next).toContainText('Next Moment');
        await expect(next).toHaveAttribute('data-remaining-moments', '3');
        await addLongTail(page, '[data-caissa-coach-body-wrap]');
        await page.locator('#mainContent').evaluate(node => node.scrollTo(0, 0)); await settle(page);
        assertHybrid(await flowProof(page), viewport, { review: true, requireScroll: true });
        await assertNaturalScroll(page, viewport, { review: true });
        await centerAboveFoot(page, next);
        await next.tap(); await expect.poll(() => page.evaluate(() => window.__coachC2cJumps)).toEqual([0, 1]);
        await expect(next).toHaveAttribute('data-remaining-moments', '2');
        await next.tap(); await expect.poll(() => page.evaluate(() => window.__coachC2cJumps)).toEqual([0, 1, 3]);
        await expect(next).toHaveAttribute('data-remaining-moments', '1');
        await next.tap(); await expect.poll(() => page.evaluate(() => window.__coachC2cJumps)).toEqual([0, 1, 3, 5]);
        await expect(next).toContainText('Review Complete'); await expect(next).toBeDisabled();
        await expect(next).toHaveAttribute('data-remaining-moments', '0');
        const final = await flowProof(page);
        expect(final.boardRootStable).toBe(true); expect(final.squaresStable).toBe(true);
    }
    runtime.assertClean();
});

test('COACH-C2C manual analysis keeps sandbox engine ownership while content uses page flow', async ({ page }) => {
    test.setTimeout(120_000);
    const runtime = monitorRuntime(page);
    await openCoach(page, VIEWPORTS[0]); await rememberBoard(page);
    const play = page.locator('[data-coach-primary]');
    await centerAboveFoot(page, play); await play.click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    const analyzeGame = page.locator('[data-post-game-action="analyze"]');
    await centerAboveFoot(page, analyzeGame); await analyzeGame.click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection?.analysisPhase || 'loading'),
        { timeout: 30_000 }).toBe('complete');
    const guided = page.locator('[data-coach-review-guided-action]');
    await centerAboveFoot(page, guided); await guided.click();
    const analysis = page.locator('[data-coach-guided-analysis]');
    await centerAboveFoot(page, analysis); await analysis.click();
    await expect(page.locator('[data-coach-analysis-exploration]')).toBeVisible();
    const sourceFen = await page.evaluate(() => window.AnalyzeSection.getCoachReviewProjection().fen);
    const engine = page.locator('[data-coach-exploration-engine]');
    await expect(engine).toHaveAttribute('aria-pressed', 'false');
    await centerAboveFoot(page, engine); await engine.click();
    await expect.poll(() => page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot().analysis.status),
        { timeout: 15_000 }).toBe('ready');
    const first = await page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot());
    expect(first.analysis.aligned).toBe(true);
    const manualMove = await page.evaluate(() => {
        for (const file of 'abcdefgh') for (const rank of '12345678') {
            const move = window.CaissaCoachReviewExploration.movesFrom(`${file}${rank}`)[0];
            if (move) return { from: move.from, to: move.to, promotion: move.promotion };
        }
        return null;
    });
    expect(manualMove).not.toBeNull();
    expect(await playMove(page, manualMove.from, manualMove.to, manualMove.promotion)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot().analysis.status),
        { timeout: 15_000 }).toBe('ready');
    const moved = await page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot());
    expect(moved.currentFen).not.toBe(sourceFen); expect(moved.analysis.aligned).toBe(true);
    expect(new Set([moved.currentFen, moved.analysis.engineFen, moved.analysis.sandboxFen,
        moved.analysis.renderedFen, moved.analysis.requestFen]).size).toBe(1);
    await addLongTail(page, '[data-coach-analysis-exploration]');
    for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', viewport.layout);
        assertHybrid(await flowProof(page), viewport, { review: true, requireScroll: true });
    }
    await centerAboveFoot(page, engine); await engine.click();
    await expect(page.locator('[data-caissa-coach-head]')).toContainText('Engine Off');
    await engine.click();
    await expect.poll(() => page.evaluate(() => window.CaissaCoachReviewExploration.getSnapshot().analysis.status),
        { timeout: 15_000 }).toBe('ready');
    const back = page.locator('[data-coach-exploration-back]');
    await centerAboveFoot(page, back); await back.click();
    await expect(page.locator('[data-coach-guided-view]')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaCoachReviewExploration.isActive())).toBe(false);
    expect(await page.evaluate(() => window.AnalyzeSection.getCoachReviewProjection().fen)).toBe(sourceFen);
    const final = await flowProof(page);
    expect(final.boardRootStable).toBe(true); expect(final.squaresStable).toBe(true);
    runtime.assertClean();
});
