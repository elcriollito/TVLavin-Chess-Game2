import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, monitorRuntime, playMove } from '../play/playwright-helpers.js';

const PHONES = [
    { width: 390, height: 844, layout: 'phone-standard', orientation: 'portrait' },
    { width: 430, height: 932, layout: 'phone-standard', orientation: 'portrait' },
    { width: 844, height: 390, layout: 'phone-landscape', orientation: 'landscape' },
    { width: 932, height: 430, layout: 'phone-landscape', orientation: 'landscape' }
];

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => instrumentPlay(page, {
    delayMs: 35,
    scores: [34, 21, 52, -18, 41],
    bestMoves: ['e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6']
}));

const settle = page => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function setPhone(page, viewport) {
    await page.setViewportSize(viewport);
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', viewport.layout);
    await page.locator('#mainContent').evaluate(node => node.scrollTo(0, 0));
    await settle(page);
}

async function rememberBoard(page) {
    await page.evaluate(() => {
        const root = document.querySelector('#chessboard .caissa-board');
        window.__coachC1Board = { root, squares: [...root.querySelectorAll('.caissa-board__square')] };
    });
}

async function phoneProof(page) {
    return page.evaluate(() => {
        const visible = node => !!node && node.getClientRects().length > 0
            && getComputedStyle(node).visibility !== 'hidden';
        const box = node => {
            const rect = node?.getBoundingClientRect();
            return rect && { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
                width: rect.width, height: rect.height };
        };
        const shell = document.querySelector('[data-caissa-simplified-shell]');
        const workspace = shell.querySelector('.caissa-simplified-shell__workspace');
        const board = document.querySelector('#chessboard .caissa-board');
        const stage = shell.querySelector('.caissa-simplified-shell__board-stage');
        const context = shell.querySelector('.caissa-simplified-shell__context');
        const outerBody = shell.querySelector('.caissa-simplified-shell__context-body');
        const slot = shell.querySelector('[data-caissa-phase-action-slot]');
        const head = shell.querySelector('[data-caissa-coach-head-wrap]');
        const body = shell.querySelector('[data-caissa-coach-body-wrap]');
        const foot = shell.querySelector('[data-caissa-coach-foot-wrap]');
        const nativeFoot = shell.querySelector('[data-caissa-coach-foot]');
        const actions = shell.querySelector('.caissa-simplified-shell__board-actions');
        const identity = window.__coachC1Board;
        const actionButtons = [...actions.querySelectorAll('[data-active-game-action]')].filter(visible);
        const modeButtons = [...foot.querySelectorAll('[data-shell-mode]')].filter(visible);
        const scrollCandidates = [...document.querySelectorAll(
            '.content-area, #mainContent, #playSection, .caissa-simplified-shell__context, '
            + '.caissa-simplified-shell__context-body, .caissa-native-coach-panel, '
            + '[data-caissa-coach-body-wrap], .caissa-coach-guided__notation')];
        const floating = [...document.querySelectorAll(
            '[data-caissa-floating-controls], .caissa-mentor-shell, .caissa-manual-qa'
        )].filter(visible);
        const hiddenFocusTargets = [...document.querySelectorAll(
            '.caissa-mentor-shell button, .caissa-mentor-shell a, .caissa-manual-qa button, .caissa-manual-qa a'
        )].filter(visible);
        return {
            layout: shell.dataset.layout,
            release: shell.dataset.mobile2Release,
            state: shell.dataset.uiState,
            placement: shell.dataset.activeActionPlacement,
            scrollOwner: shell.dataset.scrollOwner,
            phoneClass: document.body.classList.contains('caissa-play-phone-layout'),
            shell: box(shell), workspace: box(workspace), board: box(board), stage: box(stage),
            context: box(context), slot: box(slot), head: box(head), body: box(body), foot: box(foot),
            actions: box(actions),
            boardCount: [...document.querySelectorAll('#playSection #chessboard .caissa-board')].filter(visible).length,
            squareCount: board.querySelectorAll('.caissa-board__square').length,
            rootStable: !identity || identity.root === board,
            squaresStable: !identity || identity.squares.every((square, index) =>
                square === board.querySelectorAll('.caissa-board__square')[index]),
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            pageScrollTop: document.getElementById('mainContent').scrollTop,
            outerScrollTop: document.getElementById('playSection').scrollTop,
            outerOverflow: getComputedStyle(document.getElementById('playSection')).overflowY,
            outerBodyOverflow: getComputedStyle(outerBody).overflowY,
            bodyOverflow: getComputedStyle(body).overflowY,
            bodyClientHeight: body.clientHeight,
            bodyScrollHeight: body.scrollHeight,
            activeScrollOwners: scrollCandidates.filter(node => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY))
                .map(node => node.getAttribute('data-caissa-coach-body-wrap') !== null
                    ? 'coach-body-wrap' : node.className || node.id),
            legacyHeight: document.querySelector('#playSection .main-content.cais-grid')?.getBoundingClientRect().height || 0,
            floatingVisible: floating.length,
            hiddenFocusTargets: hiddenFocusTargets.length,
            phaseShell: shell.hasAttribute('data-coach-mobile-phase-shell'),
            slotVisible: visible(slot),
            headVisible: visible(head),
            bodyVisible: visible(body),
            footVisible: visible(foot),
            nativeFootVisible: visible(nativeFoot),
            actionsVisible: visible(actions),
            actionsInSlot: actions.parentElement === slot,
            actionNames: actionButtons.map(button => button.dataset.activeGameAction),
            minActionHeight: actionButtons.length ? Math.min(...actionButtons.map(button => button.getBoundingClientRect().height)) : null,
            footLabels: modeButtons.map(button => button.textContent.trim().replace(/\s+/g, ' ')),
            minFootHeight: modeButtons.length ? Math.min(...modeButtons.map(button => button.getBoundingClientRect().height)) : null
        };
    });
}

async function assertPhoneFrame(page, viewport, state) {
    await setPhone(page, viewport);
    const proof = await phoneProof(page);
    expect(proof, JSON.stringify({ viewport, state, proof }, null, 2)).toMatchObject({
        layout: viewport.layout,
        release: 'approved',
        scrollOwner: 'document',
        phoneClass: true,
        boardCount: 1,
        squareCount: 64,
        rootStable: true,
        squaresStable: true,
        horizontalOverflow: 0,
        outerScrollTop: 0,
        outerOverflow: 'visible',
        outerBodyOverflow: 'visible',
        bodyOverflow: 'visible',
        legacyHeight: 0,
        floatingVisible: 0,
        hiddenFocusTargets: 0,
        phaseShell: true,
        headVisible: true,
        bodyVisible: true,
        footVisible: true,
        nativeFootVisible: false,
        footLabels: ['Play Game', 'Play Bots', 'Play Coach']
    });
    expect(proof.activeScrollOwners).toEqual(['content-area']);
    expect(Math.abs(proof.board.width - proof.board.height)).toBeLessThanOrEqual(1);
    expect(proof.board.top).toBeGreaterThanOrEqual(0);
    expect(proof.board.bottom).toBeLessThanOrEqual(viewport.height);
    expect(proof.bodyClientHeight).toBeGreaterThanOrEqual(44);
    expect(proof.bodyScrollHeight).toBeGreaterThanOrEqual(proof.bodyClientHeight);
    expect(proof.minFootHeight).toBeGreaterThanOrEqual(44);
    expect(Math.abs(proof.foot.bottom - viewport.height)).toBeLessThanOrEqual(1);
    expect(proof.head.bottom).toBeLessThanOrEqual(proof.body.top + 6);
    expect(proof.stage.right).toBeLessThanOrEqual(viewport.width);
    expect(proof.stage.bottom).toBeLessThanOrEqual(proof.head.top + 1);
    if (state === 'active') {
        expect(proof.actionNames).toEqual(['resign', 'coach-hint', 'coach-undo', 'menu']);
        expect(proof.minActionHeight).toBeGreaterThanOrEqual(44);
        expect(proof.actions.bottom).toBeLessThanOrEqual(viewport.height);
        expect(proof.placement).toBe('phase-action-slot');
        expect(proof.slotVisible).toBe(true);
        expect(proof.actionsInSlot).toBe(true);
        expect(proof.actions.top).toBeGreaterThanOrEqual(proof.board.bottom);
        if (viewport.orientation === 'portrait') {
            expect(proof.actions.bottom).toBeLessThanOrEqual(proof.head.top + 1);
        } else {
            expect(proof.actions.bottom).toBeLessThanOrEqual(proof.head.top + 1);
        }
    } else if (['guided-review', 'manual-analysis'].includes(state)) {
        expect(proof.slotVisible).toBe(true);
    } else {
        expect(proof.slotVisible).toBe(false);
    }
    return proof;
}

async function assertTargetReachable(page, selector) {
    const owner = page.locator('#mainContent');
    await page.locator(selector).evaluate(node => {
        const scroller = document.getElementById('mainContent');
        const foot = document.querySelector('[data-caissa-coach-foot-wrap]').getBoundingClientRect();
        const target = node.getBoundingClientRect();
        scroller.scrollTop += target.top - Math.max(8, (foot.top - target.height) / 2);
    });
    await settle(page);
    const result = await page.locator(selector).evaluate(node => {
        const rect = node.getBoundingClientRect();
        const menuRect = document.getElementById('mobileNavToggle')?.getBoundingClientRect();
        const overlapsMenu = !!menuRect && rect.left < menuRect.right && rect.right > menuRect.left
            && rect.top < menuRect.bottom && rect.bottom > menuRect.top;
        const point = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
            top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
            height: rect.height, fullyVisible: rect.top >= 0 && rect.bottom <= innerHeight
                && rect.left >= 0 && rect.right <= innerWidth,
            overlapsMenu,
            hittable: point === node || node.contains(point)
        };
    });
    expect(result, selector).toMatchObject({ fullyVisible: true, overlapsMenu: false, hittable: true });
    expect(result.height).toBeGreaterThanOrEqual(44);
    return result;
}

async function assertStateMatrix(page, state, targetSelector) {
    const tops = [];
    for (const viewport of PHONES) {
        const proof = await assertPhoneFrame(page, viewport, state);
        tops.push({ viewport, top: proof.board.top });
        if (targetSelector) await assertTargetReachable(page, targetSelector);
        await page.locator('#mainContent').evaluate(node => node.scrollTo(0, 0)); await settle(page);
        const before = await phoneProof(page);
        await page.locator('#mainContent').evaluate(node => node.scrollTo({
            top: Math.min(200, node.scrollHeight - node.clientHeight), behavior: 'instant'
        }));
        await settle(page);
        const after = await phoneProof(page);
        if (after.pageScrollTop > 0) {
            expect(after.board.top).toBeLessThan(before.board.top);
            expect(after.head.top).toBeLessThan(before.head.top);
        }
        expect(Math.abs(after.board.width - before.board.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(after.head.height - before.head.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(after.foot.top - before.foot.top)).toBeLessThanOrEqual(1);
        await page.locator('#mainContent').evaluate(node => node.scrollTo(0, 0));
    }
    return tops;
}

async function coachReviewProof(page) {
    return page.evaluate(() => {
        const visible = node => !!node && node.getClientRects().length > 0
            && getComputedStyle(node).visibility !== 'hidden';
        const rect = node => { const box = node?.getBoundingClientRect(); return box && {
            top: box.top, bottom: box.bottom, left: box.left, right: box.right,
            width: box.width, height: box.height }; };
        const board = document.querySelector('#chessboard .caissa-board');
        const boardOuter = document.getElementById('chessboard');
        const navigation = document.querySelector('[data-mobile-review-navigation]');
        const slot = document.querySelector('[data-caissa-phase-action-slot]');
        const outerBody = document.querySelector('.caissa-simplified-shell__context-body');
        const body = document.querySelector('[data-caissa-coach-body-wrap]');
        const head = document.querySelector('[data-caissa-coach-head-wrap]');
        const foot = document.querySelector('[data-caissa-coach-foot-wrap]');
        const visibleBodyActions = [...document.querySelectorAll(
            '[data-caissa-coach-body-wrap] > [data-caissa-coach-foot-content]:not([hidden]) button')]
            .filter(visible);
        const visibleModeButtons = [...foot.querySelectorAll('[data-shell-mode]')].filter(visible);
        const scrollCandidates = [...document.querySelectorAll(
            '.content-area, #mainContent, #playSection, .caissa-simplified-shell__context, '
            + '.caissa-simplified-shell__context-body, .caissa-native-coach-panel, '
            + '[data-caissa-coach-body-wrap], .caissa-coach-guided__notation')];
        return {
            board: rect(board), boardOuter: rect(boardOuter), navigation: rect(navigation),
            slot: rect(slot), head: rect(head), body: rect(body), foot: rect(foot),
            boardRootStable: board === window.__coachC1Board.root,
            squaresStable: window.__coachC1Board.squares.every((node, index) =>
                node === board.querySelectorAll('.caissa-board__square')[index]),
            navCount: document.querySelectorAll('[data-mobile-review-navigation]').length,
            navInSlot: navigation?.parentElement === slot,
            navGap: navigation ? navigation.getBoundingClientRect().top - boardOuter.getBoundingClientRect().bottom : null,
            navLabels: navigation ? [...navigation.querySelectorAll('button')].filter(visible)
                .map(node => node.getAttribute('aria-label')) : [],
            minNavHeight: navigation ? Math.min(...[...navigation.querySelectorAll('button')]
                .filter(visible).map(node => node.getBoundingClientRect().height)) : null,
            bodyActionLabels: visibleBodyActions.map(node => node.textContent.trim().replace(/\s+/g, ' ')),
            footerLabels: visibleModeButtons.map(node => node.textContent.trim().replace(/\s+/g, ' ')),
            minFooterHeight: Math.min(...visibleModeButtons.map(node => node.getBoundingClientRect().height)),
            outerBodyOverflow: getComputedStyle(outerBody).overflowY,
            bodyOverflow: getComputedStyle(body).overflowY,
            outerOverflow: getComputedStyle(document.getElementById('playSection')).overflowY,
            activeScrollOwners: scrollCandidates.filter(node => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY))
                .map(node => node.getAttribute('data-caissa-coach-body-wrap') !== null
                    ? 'coach-body-wrap' : node.className || node.id),
            outerScrollTop: document.getElementById('playSection').scrollTop,
            windowScrollY: window.scrollY
        };
    });
}

async function assertCoachReviewNavigation(page, phase) {
    for (const viewport of PHONES) {
        await setPhone(page, viewport);
        const samples = [await coachReviewProof(page)];
        const navigation = page.locator('[data-mobile-review-navigation]');
        console.log(`COACH_C1R_ENTRY ${phase} ${viewport.width}x${viewport.height} ${JSON.stringify(samples[0])}`);
        await expect(navigation).toBeVisible();
        const labels = samples[0].navLabels.join(' ');
        expect(labels).toMatch(/First|start/i);
        expect(labels).toMatch(/Previous/i);
        expect(labels).toMatch(/Next/i);
        expect(labels).toMatch(/Last|end/i);
        for (const name of [/First|start/i, /Next/i, /Last|end/i, /Previous/i]) {
            const button = navigation.getByRole('button', { name });
            if (!await button.isDisabled()) {
                await button.click(); await settle(page); samples.push(await coachReviewProof(page));
            }
        }
        const boardDelta = Math.max(...samples.map(sample => sample.board.height))
            - Math.min(...samples.map(sample => sample.board.height));
        const navDelta = Math.max(...samples.map(sample => sample.navigation.height))
            - Math.min(...samples.map(sample => sample.navigation.height));
        const footDelta = Math.max(...samples.map(sample => sample.foot.top))
            - Math.min(...samples.map(sample => sample.foot.top));
        console.log(`COACH_C1R_REVIEW ${phase} ${viewport.width}x${viewport.height} board=${boardDelta} nav=${navDelta}`);
        expect(boardDelta).toBeLessThanOrEqual(1);
        expect(navDelta).toBeLessThanOrEqual(1.1);
        expect(footDelta).toBeLessThanOrEqual(1);
        for (const proof of samples) {
            expect(proof).toMatchObject({ boardRootStable: true, squaresStable: true,
                navCount: 1, navInSlot: true, outerBodyOverflow: 'visible', bodyOverflow: 'visible',
                outerOverflow: 'visible', outerScrollTop: 0, windowScrollY: 0 });
            expect(proof.navGap).toBeGreaterThanOrEqual(3);
            expect(proof.navGap).toBeLessThanOrEqual(8);
            expect(proof.navLabels).toHaveLength(4);
            expect(proof.minNavHeight).toBeGreaterThanOrEqual(44);
            expect(proof.activeScrollOwners).toEqual(['content-area']);
            expect(proof.footerLabels).toEqual(['Play Game', 'Play Bots', 'Play Coach']);
            expect(proof.minFooterHeight).toBeGreaterThanOrEqual(44);
            expect(proof.navigation.bottom).toBeLessThanOrEqual(proof.head.top + 1);
            expect(proof.head.bottom).toBeLessThanOrEqual(proof.body.top + 6);
        }
        expect(samples[0].bodyActionLabels).toEqual(phase === 'guided-review'
            ? ['New Game', 'Analysis'] : ['Back to Review', 'Engine Off']);
    }
}

test('COACH-C1 fresh load, setup, active game, and rotation keep board-first phone composition', async ({ page }) => {
    test.setTimeout(120_000);
    const runtime = monitorRuntime(page);
    await page.addInitScript(() => {
        window.__coachC1MarkerTransitions = [];
        window.__coachC1FloatingFrames = [];
        const marker = () => window.__coachC1MarkerTransitions.push(
            document.documentElement?.classList.contains('caissa-initial-phone-coach') === true);
        const visible = node => !!node && node.getClientRects().length > 0
            && getComputedStyle(node).visibility !== 'hidden';
        const selector = '[data-caissa-floating-controls], .caissa-mentor-shell, .caissa-manual-qa';
        new MutationObserver(records => {
            marker();
            for (const record of records) for (const added of record.addedNodes) {
                if (added.nodeType !== 1) continue;
                const nodes = [added, ...added.querySelectorAll?.(selector) || []].filter(node => node.matches?.(selector));
                for (const node of nodes) {
                    window.__coachC1FloatingFrames.push(visible(node));
                    requestAnimationFrame(() => window.__coachC1FloatingFrames.push(visible(node)));
                }
            }
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });

    await page.setViewportSize(PHONES[0]);
    await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-caissa-native-coach-panel]')).toBeVisible();
    await rememberBoard(page);
    await assertStateMatrix(page, 'setup', '[data-coach-primary]');
    const firstPaint = await page.evaluate(() => ({
        marker: window.__coachC1MarkerTransitions,
        floating: window.__coachC1FloatingFrames
    }));
    expect(firstPaint.marker).toContain(true);
    expect(firstPaint.floating.length).toBeGreaterThan(0);
    expect(firstPaint.floating.some(Boolean)).toBe(false);

    await setPhone(page, PHONES[0]);
    await assertTargetReachable(page, '[data-coach-primary]');
    await page.locator('[data-coach-primary]').click();
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-ui-state', 'active');
    await expect.poll(() => page.locator('[data-caissa-coach-body-wrap]').evaluate(node => node.scrollTop)).toBe(0);
    await assertStateMatrix(page, 'active', null);
    await setPhone(page, PHONES[0]);
    await setPhone(page, PHONES[2]);
    await setPhone(page, PHONES[0]);
    const rotated = await phoneProof(page);
    expect(rotated).toMatchObject({ rootStable: true, squaresStable: true, squareCount: 64,
        placement: 'phase-action-slot', outerScrollTop: 0 });

    await page.locator('[data-active-game-action="coach-hint"]').focus();
    await expect(page.locator('[data-active-game-action="coach-hint"]')).toBeFocused();
    const axe = await new AxeBuilder({ page }).include('#playSection').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    runtime.assertClean();
});

test('COACH-C1R game over, summary, guided review, manual analysis, and back use the shared shell', async ({ page }) => {
    test.setTimeout(180_000);
    const runtime = monitorRuntime(page);
    await page.setViewportSize(PHONES[0]);
    await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-caissa-native-coach-panel]')).toBeVisible();
    await rememberBoard(page);
    await assertTargetReachable(page, '[data-coach-primary]');
    await page.locator('[data-coach-primary]').click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length), { timeout: 15_000 })
        .toBeGreaterThanOrEqual(1);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
    await expect.poll(() => page.locator('[data-caissa-coach-body-wrap]').evaluate(node => node.scrollTop)).toBe(0);
    await assertStateMatrix(page, 'game-over', '[data-post-game-action="analyze"]');

    await setPhone(page, PHONES[0]);
    await assertTargetReachable(page, '[data-post-game-action="analyze"]');
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('[data-caissa-coach-review-summary]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection?.analysisPhase || 'loading'),
        { timeout: 30_000 }).toBe('complete');
    await expect(page.locator('[data-coach-review-guided-action]')).toBeEnabled();
    await assertStateMatrix(page, 'evaluation-summary', '[data-coach-review-guided-action]');

    await setPhone(page, PHONES[0]);
    await assertTargetReachable(page, '[data-coach-review-guided-action]');
    await page.locator('[data-coach-review-guided-action]').click();
    await expect(page.locator('[data-caissa-coach-guided-review]')).toBeVisible();
    await assertCoachReviewNavigation(page, 'guided-review');
    await assertStateMatrix(page, 'guided-review', '[data-coach-guided-analysis]');

    await setPhone(page, PHONES[0]);
    await assertTargetReachable(page, '[data-coach-guided-analysis]');
    await page.locator('[data-coach-guided-analysis]').click();
    await expect(page.locator('[data-coach-analysis-exploration]')).toBeVisible();
    await assertCoachReviewNavigation(page, 'manual-analysis');
    await assertStateMatrix(page, 'manual-analysis', '[data-coach-exploration-engine]');
    await assertTargetReachable(page, '[data-coach-exploration-back]');
    const engine = page.locator('[data-coach-exploration-engine]');
    await engine.focus();
    await expect(engine).toBeFocused();
    await engine.click();
    await expect(engine).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-coach-exploration-back]').click();
    await expect(page.locator('[data-coach-guided-view]')).toBeVisible();
    await expect(page.locator('.caissa-simplified-shell__phase-action-slot > [data-mobile-review-navigation]')).toBeVisible();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', 'desktop-split');
    await expect(page.locator('[data-mobile-review-navigation]')).toHaveCount(0);
    await expect(page.locator('[data-coach-guided-foot-review] .analyze-board-navigation')).toBeVisible();
    await setPhone(page, PHONES[0]);
    await expect(page.locator('.caissa-simplified-shell__phase-action-slot > [data-mobile-review-navigation]')).toBeVisible();

    const axe = await new AxeBuilder({ page }).include('#playSection').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    runtime.assertClean();
});

test('COACH-C1 desktop Coach composition remains unchanged', async ({ page }) => {
    test.setTimeout(90_000);
    for (const viewport of [
        { width: 1366, height: 768 },
        { width: 1600, height: 1000 },
        { width: 3840, height: 2160 }
    ]) {
        await page.setViewportSize(viewport);
        await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
        const shell = page.locator('[data-caissa-simplified-shell]');
        await expect(shell).toBeVisible();
        await expect(shell).not.toHaveAttribute('data-layout', /phone-/);
        await expect(shell).toHaveAttribute('data-mobile2-release', 'approved');
        await expect(page.locator('body')).not.toHaveClass(/caissa-play-phone-layout/);
        await expect(page.locator('.caissa-simplified-shell__purpose')).toBeVisible();
        await expect(page.locator('#chessboard .caissa-board__square')).toHaveCount(64);
        await page.locator('[data-coach-primary]').click();
        await expect(shell).toHaveAttribute('data-active-action-placement', 'context-foot');
        await expect(page.locator('[data-active-game-action="menu"]')).toBeHidden();
        await expect(page.locator('#chessboard .caissa-board')).toBeVisible();
        await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    }
});
