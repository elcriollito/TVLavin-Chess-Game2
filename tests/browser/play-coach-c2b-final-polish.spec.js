import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 932, height: 430 }
];

test.beforeEach(async ({ page }) => instrumentPlay(page));

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

async function openCoachSetup(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto('/play/beta/coach');
    await expect(page.locator('[data-caissa-native-coach-panel][data-coach-shell-phase="setup"]')).toBeVisible();
    await expect(page.locator('.caissa-simplified-shell[data-mode="coach"][data-layout^="phone-"]')).toBeVisible();
}

async function installGuidedReviewFixture(page) {
    await page.evaluate(() => {
        window.CaissaCoachReviewPresentation.unmount?.();
        const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];
        const qualities = ['Acceptable', 'Mistake', 'Acceptable', 'Inaccuracy', 'Acceptable', 'Blunder'];
        const moveList = document.createElement('div');
        moveList.id = 'analyzeMoveList';
        moves.forEach((move, index) => {
            const button = document.createElement('button');
            button.type = 'button'; button.dataset.index = String(index); button.textContent = move;
            moveList.append(button);
        });
        const navigation = document.createElement('div');
        navigation.className = 'analyze-board-navigation';
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
                this.currentMoveIndex = index;
                window.__coachC2bJumps.push(index);
                moveList.querySelectorAll('[data-index]').forEach(node => {
                    node.classList.toggle('active', Number(node.dataset.index) === index);
                });
            }
        };
        window.__coachC2bJumps = [];
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
    await page.getByRole('button', { name: 'Review Game', exact: true }).click();
    await expect(page.locator('[data-caissa-coach-shell][data-coach-shell-phase="guided-review"]')).toBeVisible();
}

function expectStableGeometry(before, after) {
    for (const key of ['board', 'navigation']) {
        for (const field of ['x', 'pageY', 'width', 'height'])
            expect(Math.abs(after[key][field] - before[key][field]), `${key}.${field}`).toBeLessThanOrEqual(1);
    }
    for (const field of ['x', 'pageY', 'width'])
        expect(Math.abs(after.head[field] - before.head[field]), `head.${field}`).toBeLessThanOrEqual(1);
    for (const field of ['x', 'y', 'width', 'height'])
        expect(Math.abs(after.foot[field] - before.foot[field]), `foot.${field}`).toBeLessThanOrEqual(1);
}

for (const viewport of VIEWPORTS) {
    test(`Coach Play As symbols fill the existing circles at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await openCoachSetup(page, viewport);
        const proof = await page.locator('.caissa-native-coach-panel__color-options').evaluate(options => {
            const snapshot = () => [...options.querySelectorAll('[data-coach-color-choice]')].map(input => {
                const token = input.nextElementSibling;
                const style = getComputedStyle(token); const circle = getComputedStyle(token, '::before');
                const box = token.getBoundingClientRect();
                return { value: input.value, name: input.getAttribute('aria-label'), symbol: token.textContent,
                    checked: input.checked, width: box.width, height: box.height, fontSize: parseFloat(style.fontSize),
                    lineHeight: parseFloat(style.lineHeight), display: style.display, placeItems: style.placeItems,
                    overflow: style.overflow, circleWidth: parseFloat(circle.width), circleHeight: parseFloat(circle.height),
                    borderRadius: circle.borderRadius };
            });
            const before = options.getBoundingClientRect();
            const forcedOld = document.createElement('style');
            forcedOld.textContent = '.caissa-native-coach-panel__color-choice > .caissa-color-token { font-size: 1.45rem !important; }';
            document.head.append(forcedOld); const old = options.getBoundingClientRect(); forcedOld.remove();
            const after = options.getBoundingClientRect();
            return { tokens: snapshot(), old: { width: old.width, height: old.height },
                before: { width: before.width, height: before.height }, after: { width: after.width, height: after.height } };
        });
        expect(proof.tokens.map(token => [token.value, token.name, token.symbol])).toEqual([
            ['white', 'White', '♔'], ['random', 'Random', '?'], ['black', 'Black', '♚']
        ]);
        expect(proof.tokens.map(token => token.checked)).toEqual([true, false, false]);
        for (const token of proof.tokens) {
            expect(token.height).toBeGreaterThanOrEqual(44);
            expect(token.width).toBeGreaterThanOrEqual(44);
            expect(token.circleWidth).toBe(30); expect(token.circleHeight).toBe(30);
            expect(token.fontSize / token.circleWidth).toBeGreaterThan(.85);
            expect(token.fontSize).toBeLessThanOrEqual(token.circleWidth * 1.12);
            expect(token.lineHeight).toBeCloseTo(token.fontSize, 1);
            expect(token.display).toBe('grid'); expect(token.placeItems).toBe('center');
            expect(token.overflow).toBe('visible'); expect(token.borderRadius).toBe('50%');
        }
        expect(proof.after).toEqual(proof.before);
        expect(proof.after).toEqual(proof.old);

        const white = page.locator('[data-coach-color-choice="white"]');
        const random = page.locator('[data-coach-color-choice="random"]');
        const black = page.locator('[data-coach-color-choice="black"]');
        await white.focus();
        await expect(white.locator('xpath=following-sibling::*[1]')).toHaveCSS('outline-style', 'solid');
        await white.press('ArrowRight'); await expect(random).toBeChecked();
        await random.press('ArrowRight'); await expect(black).toBeChecked();
        await expect(black.locator('xpath=following-sibling::*[1]')).not.toHaveCSS('box-shadow', 'none');
    });

    test(`guided review retains Next Moment and stable board, navigation, and FOOT at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await openCoachSetup(page, viewport);
        await installGuidedReviewFixture(page);
        const next = page.locator('[data-coach-guided-next]');
        const explain = page.locator('[data-coach-guided-explain]');
        await expect(explain).toBeVisible(); await expect(next).toBeVisible();
        await expect(explain).toHaveCSS('min-height', '44px'); await expect(next).toHaveCSS('min-height', '44px');
        await expect(next).toContainText('Next Moment'); await expect(next).toBeEnabled();
        await expect(next).toHaveAttribute('data-remaining-moments', '3');
        await expect(next).toHaveAttribute('aria-label', 'Next review-worthy moment');
        await expect(page.locator('[data-caissa-coach-body] .caissa-coach-guided__top-actions')).toContainText('Explain');

        const measure = () => page.evaluate(() => {
            const scrollTop = document.getElementById('mainContent').scrollTop;
            const box = selector => {
                const rect = document.querySelector(selector).getBoundingClientRect();
                return { x: rect.x, y: rect.y, pageY: rect.y + scrollTop,
                    width: rect.width, height: rect.height };
            };
            return { board: box('.caissa-simplified-shell__board-region'),
                navigation: box('[data-caissa-phase-action-slot] [data-mobile-review-navigation]'),
                head: box('[data-caissa-coach-head]'), foot: box('[data-caissa-coach-foot-wrap]') };
        });
        await centerAboveFoot(page, next);
        const before = await measure();
        await next.click();
        await expect.poll(() => page.evaluate(() => window.__coachC2bJumps)).toEqual([0, 1]);
        await expect(next).toContainText('Next Moment'); await expect(next).toBeEnabled();
        await expect(next).toHaveAttribute('data-remaining-moments', '2');
        expectStableGeometry(before, await measure());
        await centerAboveFoot(page, next);
        await next.click();
        await expect.poll(() => page.evaluate(() => window.__coachC2bJumps)).toEqual([0, 1, 3]);
        await expect(next).toContainText('Next Moment'); await expect(next).toBeEnabled();
        await expect(next).toHaveAttribute('data-remaining-moments', '1');
        expectStableGeometry(before, await measure());
        await centerAboveFoot(page, next);
        await next.click();
        await expect.poll(() => page.evaluate(() => window.__coachC2bJumps)).toEqual([0, 1, 3, 5]);
        await expect(next).toContainText('Review Complete'); await expect(next).toBeDisabled();
        await expect(next).toHaveAttribute('data-remaining-moments', '0');
        await expect(next).toHaveAttribute('aria-label', 'Review complete');
        await expect(explain).toBeVisible();
        expectStableGeometry(before, await measure());
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
            .toBeLessThanOrEqual(1);
    });
}

test('desktop Coach Play As sizing remains unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/play/beta/coach');
    const token = page.locator('[data-color-token="white"]');
    await expect(token).toBeVisible();
    expect(await token.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(20.3, 2);
    await expect(token).toHaveCSS('min-height', '44px');
});
