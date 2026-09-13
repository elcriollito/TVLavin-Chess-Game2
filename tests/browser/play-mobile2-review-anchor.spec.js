import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

const PORTRAIT = { width: 390, height: 844 };
const VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 932, height: 430 }
];

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page);
    await page.setViewportSize(PORTRAIT);
});

async function traceGeometry(page, mode, state, action) {
    const sample = await page.evaluate(({ mode, state, action }) => {
        const rect = selector => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const box = node.getBoundingClientRect();
            return { top: box.top, bottom: box.bottom, left: box.left, right: box.right,
                width: box.width, height: box.height };
        };
        const active = document.activeElement;
        const signature = active ? `${active.tagName.toLowerCase()}#${active.id || ''}.${[...active.classList].join('.')}` : null;
        const scroll = selector => {
            const node = document.querySelector(selector);
            return node ? { top: node.scrollTop, height: node.clientHeight, scrollHeight: node.scrollHeight,
                overflowY: getComputedStyle(node).overflowY } : null;
        };
        return {
            mode, state, action,
            scrollY: window.scrollY,
            viewportOffsetTop: window.visualViewport?.offsetTop ?? null,
            board: rect('#chessboard .caissa-board'),
            boardOuter: rect('#chessboard'),
            navigation: rect('[data-mobile-review-navigation]'),
            panel: rect('.caissa-games-panel, .caissa-bots-panel, .caissa-native-coach-panel'),
            commentary: rect('.caissa-coach-guided__message, .caissa-bots-guided__message'),
            notation: rect('.caissa-coach-guided__notation, .caissa-bots-guided__notation'),
            menu: rect('#mobileNavToggle'),
            menuPosition: (() => {
                const node = document.querySelector('#mobileNavToggle');
                if (!node) return null;
                const style = getComputedStyle(node); const box = node.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                return { position: style.position, top: style.top, bottom: style.bottom,
                    left: style.left, focusable: node.matches('button:not([disabled])'),
                    tappable: hit === node || node.contains(hit) };
            })(),
            hiddenFloatingFocusable: [...document.querySelectorAll('[data-caissa-floating-controls] :is(a,button,input,select,textarea,[tabindex])')]
                .some(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'),
            activeElement: signature,
            scrollOwners: {
                content: scroll('.content-area'),
                play: scroll('#playSection'),
                games: scroll('.caissa-games-panel__body'),
                bots: scroll('.caissa-bots-panel__body'),
                coach: scroll('.caissa-native-coach-panel__phase')
            }
        };
    }, { mode, state, action });
    console.log(`M2_003E_TRACE ${JSON.stringify(sample)}`);
    return sample;
}

async function assertPortraitTopContract(page, mode, state, expectedTop) {
    for (const viewport of VIEWPORTS.slice(0, 2)) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const sample = await traceGeometry(page, mode, state, `${state}-${viewport.width}x${viewport.height}`);
        expect(Math.abs(sample.board.top - expectedTop), `${mode} ${state} ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
        expect(sample.scrollY).toBe(0);
        expect(sample.scrollOwners.content?.top || 0).toBe(0);
        expect(sample.scrollOwners.play?.top || 0).toBe(0);
        expect(sample.menuPosition).toMatchObject({ position: 'fixed', focusable: true, tappable: true });
    }
    await page.setViewportSize(PORTRAIT);
}

async function assertAccessibleReview(page) {
    const menu = page.locator('#mobileNavToggle');
    await expect(menu).toHaveAttribute('aria-label', /navigation menu/i);
    const before = await page.evaluate(() => ({ window: scrollY,
        content: document.querySelector('.content-area')?.scrollTop || 0,
        play: document.getElementById('playSection')?.scrollTop || 0 }));
    await menu.focus();
    await expect(menu).toBeFocused();
    const after = await page.evaluate(() => ({ window: scrollY,
        content: document.querySelector('.content-area')?.scrollTop || 0,
        play: document.getElementById('playSection')?.scrollTop || 0 }));
    expect(after).toEqual(before);
    const axe = await new AxeBuilder({ page }).include('#playSection').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
}

async function playOneMoveAndResign(page, route, startSelector, onActive = null) {
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

async function analyzeToReview(page) {
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection?.analysisPhase || 'loading'),
        { timeout: 30_000 }).toBe('complete');
    const cta = page.getByRole('button', { name: 'Start Review', exact: true });
    await cta.click();
    await expect(page.locator('[data-mobile-review-navigation]')).toBeVisible();
}

async function exerciseNavigation(page, mode) {
    const actions = [
        ['first', /first|start/i],
        ['next', /next/i],
        ['first-2', /first|start/i],
        ['last', /last|end/i],
        ['previous', /previous/i],
        ['next-2', /next/i],
        ['first-3', /first|start/i],
        ['last-2', /last|end/i]
    ];
    await page.evaluate(() => {
        window.__m2003eBoard = document.querySelector('#chessboard .caissa-board');
        window.__m2003eSquares = [...document.querySelectorAll('#chessboard .caissa-board__square')];
    });
    for (const viewport of [...VIEWPORTS, PORTRAIT]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const samples = [await traceGeometry(page, mode, 'review', `entry-${viewport.width}x${viewport.height}`)];
        for (const [action, name] of actions) {
            const target = page.locator('[data-mobile-review-navigation]').getByRole('button', { name });
            expect(await target.isDisabled(), `${mode} ${action} must be available`).toBe(false);
            await target.click();
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            samples.push(await traceGeometry(page, mode, 'review', `${action}-${viewport.width}x${viewport.height}`));
        }
        const boardDelta = Math.max(...samples.map(x => x.board.top)) - Math.min(...samples.map(x => x.board.top));
        const navDelta = Math.max(...samples.map(x => x.navigation.top)) - Math.min(...samples.map(x => x.navigation.top));
        console.log(`M2_003E_DELTA ${mode} ${viewport.width}x${viewport.height} board=${boardDelta} nav=${navDelta}`);
        expect(boardDelta).toBeLessThanOrEqual(1);
        expect(navDelta).toBeLessThanOrEqual(1);
        expect(Math.abs(samples[0].board.top - (viewport.width > viewport.height ? 22 : 39))).toBeLessThanOrEqual(1);
        for (const sample of samples) {
            expect(sample.scrollY).toBe(0);
            expect(sample.viewportOffsetTop).toBe(0);
            expect(sample.scrollOwners.content?.top || 0).toBe(0);
            expect(sample.scrollOwners.play?.top || 0).toBe(0);
            expect(sample.activeElement).not.toMatch(/notation|commentary/);
            expect(sample.menuPosition).toMatchObject({ position: 'fixed', focusable: true, tappable: true });
            expect(sample.menu.bottom).toBeLessThanOrEqual(viewport.height);
            expect(viewport.height - sample.menu.bottom).toBeGreaterThanOrEqual(11);
            expect(sample.menu.left).toBeGreaterThanOrEqual(11);
            expect(sample.hiddenFloatingFocusable).toBe(false);
            expect(sample.navigation.top - sample.boardOuter.bottom).toBeGreaterThanOrEqual(3);
            expect(sample.navigation.top - sample.boardOuter.bottom).toBeLessThanOrEqual(8);
            const overlaps = (a, b) => a && b && a.left < b.right && a.right > b.left
                && a.top < b.bottom && a.bottom > b.top;
            expect(overlaps(sample.menu, sample.board)).toBe(false);
            expect(overlaps(sample.menu, sample.navigation)).toBe(false);
        }
        const persistent = await page.evaluate(() => {
            const board = document.querySelector('#chessboard .caissa-board');
            const squares = [...board.querySelectorAll('.caissa-board__square')];
            return { board: board === window.__m2003eBoard, count: squares.length,
                squares: squares.every((node, index) => node === window.__m2003eSquares[index]) };
        });
        expect(persistent).toEqual({ board: true, count: 64, squares: true });
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', 'desktop-split');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('#mobileNavToggle')).toBeHidden();
    expect(await page.locator('[data-mobile-review-navigation]').count()).toBe(0);
    expect(await page.evaluate(() => document.querySelector('#chessboard .caissa-board') === window.__m2003eBoard
        && [...document.querySelectorAll('#chessboard .caissa-board__square')]
            .every((node, index) => node === window.__m2003eSquares[index]))).toBe(true);
    await page.setViewportSize(PORTRAIT);
    await expect(page.locator('[data-mobile-review-navigation]')).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(Math.abs((await traceGeometry(page, mode, 'review', 'desktop-rotation-return')).board.top - 39)).toBeLessThanOrEqual(1);
}

test('M2-003E Play review anchor, menu, parity, and rotation contract', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/play', { waitUntil: 'domcontentloaded' });
    await assertPortraitTopContract(page, 'play', 'setup', 71);
    await page.locator('[data-games-primary]').click();
    await assertPortraitTopContract(page, 'play', 'active', 67);
    await page.locator('#chessboard .caissa-board__square[data-square="e2"]').click();
    await page.locator('#chessboard .caissa-board__square[data-square="e4"]').click();
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await analyzeToReview(page);
    await exerciseNavigation(page, 'play');
    await assertAccessibleReview(page);
});

test('M2-003E Bots review anchor, menu, parity, and rotation contract', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/play/bots?simplified=1', { waitUntil: 'domcontentloaded' });
    await assertPortraitTopContract(page, 'bots', 'setup', 71);
    await page.getByRole('tab', { name: /^.*Advanced/ }).click();
    await page.getByLabel(/Vera, 1500 Elo target/).check();
    await page.locator('[data-bot-primary]').click();
    await assertPortraitTopContract(page, 'bots', 'active', 67);
    const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
    expect(await playMove(page, move.from, move.to)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await page.locator('[data-bots-primary-post-game-action]').click();
    const shell = page.locator('[data-caissa-bots-shell]');
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'analysis-summary');
    await expect(shell.locator('.caissa-bots-analysis-summary__review')).toBeEnabled({ timeout: 30_000 });
    await shell.locator('.caissa-bots-analysis-summary__review').click();
    await expect(page.locator('[data-mobile-review-navigation]')).toBeVisible();
    await exerciseNavigation(page, 'bots');
    await assertAccessibleReview(page);
});

test.fixme('M2-003E Coach Mobile 2.0 review anchor is held from this release', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
    await assertPortraitTopContract(page, 'coach', 'setup', 71);
    await playOneMoveAndResign(page, '/play/coach', '[data-caissa-native-coach-panel] button:has-text("Play")',
        () => assertPortraitTopContract(page, 'coach', 'active', 67));
    await analyzeToReview(page);
    await exerciseNavigation(page, 'coach');
    await assertAccessibleReview(page);
});
