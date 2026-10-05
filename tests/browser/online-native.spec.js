import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test.beforeEach(async ({ page }) => {
    let state = { profile: { display_name: 'Alex' }, ticket: null, game: null, recentGames: [], players: [], challenges: [] };
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'user_white',fullName:'Alex',email:'alex@example.com',getToken:async()=> 'browser-token',whenReady:async()=>window.CAISSA_AUTH};`
    }));
    await page.route('**/api/online**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.searchParams.get('action') === 'config') {
            return route.fulfill({ json: { protocolVersion: '1.0.0', rollout: 'preview', enabled: true,
                capabilities: { matchmaking: true, rated: true, tournaments: true, multiboard: true }, realtime: null } });
        }
        if (request.method() === 'POST') {
            const command = request.postDataJSON();
            if (command.eventType === 'queue.join') state = { ...state, game: activeGame(), recentGames: [activeGame()] };
            if (command.eventType === 'game.move') {
                state = { ...state, game: { ...state.game, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
                    moves: [{ ply: 1, from: 'e2', to: 'e4', san: 'e4', color: 'white' }], ply: 1, turn: 'black', version: 2,
                    clock_started_at: new Date().toISOString() } };
            }
        }
        return route.fulfill({ json: { protocolVersion: '1.0.0', eventType: 'game.snapshot', serverTimestamp: new Date().toISOString(), data: { state } } });
    });
});

test('signed-in player finds a match and receives a canonical move acknowledgement', async ({ page }) => {
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    await page.goto('/online');
    await expect(page.getByRole('heading', { name: 'Online Chess' })).toBeVisible();
    await expect(page.locator('#connection-label')).toHaveText('Connected');
    await expect(page.locator('#online-board .caissa-board__piece')).toHaveCount(32);
    const lobbyBoardBox = await page.locator('#board-shell').boundingBox();
    await page.getByRole('button', { name: 'Find an opponent' }).click();
    await expect(page.locator('#curtain-title')).toBeHidden();
    await expect(page.locator('#turn-copy')).toHaveText('Your move');
    await expect(page.locator('#player-top .player-name')).toHaveText('Rival');
    const liveBoardBox = await page.locator('#board-shell').boundingBox();
    expect(Math.abs(liveBoardBox.width - lobbyBoardBox.width)).toBeLessThan(1);
    expect(Math.abs(liveBoardBox.height - lobbyBoardBox.height)).toBeLessThan(1);
    await page.locator('.caissa-board__square[data-square="e2"]').click();
    await page.locator('.caissa-board__square[data-square="e4"]').click();
    await expect(page.locator('#move-list')).toContainText('e4');
    await expect(page.locator('#turn-copy')).toContainText('thinking');
    expect(browserErrors).toEqual([]);
    if (process.env.CAISSA_CAPTURE_ONLINE_SCREENSHOT === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/caissa-online-live-desktop.png', fullPage: true });
    }
});

test('board-first shell remains usable at phone width and has no serious axe findings', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/online');
    await expect(page.locator('#online-board')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Players' })).toBeVisible();
    const layout = await page.evaluate(() => ({
        domNodes: document.getElementsByTagName('*').length,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(layout.domNodes).toBeLessThan(500);
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    if (process.env.CAISSA_CAPTURE_ONLINE_SCREENSHOT === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/caissa-online-lobby-mobile.png', fullPage: true });
    }
});

function activeGame() {
    return {
        id: '11111111-1111-4111-8111-111111111111', protocol_version: '1.0.0', status: 'active',
        pool: 'blitz', rated: true, base_ms: 180000, increment_ms: 2000,
        white_clerk_id: 'user_white', black_clerk_id: 'user_black',
        white_display_name: 'Alex', black_display_name: 'Rival', initial_fen: START_FEN, fen: START_FEN,
        moves: [], pgn: '', ply: 0, turn: 'white', version: 1,
        white_time_ms: 180000, black_time_ms: 180000,
        white_rating_before: 1500, black_rating_before: 1512,
        clock_started_at: new Date(Date.now() + 5000).toISOString(), created_at: new Date().toISOString()
    };
}
