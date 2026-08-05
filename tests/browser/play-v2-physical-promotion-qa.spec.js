import { test, expect } from '@playwright/test';

const cases = [
    ['white-queen', 'a7', 'a8', 'q', 'white'], ['white-rook', 'a7', 'a8', 'r', 'white'],
    ['white-bishop', 'a7', 'a8', 'b', 'white'], ['white-knight', 'a7', 'a8', 'n', 'white'],
    ['black-queen', 'a2', 'a1', 'q', 'black'], ['black-rook', 'a2', 'a1', 'r', 'black'],
    ['black-bishop', 'a2', 'a1', 'b', 'black'], ['black-knight', 'a2', 'a1', 'n', 'black']
];

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { value: 1 }));
});

test('eight allowlisted cases use the real promotion and PostGame owners', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/beta/qa/promotion', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-physical-promotion-qa]')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaPhysicalPromotionQAHarness.inspect().workerCount)).toBe(0);
    for (const [id, from, to, piece, color] of cases) {
        await page.locator('#promotionQaCase').selectOption(id);
        await page.locator('[data-promotion-qa-start]').click();
        await page.locator(`#chessboard .square-${from}`).click();
        await page.locator(`#chessboard .square-${to}`).click();
        await expect(page.locator('#promotionModal')).toHaveClass(/show/);
        await page.locator(`.promotion-btn[data-piece="${piece}"]`).click();
        await expect(page.locator('[data-promotion-qa-status]')).toContainText('verified');
        const state = await page.evaluate(({ to, piece, color }) => ({
            placed: window.App.game.get(to), history: window.App.game.history(), pgn: window.App.game.pgn(),
            orientation: window.App.board.orientation(), boards: document.querySelectorAll('#chessboard .board-b72b1').length,
            clock: window.CaissaClockService.getSnapshot(), lifecycle: window.CaissaGameLifecycle.getSnapshot(),
            workerCount: window.CaissaPhysicalPromotionQAHarness.inspect().workerCount, active: window.App.gameActive
        }), { to, piece, color });
        expect(state.placed).toMatchObject({ type: piece, color: color[0] });
        expect(state.history.at(-1)).toContain(`=${piece.toUpperCase()}`);
        expect(state.pgn).toContain(state.history.at(-1));
        expect(state.orientation).toBe(color);
        expect(state.boards).toBe(1);
        expect(typeof state.clock.running).toBe('boolean');
        expect(['active', 'completed']).toContain(state.lifecycle.state);
        expect(state.workerCount).toBe(0);
        if (state.active) {
            page.once('dialog', dialog => dialog.accept());
            await page.locator('[data-promotion-qa-finish]').click();
            await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
        } else {
            expect(state.lifecycle.state).toBe('completed');
        }
    }
});

test('portrait and landscape remain contained with one board and no worker on entry', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await page.goto('/play/beta/qa/promotion', { waitUntil: 'domcontentloaded' });
        const geometry = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            boards: document.querySelectorAll('#chessboard .board-b72b1').length,
            workerCount: window.CaissaPhysicalPromotionQAHarness.inspect().workerCount
        }));
        expect(geometry).toEqual({ overflow: 0, boards: 1, workerCount: 0 });
    }
});

test('authorized harness remains same-origin and free of prohibited resources', async ({ page }) => {
    const requests = [];
    const violations = [];
    page.on('request', request => requests.push(request.url()));
    page.on('console', message => {
        if (/content security policy|refused to (?:load|connect)/i.test(message.text())) violations.push(message.text());
    });
    await page.addInitScript(() => {
        window.__promotionQaCsp = [];
        document.addEventListener('securitypolicyviolation', event => window.__promotionQaCsp.push(event.blockedURI));
    });
    await page.goto('/play/beta/qa/promotion', { waitUntil: 'networkidle' });
    const origin = new URL(page.url()).origin;
    expect([...new Set(requests.map(url => new URL(url).origin))]).toEqual([origin]);
    expect(requests.filter(url => /fics|academy|endgame-(?:trainer|library)|public-auth-config|analytics/i.test(url)
        && !/play-v2-fics-isolation\.js/i.test(url))).toEqual([]);
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => window.__promotionQaCsp)).toEqual([]);
});

test('fragment and history manipulation fail closed', async ({ page }) => {
    await page.goto('/play/beta/qa/promotion#attempt');
    await expect(page).toHaveTitle(/Play Beta Unavailable/);
    await page.goto('/play/beta/qa/promotion', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => history.pushState({}, '', '/play/beta/qa/promotion?attempt=1'));
    await expect(page).toHaveTitle(/Play Beta Unavailable/);
    await expect(page.locator('#chessboard')).toHaveCount(0);
});
