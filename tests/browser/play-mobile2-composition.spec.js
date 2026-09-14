import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';

const VIEWPORTS = [
    { width: 390, height: 844, layout: 'phone-standard', orientation: 'portrait' },
    { width: 430, height: 932, layout: 'phone-standard', orientation: 'portrait' },
    { width: 844, height: 390, layout: 'phone-landscape', orientation: 'landscape' },
    { width: 932, height: 430, layout: 'phone-landscape', orientation: 'landscape' }
];

const MODES = {
    games: { route: '/play', actions: ['resign', 'pgn', 'menu'] },
    bots: { route: '/play/bots', actions: ['resign', 'coach-hint', 'coach-undo', 'menu'] }
};

test.beforeEach(async ({ page }) => instrumentPlay(page));

async function settleLayout(page, viewport) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-layout', viewport.layout);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function openMode(page, mode) {
    await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
    await page.goto(MODES[mode].route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-caissa-simplified-shell]')).toBeVisible();
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-mobile2-release', 'approved');
    await expect(page.locator('#chessboard .caissa-board')).toBeVisible();
    if (mode === 'bots') await expect(page.locator('[data-caissa-bots-shell]')).toBeVisible();
    if (mode === 'coach') await expect(page.locator('[data-caissa-native-coach-panel]')).toBeVisible();
}

test('COACH-C3 Coach uses its approved phone composition in production', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[0]);
    await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
    const shell = page.locator('[data-caissa-simplified-shell]');
    await expect(shell).toBeVisible();
    await expect(shell).toHaveAttribute('data-mobile2-release', 'approved');
    await expect(page.locator('body')).toHaveClass(/caissa-play-phone-layout/);
    await expect(page.locator('.caissa-simplified-shell__purpose')).toBeAttached();
    await expect(page.locator('.caissa-simplified-shell__preview')).toHaveCSS('position', 'absolute');
    await expect(page.locator('#chessboard .caissa-board__square')).toHaveCount(64);
    await page.locator('[data-caissa-native-coach-panel]').getByRole('button', { name: 'Play' }).click();
    await expect(shell).toHaveAttribute('data-ui-state', 'active');
    await expect(shell).toHaveAttribute('data-active-action-placement', 'phase-action-slot');
    await expect(shell).toHaveAttribute('data-scroll-owner', 'document');
    await expect(page.locator('[data-active-game-action="menu"]')).toBeVisible();
});

async function startMode(page, mode) {
    if (mode === 'games') await page.locator('[data-games-primary]').click();
    else if (mode === 'bots') await page.locator('[data-bot-primary]').click();
    else await page.locator('[data-caissa-native-coach-panel]').getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-ui-state', 'active');
    await page.evaluate(() => {
        const root = document.querySelector('#chessboard .caissa-board');
        window.__m2CompositionIdentity = { root, squares: [...root.querySelectorAll('.caissa-board__square')] };
    });
}

async function compositionSnapshot(page) {
    return page.evaluate(() => {
        const visible = node => !!node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
        const rect = node => node?.getBoundingClientRect();
        const shell = document.querySelector('[data-caissa-simplified-shell]');
        const board = document.querySelector('#chessboard .caissa-board');
        const stage = shell.querySelector('.caissa-simplified-shell__board-stage');
        const context = shell.querySelector('.caissa-simplified-shell__context');
        const actions = shell.querySelector('.caissa-simplified-shell__board-actions');
        const boardBox = rect(board); const stageBox = rect(stage); const contextBox = rect(context); const actionBox = rect(actions);
        const identity = window.__m2CompositionIdentity;
        const visibleMenus = [...document.querySelectorAll(
            '[data-active-game-action="menu"], [data-mobile-action="menu"], summary'
        )].filter(node => visible(node) && node.textContent.trim() === 'Menu');
        const floating = [...document.querySelectorAll(
            '[data-caissa-floating-controls], .caissa-mentor-launcher, .caissa-manual-qa-launcher, .caissa-manual-qa'
        )];
        const utilities = [...actions.querySelectorAll('[data-active-game-action]')]
            .filter(visible).map(node => node.dataset.activeGameAction);
        const focusableSecondary = [...document.querySelectorAll(
            '.caissa-mentor-launcher, .caissa-manual-qa-launcher, .caissa-simplified-shell__utility-bar button'
        )].filter(visible);
        return {
            layout: shell.dataset.layout,
            state: shell.dataset.uiState,
            placement: shell.dataset.activeActionPlacement,
            phoneClass: document.body.classList.contains('caissa-play-phone-layout'),
            boardCount: [...document.querySelectorAll('#playSection #chessboard .caissa-board')].filter(visible).length,
            squareCount: board.querySelectorAll('.caissa-board__square').length,
            stableRoot: !identity || identity.root === board,
            stableSquares: !identity || identity.squares.every((node, index) =>
                node === board.querySelectorAll('.caissa-board__square')[index]),
            boardSquare: Math.abs(boardBox.width - boardBox.height) <= 1,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            utilities,
            visibleMenus: visibleMenus.length,
            floatingVisible: floating.filter(visible).length,
            focusableSecondary: focusableSecondary.length,
            actionsVisible: visible(actions),
            actionsInBoardStage: actions.parentElement === stage,
            actionsInContext: context.contains(actions),
            boardBeforeActions: !!actionBox && actionBox.top >= boardBox.bottom - 1,
            boardActionGap: actionBox ? actionBox.top - boardBox.bottom : null,
            firstViewport: !actionBox || actionBox.bottom <= innerHeight + 1,
            landscapeColumns: stageBox.right <= contextBox.left + 1,
            controlsReachable: !actionBox || (actionBox.left >= 0 && actionBox.right <= innerWidth + 1
                && actionBox.top >= 0 && actionBox.bottom <= innerHeight + 1)
        };
    });
}

async function assertSetupMatrix(page) {
    for (const viewport of VIEWPORTS) {
        await settleLayout(page, viewport);
        const proof = await compositionSnapshot(page);
        expect(proof, JSON.stringify(viewport)).toMatchObject({
            layout: viewport.layout, state: 'setup', placement: 'hidden', phoneClass: true,
            boardCount: 1, squareCount: 64, boardSquare: true, overflow: 0,
            actionsVisible: false, floatingVisible: 0, focusableSecondary: 0
        });
        if (viewport.orientation === 'landscape') expect(proof.landscapeColumns).toBe(true);
    }
}

async function assertActiveMatrix(page, mode) {
    for (const viewport of VIEWPORTS) {
        await settleLayout(page, viewport);
        const proof = await compositionSnapshot(page);
        expect(proof, JSON.stringify({ mode, viewport, proof }, null, 2)).toMatchObject({
            layout: viewport.layout, state: 'active', phoneClass: true,
            boardCount: 1, squareCount: 64, stableRoot: true, stableSquares: true,
            boardSquare: true, overflow: 0, utilities: MODES[mode].actions,
            visibleMenus: 1, floatingVisible: 0, focusableSecondary: 0
        });
        if (viewport.orientation === 'portrait') {
            expect(proof.placement).toBe('board');
            expect(proof.actionsInBoardStage).toBe(true);
            expect(proof.actionsInContext).toBe(false);
            expect(proof.boardBeforeActions).toBe(true);
            expect(proof.boardActionGap).toBeLessThanOrEqual(42);
            expect(proof.firstViewport).toBe(true);
        } else {
            expect(proof.placement).toBe('context-top');
            expect(proof.actionsInBoardStage).toBe(false);
            expect(proof.actionsInContext).toBe(true);
            expect(proof.landscapeColumns).toBe(true);
            expect(proof.controlsReachable, JSON.stringify(proof, null, 2)).toBe(true);
        }
    }
}

async function exerciseActiveControls(page, mode) {
    await settleLayout(page, VIEWPORTS[0]);
    await page.locator('#chessboard .caissa-board__square[data-square="e2"]').click();
    await page.locator('#chessboard .caissa-board__square[data-square="e4"]').click();
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => window.App.game.history()[0])).toBe('e4');
    if (mode !== 'games') {
        await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(2);
        const beforeHint = await page.evaluate(() => window.App.game.fen());
        await page.locator('[data-active-game-action="coach-hint"]').click();
        expect(await page.evaluate(() => window.App.game.fen())).toBe(beforeHint);
        await page.locator('[data-active-game-action="coach-undo"]').click();
        await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(0);
    }
    await page.locator('[data-active-game-action="menu"]').click();
    await expect(page.locator('#menuModal')).toHaveClass(/show|active|open/);
    await page.locator('#menuModal [data-modal="menuModal"]').click();
}

async function assertGameOverMatrix(page) {
    await settleLayout(page, VIEWPORTS[0]);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    for (const viewport of VIEWPORTS) {
        await settleLayout(page, viewport);
        const proof = await compositionSnapshot(page);
        expect(proof, JSON.stringify(viewport)).toMatchObject({
            layout: viewport.layout, state: 'postgame', placement: 'hidden', phoneClass: true,
            boardCount: 1, squareCount: 64, stableRoot: true, stableSquares: true,
            boardSquare: true, overflow: 0, actionsVisible: false,
            floatingVisible: 0, focusableSecondary: 0
        });
        await expect(page.locator('[data-post-game-action="mentor-review"]')).toBeHidden();
        await expect(page.locator('[data-post-game-action="mentor-summary"]')).toBeHidden();
        if (viewport.orientation === 'landscape') expect(proof.landscapeColumns).toBe(true);
    }
}

for (const mode of Object.keys(MODES)) {
    test(`M2-003B ${mode} setup, active, game-over and rotation preserve board-first phone composition`, async ({ page }) => {
        test.setTimeout(90_000);
        await openMode(page, mode);
        await assertSetupMatrix(page);
        await settleLayout(page, VIEWPORTS[0]);
        await startMode(page, mode);
        await assertActiveMatrix(page, mode);
        await settleLayout(page, VIEWPORTS[0]);
        await settleLayout(page, VIEWPORTS[2]);
        await settleLayout(page, VIEWPORTS[0]);
        expect(await compositionSnapshot(page)).toMatchObject({ stableRoot: true, stableSquares: true, placement: 'board' });
        await exerciseActiveControls(page, mode);
        const axe = await new AxeBuilder({ page }).include('[data-caissa-simplified-shell]').analyze();
        expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
        await assertGameOverMatrix(page);
    });
}

test('M2-003B desktop retains panel-owned action composition and floating utilities', async ({ page }) => {
    test.setTimeout(90_000);
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1600, height: 1000 }, { width: 3840, height: 2160 }]) {
        await page.setViewportSize(viewport);
        await page.goto('/play/bots', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-caissa-bots-shell]')).toBeVisible();
        await page.locator('[data-bot-primary]').click();
        await expect(page.locator('[data-caissa-simplified-shell]')).not.toHaveAttribute('data-layout', /phone-/);
        const proof = await compositionSnapshot(page);
        expect(proof).toMatchObject({
            state: 'active', placement: 'context-foot', phoneClass: false,
            actionsInBoardStage: false, actionsInContext: true, boardCount: 1,
            squareCount: 64, boardSquare: true, overflow: 0
        });
        expect(proof.floatingVisible).toBeGreaterThan(0);
        await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    }
});
