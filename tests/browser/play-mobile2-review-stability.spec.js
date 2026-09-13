import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

const VIEWPORTS = [
    { width: 390, height: 844, layout: 'phone-standard' },
    { width: 430, height: 932, layout: 'phone-standard' },
    { width: 844, height: 390, layout: 'phone-landscape' },
    { width: 932, height: 430, layout: 'phone-landscape' }
];

test.beforeEach(async ({ page }) => instrumentPlay(page));

async function playOneMoveAndResign(page, route, startSelector, onActive = null) {
    await page.setViewportSize(VIEWPORTS[0]);
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.locator(startSelector).click();
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-ui-state', 'active');
    if (onActive) await onActive();
    await page.locator('#chessboard .caissa-board__square[data-square="e2"]').click();
    await page.locator('#chessboard .caissa-board__square[data-square="e4"]').click();
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
}

async function analyzeToSummary(page) {
    const analyze = page.locator('[data-post-game-action="analyze"]');
    await expect(analyze).toBeVisible();
    await analyze.click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection?.analysisPhase || 'loading'),
        { timeout: 30_000 }).toBe('complete');
    await expect(page.getByRole('button', { name: 'Start Review', exact: true })).toBeVisible();
}

async function reviewGeometry(page) {
    return page.evaluate(() => {
        const board = document.querySelector('#chessboard .caissa-board');
        const outer = document.querySelector('#chessboard');
        const navigation = document.querySelector('[data-mobile-review-navigation]');
        const boardRect = board.getBoundingClientRect(); const outerRect = outer.getBoundingClientRect();
        const navRect = navigation.getBoundingClientRect();
        const squares = [...board.querySelectorAll('.caissa-board__square')];
        const squareRects = squares.map(node => node.getBoundingClientRect());
        const visibleButtons = [...navigation.querySelectorAll('button')]
            .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
        return {
            layout: document.querySelector('[data-caissa-simplified-shell]').dataset.layout,
            navCount: document.querySelectorAll('[data-mobile-review-navigation]').length,
            squareCount: squares.length,
            allSquaresInside: squareRects.every(rect => rect.left >= boardRect.left - .5
                && rect.top >= boardRect.top - .5 && rect.right <= boardRect.right + .5
                && rect.bottom <= boardRect.bottom + .5),
            boardSquare: Math.abs(boardRect.width - boardRect.height) <= 1,
            boardInsideViewport: boardRect.left >= 0 && boardRect.top >= 0
                && boardRect.right <= innerWidth && boardRect.bottom <= innerHeight,
            board: { width: boardRect.width, height: boardRect.height, top: boardRect.top, bottom: boardRect.bottom },
            navDirectlyAfterBoard: navigation.parentElement?.classList.contains('caissa-simplified-shell__board-stage')
                && navRect.top >= outerRect.bottom - 1 && navRect.top - outerRect.bottom <= 8,
            navInsideViewport: navRect.left >= 0 && navRect.right <= innerWidth
                && navRect.top >= 0 && navRect.bottom <= innerHeight + 1,
            navButtons: visibleButtons.map(button => button.getAttribute('aria-label')),
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            rootStable: window.__m2003cBoard === board,
            squaresStable: window.__m2003cSquares.every((node, index) => node === squares[index])
        };
    });
}

async function assertReviewMatrix(page) {
    await page.evaluate(() => {
        window.__m2003cBoard = document.querySelector('#chessboard .caissa-board');
        window.__m2003cSquares = [...document.querySelectorAll('#chessboard .caissa-board__square')];
    });
    for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', viewport.layout);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const proof = await reviewGeometry(page);
        console.log(`M2_003C_REVIEW_GEOMETRY ${viewport.width}x${viewport.height} ${JSON.stringify(proof)}`);
        expect(proof, JSON.stringify({ viewport, proof }, null, 2)).toMatchObject({
            layout: viewport.layout, squareCount: 64, allSquaresInside: true, boardSquare: true,
            boardInsideViewport: true, navDirectlyAfterBoard: true, navInsideViewport: true,
            navCount: 1, horizontalOverflow: 0, rootStable: true, squaresStable: true
        });
        expect(proof.navButtons).toHaveLength(4);
        expect(proof.navButtons.join(' ')).toMatch(/First|start/i);
        expect(proof.navButtons.join(' ')).toMatch(/Previous/i);
        expect(proof.navButtons.join(' ')).toMatch(/Next/i);
        expect(proof.navButtons.join(' ')).toMatch(/Last|end/i);
    }
}

async function assertBoardMatrix(page, state) {
    await page.evaluate(() => {
        window.__m2003cBoard = document.querySelector('#chessboard .caissa-board');
        window.__m2003cSquares = [...document.querySelectorAll('#chessboard .caissa-board__square')];
    });
    for (const viewport of [...VIEWPORTS, VIEWPORTS[0], { width: 1600, height: 1000, layout: 'desktop-split' }]) {
        await page.setViewportSize(viewport);
        await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', viewport.layout);
        const proof = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            const board = document.querySelector('#chessboard .caissa-board');
            const boardRect = board.getBoundingClientRect();
            const squares = [...board.querySelectorAll('.caissa-board__square')];
            resolve({
                squareCount: squares.length,
                allSquaresInside: squares.every(node => { const rect = node.getBoundingClientRect();
                    return rect.left >= boardRect.left - .5 && rect.top >= boardRect.top - .5
                        && rect.right <= boardRect.right + .5 && rect.bottom <= boardRect.bottom + .5; }),
                boardInsideViewport: boardRect.left >= 0 && boardRect.top >= 0
                    && boardRect.right <= innerWidth && boardRect.bottom <= innerHeight,
                rootStable: window.__m2003cBoard === board,
                squaresStable: window.__m2003cSquares.every((node, index) => node === squares[index])
            });
        }))));
        expect(proof, `${state} ${viewport.width}x${viewport.height}`).toEqual({
            squareCount: 64, allSquaresInside: true, boardInsideViewport: true,
            rootStable: true, squaresStable: true
        });
    }
}

test.fixme('M2-003C Coach Mobile 2.0 review UX is held from this release', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
        window.__m2003cMentorFrames = [];
        window.__m2003cInitialMarkerFrames = [];
        const nativeToggle = DOMTokenList.prototype.toggle;
        DOMTokenList.prototype.toggle = function trackedToggle(token, force) {
            const outcome = nativeToggle.call(this, token, force);
            if (token === 'caissa-initial-phone-coach') window.__m2003cInitialMarkerFrames.push(outcome);
            return outcome;
        };
        new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                const floating = node.nodeType === 1 && (node.matches?.('[data-caissa-floating-controls], .caissa-mentor-shell')
                    ? node : node.querySelector?.('[data-caissa-floating-controls], .caissa-mentor-shell'));
                if (!floating) continue;
                const sample = frame => window.__m2003cMentorFrames.push({ frame,
                    visible: floating.getClientRects().length > 0 && getComputedStyle(floating).visibility !== 'hidden' });
                sample('created'); requestAnimationFrame(() => sample('first-raf'));
                }
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    });
    await playOneMoveAndResign(page, '/play/coach', '[data-caissa-native-coach-panel] button:has-text("Play")',
        () => assertBoardMatrix(page, 'active-coach-game'));
    await expect(page.locator('[data-post-game-action="analyze"]')).toHaveText('Analyze Game');
    await analyzeToSummary(page);
    await assertBoardMatrix(page, 'evaluation-summary');
    const cta = page.getByRole('button', { name: 'Start Review', exact: true });
    await cta.scrollIntoViewIfNeeded();
    expect(await cta.evaluate(node => { const rect = node.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight; })).toBe(true);
    await cta.click();
    await expect(page.locator('[data-coach-guided-move-comparison]')).toBeVisible();
    const evidence = await page.evaluate(() => {
        const index = window.AnalyzeSection.currentMoveIndex;
        const item = window.AnalyzeSection.analysisResults[index];
        return {
            played: document.querySelector('[data-coach-guided-played]').textContent,
            expectedPlayed: window.AnalyzeSection.getLoadedMoves()[index],
            best: document.querySelector('[data-coach-guided-best]').textContent,
            expectedBest: item.recommendationAvailable && item.bestMoveSan ? item.bestMoveSan : 'Not available',
            quality: document.querySelector('.caissa-coach-guided__classification').textContent,
            expectedQuality: (item.isBestMove ? 'Best' : item.quality).toUpperCase()
        };
    });
    expect(evidence).toMatchObject({ played: evidence.expectedPlayed, best: evidence.expectedBest,
        quality: evidence.expectedQuality });
    await assertReviewMatrix(page);
    await page.locator('[data-mobile-review-navigation] #analyzeNavFirst').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(-1);
    await page.locator('[data-mobile-review-navigation] #analyzeNavNext').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(0);
    await page.locator('[data-mobile-review-navigation] #analyzeNavPrev').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(-1);
    await page.locator('[data-mobile-review-navigation] #analyzeNavLast').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBeGreaterThanOrEqual(0);
    const frames = await page.evaluate(() => window.__m2003cMentorFrames);
    expect(await page.evaluate(() => window.__m2003cInitialMarkerFrames.some(Boolean))).toBe(true);
    expect(frames.every(frame => frame.visible === false)).toBe(true);
    const axe = await new AxeBuilder({ page }).include('#playSection').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});

test('M2-003C Play Game reuses one board-adjacent review navigation owner', async ({ page }) => {
    test.setTimeout(90_000);
    await playOneMoveAndResign(page, '/play', '[data-games-primary]');
    await analyzeToSummary(page);
    await page.getByRole('button', { name: 'Start Review', exact: true }).click();
    await expect(page.locator('[data-games-guided-move-comparison]')).toBeVisible();
    await assertReviewMatrix(page);
    expect(await page.locator('[data-mobile-review-navigation]').count()).toBe(1);
    expect(await page.locator('[data-bots-guided-nav]').count()).toBe(4);
});

test('M2-003D Play Bots uses the one board-adjacent canonical review navigation owner', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(VIEWPORTS[0]);
    await page.goto('/play/bots?simplified=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await page.getByRole('tab', { name: /^.*Advanced/ }).click();
    await page.getByLabel(/Vera, 1500 Elo target/).check();
    await page.locator('[data-bot-primary]').click();
    const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
    expect(await playMove(page, move.from, move.to)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await page.locator('[data-bots-primary-post-game-action]').click();
    const botsShell = page.locator('[data-caissa-bots-shell]');
    await expect(botsShell).toHaveAttribute('data-bot-shell-phase', 'analysis-summary');
    await expect(botsShell.locator('.caissa-bots-analysis-summary__review')).toBeEnabled({ timeout: 30_000 });
    await botsShell.locator('.caissa-bots-analysis-summary__review').click();
    await expect(botsShell).toHaveAttribute('data-bot-shell-phase', 'guided-review');
    await assertReviewMatrix(page);
    expect(await page.locator('[data-mobile-review-navigation]').count()).toBe(1);
    expect(await page.locator('[data-bots-guided-nav]').count()).toBe(4);
});

test.fixme('M2-003D Coach Mobile 2.0 first-frame correction is held from this release', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
        window.__m2003dFrames = [];
        const round = value => Math.round(value * 100) / 100;
        const sample = label => {
            const board = document.querySelector('#chessboard .caissa-board');
            const outer = document.querySelector('#chessboard');
            if (!board || !outer) return;
            const boardRect = board.getBoundingClientRect();
            const outerRect = outer.getBoundingClientRect();
            const squares = [...board.querySelectorAll('.caissa-board__square')];
            window.__m2003dFrames.push({
                label,
                board: [round(boardRect.left), round(boardRect.top), round(boardRect.width), round(boardRect.height)],
                outer: [round(outerRect.left), round(outerRect.top), round(outerRect.width), round(outerRect.height)],
                squareCount: squares.length,
                allSquaresInside: squares.every(node => {
                    const rect = node.getBoundingClientRect();
                    return rect.left >= boardRect.left - .5 && rect.top >= boardRect.top - .5
                        && rect.right <= boardRect.right + .5 && rect.bottom <= boardRect.bottom + .5;
                }),
                insideViewport: boardRect.left >= 0 && boardRect.top >= 0
                    && boardRect.right <= innerWidth && boardRect.bottom <= innerHeight,
                rendererRoot: board
            });
        };
        const beginWhenVisible = () => {
            const panel = document.querySelector('.caissa-native-coach-panel');
            const shell = document.querySelector('[data-caissa-simplified-shell]');
            if (!panel || !shell || shell.hidden) {
                requestAnimationFrame(beginWhenVisible);
                return;
            }
            if (window.__m2003dSampling) return;
            window.__m2003dSampling = true;
            sample('initial-dom-mount');
            requestAnimationFrame(() => {
                sample('first-animation-frame');
                let previous = null; let stableFrames = 0; let attempts = 0;
                const findStableFrame = () => requestAnimationFrame(() => {
                    const rect = document.querySelector('#chessboard .caissa-board')?.getBoundingClientRect();
                    const key = rect ? [rect.left, rect.top, rect.width, rect.height]
                        .map(value => round(value)).join(':') : '';
                    stableFrames = key && key === previous ? stableFrames + 1 : 0;
                    previous = key; attempts += 1;
                    if (stableFrames >= 1 || attempts >= 60) {
                        sample('first-stable-layout-frame');
                        setTimeout(() => sample('500ms-no-interaction'), 500);
                    } else findStableFrame();
                });
                findStableFrame();
            });
        };
        requestAnimationFrame(beginWhenVisible);
    });
    for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.caissa-native-coach-panel')).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__m2003dFrames?.length || 0), { timeout: 10_000 }).toBe(4);
        const beforeTap = await page.evaluate(() => window.__m2003dFrames.map(frame => ({ ...frame,
            rendererRoot: frame.rendererRoot === document.querySelector('#chessboard .caissa-board') })));
        // The phone Play heading is semantic-only in Mobile 2.0; use a neutral
        // viewport tap to prove no interaction-dependent geometry correction.
        await page.mouse.click(2, 2);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const afterTap = await page.evaluate(() => {
            const round = value => Math.round(value * 100) / 100;
            const board = document.querySelector('#chessboard .caissa-board');
            const rect = board.getBoundingClientRect();
            return [round(rect.left), round(rect.top), round(rect.width), round(rect.height)];
        });
        console.log(`M2_003D_COACH_INITIAL_GEOMETRY ${viewport.width}x${viewport.height} ${JSON.stringify({ beforeTap, afterTap })}`);
        const stable = beforeTap.find(frame => frame.label === 'first-stable-layout-frame');
        const idle = beforeTap.find(frame => frame.label === '500ms-no-interaction');
        expect(stable).toMatchObject({ squareCount: 64, allSquaresInside: true, insideViewport: true,
            rendererRoot: true });
        expect(stable.board[2]).toBe(stable.board[3]);
        expect(idle.board).toEqual(stable.board);
        expect(afterTap).toEqual(stable.board);
        expect(beforeTap.every(frame => frame.rendererRoot)).toBe(true);
    }
    await page.setViewportSize(VIEWPORTS[0]);
    await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => window.__m2003dFrames?.length || 0), { timeout: 10_000 }).toBe(4);
    const fresh = await page.evaluate(() => window.__m2003dFrames.find(frame => frame.label === 'first-stable-layout-frame').board);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => window.__m2003dFrames?.length || 0), { timeout: 10_000 }).toBe(4);
    const refreshed = await page.evaluate(() => window.__m2003dFrames.find(frame => frame.label === 'first-stable-layout-frame').board);
    expect(refreshed).toEqual(fresh);
});
