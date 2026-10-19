import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const harnesses = new WeakMap();

test.beforeEach(async ({ page }) => {
    const harness = {
        config: {
            protocolVersion: '1.0.0', rollout: 'preview', enabled: true,
            capabilities: { matchmaking: true, rated: true, tournaments: true, multiboard: true }, realtime: null
        },
        state: { profile: { display_name: 'Alex' }, ticket: null, game: null, recentGames: [], players: [], challenges: [] },
        stateReads: 0,
        emptyPlayersAfterRead: null,
        challengeCreates: 0,
        moveCommands: 0,
        moveDelayMs: 0,
        moveRequestDurationMs: 0,
        gameCommandDelayMs: 0,
        nextStateSnapshots: [],
        authSignedIn: true,
        commandTypes: [],
        commandBodies: [],
        authorizations: [],
        queueReturnsTicket: false
    };
    harnesses.set(page, harness);
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript',
        headers: { 'Cache-Control': 'no-store' },
        body: harness.authSignedIn
            ? `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'user_white',fullName:'Alex',email:'alex@example.com',getToken:async()=> 'browser-token',whenReady:async()=>window.CAISSA_AUTH};`
            : `window.CAISSA_AUTH={isLoaded:true,isSignedIn:false,userId:null,fullName:null,email:null,getToken:async()=> null,whenReady:async()=>window.CAISSA_AUTH};`
    }));
    await page.route('**/api/online**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.searchParams.get('action') === 'config') {
            return route.fulfill({ json: harness.config });
        }
        let responseState = harness.state;
        if (request.method() === 'POST') {
            const command = request.postDataJSON();
            harness.commandTypes.push(command.eventType);
            harness.commandBodies.push(command);
            harness.authorizations.push(request.headers().authorization || '');
            if (command.eventType === 'queue.join') {
                harness.state = harness.queueReturnsTicket
                    ? { ...harness.state, ticket: { id: 'ticket_guest', pool: 'blitz', rated: false, created_at: new Date().toISOString() } }
                    : { ...harness.state, game: activeGame(), recentGames: [activeGame()] };
            }
            if (command.eventType === 'game.move') {
                const moveStartedAt = Date.now();
                harness.moveCommands += 1;
                const nextState = { ...harness.state, game: { ...harness.state.game, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
                    moves: [{ ply: 1, from: 'e2', to: 'e4', san: 'e4', color: 'white' }], ply: 1, turn: 'black', version: 2,
                    clock_started_at: new Date().toISOString() } };
                if (harness.moveDelayMs) await new Promise(resolve => setTimeout(resolve, harness.moveDelayMs));
                harness.moveRequestDurationMs = Date.now() - moveStartedAt;
                harness.state = nextState;
            }
            if (harness.gameCommandDelayMs && ['game.drawOffer', 'game.drawAccept', 'game.drawDecline', 'game.resign'].includes(command.eventType)) {
                await new Promise(resolve => setTimeout(resolve, harness.gameCommandDelayMs));
            }
            if (command.eventType === 'game.resign') {
                const completed = completedGame(harness.state.game);
                harness.state = { ...harness.state, game: null, recentGames: [completed] };
                responseState = { ...harness.state, game: completed };
            } else if (command.eventType === 'game.drawOffer') {
                const offered = { ...harness.state.game, draw_offer_by: 'user_white', version: Number(harness.state.game.version) + 1 };
                harness.state = { ...harness.state, game: offered, recentGames: [offered] };
                responseState = harness.state;
            } else if (command.eventType === 'game.drawDecline') {
                const declined = { ...harness.state.game, draw_offer_by: null, version: Number(harness.state.game.version) + 1 };
                harness.state = { ...harness.state, game: declined, recentGames: [declined] };
                responseState = harness.state;
            } else if (command.eventType === 'game.drawAccept') {
                const completed = drawnGame(harness.state.game);
                harness.state = { ...harness.state, game: null, recentGames: [completed] };
                responseState = { ...harness.state, game: completed };
            } else {
                responseState = harness.state;
            }
            if (command.eventType === 'challenge.create') harness.challengeCreates += 1;
            if (command.eventType === 'challenge.accept' || command.eventType === 'challenge.decline') {
                harness.state = { ...harness.state, challenges: harness.state.challenges.filter(item => item.id !== command.payload.challengeId) };
                responseState = harness.state;
            }
        } else {
            harness.stateReads += 1;
            if (harness.emptyPlayersAfterRead && harness.stateReads >= harness.emptyPlayersAfterRead) {
                harness.state = { ...harness.state, players: [] };
            }
            responseState = harness.nextStateSnapshots.length ? harness.nextStateSnapshots.shift() : harness.state;
        }
        return route.fulfill({ json: { protocolVersion: '1.0.0', eventType: 'game.snapshot', serverTimestamp: new Date().toISOString(), data: { state: responseState } } });
    });
});

test('signed-in player finds a match and receives a canonical move acknowledgement', async ({ page }) => {
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    await page.goto('/online');
    await expect(page.getByRole('heading', { name: 'Online Chess' })).toHaveCount(1);
    await expect(page.locator('#connection-label')).toHaveText('Connected');
    await expect(page.locator('#online-board .caissa-board__piece')).toHaveCount(32);
    const lobbyBoardBox = await page.locator('#board-shell').boundingBox();
    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.locator('#curtain-title')).toBeHidden();
    await expect(page.locator('#turn-copy')).toHaveText('Your turn');
    await expect(page.locator('.game-status-line')).toHaveCount(0);
    await expect(page.locator('#player-top .player-name')).toHaveText('Rival');
    const liveBoardBox = await page.locator('#board-shell').boundingBox();
    expect(Math.abs(liveBoardBox.width - lobbyBoardBox.width)).toBeLessThan(1);
    expect(Math.abs(liveBoardBox.height - lobbyBoardBox.height)).toBeLessThan(1);
    await page.locator('.caissa-board__square[data-square="e2"]').click();
    await page.locator('.caissa-board__square[data-square="e4"]').click();
    await expect(page.locator('#move-list')).toContainText('e4');
    await expect(page.locator('#turn-copy')).toContainText('to move');
    expect(browserErrors).toEqual([]);
    if (process.env.CAISSA_CAPTURE_ONLINE_SCREENSHOT === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/caissa-online-live-desktop.png', fullPage: true });
    }
});

test('board-first shell remains usable at phone width and has no serious axe findings', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/online');
    await expect(page.locator('#online-board')).toBeVisible();
    await expect(page.locator('.online-header')).toHaveCount(0);
    await expect(page.locator('#online-side-menu summary')).toBeVisible();
    await page.locator('#online-side-menu summary').click();
    await expect(page.locator('#online-side-menu .brand')).toBeVisible();
    await expect(page.locator('#online-side-menu #account-link')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Puzzles' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Lobby', exact: true })).toBeVisible();
    const layout = await page.evaluate(() => ({
        domNodes: document.getElementsByTagName('*').length,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(layout.domNodes).toBeLessThan(575);
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    if (process.env.CAISSA_CAPTURE_ONLINE_SCREENSHOT === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/caissa-online-lobby-mobile.png', fullPage: true });
    }
});

test('headerless workspace uses the released height and tabs support keyboard navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/online');
    await expect(page.locator('.online-titlebar')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Online Chess', level: 1 })).toHaveCount(1);
    const geometry = await page.evaluate(() => {
        const rect = selector => {
            const value = document.querySelector(selector).getBoundingClientRect();
            return { y: value.y, width: value.width, height: value.height, bottom: value.bottom };
        };
        return {
            layout: rect('.online-layout'), board: rect('#board-shell'),
            panel: rect('.play-workspace'), pageOverflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight
        };
    });
    expect(geometry.layout.y).toBeLessThan(18);
    expect(geometry.board.width).toBeGreaterThanOrEqual(748);
    expect(geometry.board.width).toBe(geometry.board.height);
    expect(Math.abs(geometry.panel.bottom - geometry.layout.bottom)).toBeLessThan(1);
    expect(geometry.pageOverflowY).toBeLessThanOrEqual(0);

    const newGame = page.getByRole('tab', { name: 'New Game' });
    await newGame.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Games', exact: true })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Games', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Lobby', exact: true })).toBeFocused();
});

test('visitor sees the normal board and sign-in appears only after an explicit play action', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.authSignedIn = false;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/online');
    await expect(page.locator('#connection-label')).toHaveText('Sign in required');
    await expect(page.locator('#online-board .caissa-board__piece')).toHaveCount(32);
    await expect(page.locator('#board-curtain')).toBeHidden();
    await expect(page.locator('#signin-dialog')).toBeHidden();
    if (process.env.CAISSA_CAPTURE_ONLINE_FULLSCREEN === '1') {
        await page.screenshot({ path: 'test-results/online-fullscreen-visitor-1440x900.png', fullPage: true });
    }

    await page.locator('[data-control="rapid-10-0"]').click();
    await expect(page.locator('#signin-dialog')).toBeHidden();
    const newGameTab = page.getByRole('tab', { name: 'New Game' });
    await newGameTab.click();
    await expect(page.getByRole('dialog', { name: 'Sign in to play online' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#signin-dialog')).toBeHidden();
    await expect(newGameTab).toBeFocused();

    await expect(page.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', /redirect_url=%2Fonline%3Fcontrol%3Drapid-10-0/);
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', /redirect_url=%2Fonline%3Fcontrol%3Drapid-10-0/);
    const startGame = page.getByRole('button', { name: 'Start Game' });
    await startGame.click();
    await expect(page.locator('#signin-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.locator('#signin-dialog')).toBeHidden();
    await expect(startGame).toBeFocused();
    expect(harness.commandTypes).toEqual([]);

    await startGame.click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/signin?**');
    expect(new URL(page.url()).searchParams.get('redirect_url')).toBe('/online?control=rapid-10-0');
    expect(harness.commandTypes).toEqual([]);
});

test('Play as Guest creates one temporary session and enters only an unrated queue', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.authSignedIn = false;
    harness.queueReturnsTicket = true;
    harness.config = {
        ...harness.config,
        capabilities: { ...harness.config.capabilities, guestPlay: true, rated: true },
        realtime: { url: 'https://staging.example.supabase.co', publishableKey: 'publishable-browser-key' }
    };
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.93.1/+esm', route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            let session = null;
            export function createClient() {
                return { auth: {
                    getSession: async () => ({ data: { session }, error: null }),
                    signInAnonymously: async () => {
                        session = {
                            access_token: 'guest-browser-token',
                            user: { id: '22222222-2222-4222-8222-222222222222', is_anonymous: true }
                        };
                        return { data: { session }, error: null };
                    },
                    signOut: async () => { session = null; return { error: null }; }
                } };
            }
        `
    }));

    await page.goto('/online');
    const guestButton = page.getByRole('button', { name: 'Play as Guest' });
    await expect(guestButton).toBeVisible();
    await expect(page.locator('#signin-dialog')).toBeHidden();
    await guestButton.evaluate(button => { button.click(); button.click(); });
    await expect(page.locator('#queue-view')).toBeVisible();
    await expect(page.locator('#game-mode-label')).toHaveText('Casual');
    await expect(page.locator('#rated-control')).toBeHidden();
    await expect(page.locator('#account-link')).toContainText('Guest');

    expect(harness.commandTypes.filter(type => type === 'presence.join')).toHaveLength(1);
    expect(harness.commandTypes.filter(type => type === 'queue.join')).toHaveLength(1);
    const queue = harness.commandBodies.find(command => command.eventType === 'queue.join');
    expect(queue.payload.rated).toBe(false);
    expect(harness.authorizations.every(value => value === 'Bearer guest-browser-token')).toBe(true);
});

test('return from sign-in restores the chosen control and starts only one queue request', async ({ page }) => {
    const harness = harnesses.get(page);
    await page.goto('/online?control=custom&minutes=12&increment=7');
    await expect(page.locator('[data-control="custom"]')).toHaveClass(/selected/);
    await expect(page.locator('#custom-clock')).toBeVisible();
    await expect(page.locator('#custom-minutes')).toHaveValue('12');
    await expect(page.locator('#custom-increment')).toHaveValue('7');
    await page.getByRole('button', { name: 'Start Game' }).click();
    expect(harness.commandTypes.filter(type => type === 'queue.join')).toHaveLength(1);
});

test('disabled capabilities read as Casual and unavailable instead of internal contracts', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.config = {
        ...harness.config,
        capabilities: { matchmaking: true, rated: false, tournaments: false, multiboard: false, openGames: false }
    };
    await page.goto('/online');
    await expect(page.locator('#game-mode-label')).toHaveText('Casual');
    await expect(page.locator('#rated-control')).toBeHidden();
    await expect(page.locator('body')).not.toContainText('Protocol 1.0.0');
    await page.getByRole('tab', { name: 'Games' }).click();
    await expect(page.getByRole('heading', { name: 'Daily Games' })).toBeVisible();
    await expect(page.locator('#games-panel-history')).toBeHidden();
    await page.getByRole('tab', { name: 'Game History' }).click();
    await expect(page.locator('#games-list')).toBeVisible();
    await page.getByRole('tab', { name: /Watch Games/ }).click();
    await expect(page.getByRole('heading', { name: 'Watch Games' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Open Games' })).toBeVisible();
    await expect(page.locator('#games-open-unavailable')).toContainText('Public joinable games are not enabled in this version.');
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Tables / Offers' }).click();
    await expect(page.locator('#offers-state')).toContainText('Public offers are unavailable');
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Tournaments' }).click();
    await expect(page.locator('#tournaments-coming-soon')).toContainText('Coming Soon');
});

test('isolated Tournament panel uses synthetic demo data and stays below the board on mobile', async ({ page }) => {
    let onlineApiRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/online') onlineApiRequests += 1; });
    await page.goto('/online?demo=tournament');
    await expect(page.getByRole('tab', { name: 'Lobby', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.lobby-subtabs').getByRole('tab', { name: 'Tournaments' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.demo-banner')).toContainText('Visual demo');
    await expect(page.locator('.tournament-standings .is-current-player')).toContainText('Alexander (you)');
    const demoTabs = page.locator('.tournament-demo-tabs');
    await expect(demoTabs.getByRole('tab', { name: 'Standings' })).toBeVisible();
    await expect(demoTabs.getByRole('tab', { name: 'Games', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Chat' })).toHaveCount(0);
    await demoTabs.getByRole('tab', { name: 'Games', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next game' })).toBeVisible();
    await expect.poll(() => onlineApiRequests).toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
        const board = document.querySelector('.board-column').getBoundingClientRect();
        const panel = document.querySelector('.play-workspace').getBoundingClientRect();
        return {
            panelBelowBoard: panel.y >= board.bottom,
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
    expect(mobile.panelBelowBoard).toBe(true);
    expect(mobile.overflowX).toBeLessThanOrEqual(0);
});

test('the tournaments route opens the authorized Lobby coming-soon state', async ({ page }) => {
    await page.goto('/online/tournaments');
    await expect(page.getByRole('tab', { name: 'Lobby', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.lobby-subtabs').getByRole('tab', { name: 'Tournaments' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tournaments-coming-soon')).toContainText('CAISSA Tournaments');
    await expect(page.locator('#tournaments-coming-soon')).toContainText('Coming Soon');
    await expect(page.locator('#tournament-demo-content')).toBeHidden();
});

test('Lobby replaces the top-level Players tab and preserves its selected subtab', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.players = [{ clerkId: 'user_rival', displayName: 'Rival', status: 'online', rating: 1512, pool: 'blitz' }];
    await page.goto('/online');
    const mainTabs = page.locator('.workspace-tabs');
    const lobbyTabs = page.locator('.lobby-subtabs');
    await expect(mainTabs.getByRole('tab')).toHaveCount(3);
    await expect(mainTabs.getByRole('tab', { name: 'Players' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Play a Friend' }).click();
    await expect(mainTabs.getByRole('tab', { name: 'Lobby' })).toHaveAttribute('aria-selected', 'true');
    await expect(lobbyTabs.getByRole('tab', { name: 'Players' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#players-list')).toContainText('Rival');

    await lobbyTabs.getByRole('tab', { name: 'Tables / Offers' }).click();
    await expect(page.locator('#offers-state')).toContainText('Public offers are unavailable');
    await expect(page.locator('#offers-table-body tr')).toHaveCount(0);
    await mainTabs.getByRole('tab', { name: 'Games' }).click();
    await mainTabs.getByRole('tab', { name: 'Lobby' }).click();
    await expect(lobbyTabs.getByRole('tab', { name: 'Tables / Offers' })).toHaveAttribute('aria-selected', 'true');

    await lobbyTabs.getByRole('tab', { name: 'Tables / Offers' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(lobbyTabs.getByRole('tab', { name: 'Tournaments' })).toBeFocused();
    await expect(page.locator('#tournaments-coming-soon')).toBeVisible();
    expect(harness.commandTypes.filter(type => type === 'queue.leave')).toHaveLength(0);
});

test('Lobby navigation preserves an active game, board instance, and obvious return action', async ({ page }) => {
    const harness = harnesses.get(page);
    await page.goto('/online');
    await page.evaluate(() => { window.__lobbyHubBoard = document.getElementById('online-board'); });
    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.locator('#game-view')).toBeVisible();
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Return to game' })).toBeVisible();
    await expect(page.locator('#player-top .player-name')).toHaveText('Rival');
    await page.getByRole('button', { name: 'Return to game' }).click();
    await expect(page.locator('#game-view')).toBeVisible();
    expect(await page.evaluate(() => window.__lobbyHubBoard === document.getElementById('online-board'))).toBe(true);
    expect(harness.commandTypes.filter(type => type === 'queue.join')).toHaveLength(1);
    expect(harness.commandTypes.filter(type => type === 'queue.leave')).toHaveLength(0);
});

test('changing tabs does not cancel an active matchmaking search', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.queueReturnsTicket = true;
    await page.goto('/online');
    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.locator('#queue-view')).toBeVisible();
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.getByRole('tab', { name: 'Games', exact: true }).click();
    await page.getByRole('tab', { name: 'New Game' }).click();
    await expect(page.locator('#queue-view')).toBeVisible();
    expect(harness.commandTypes.filter(type => type === 'queue.join')).toHaveLength(1);
    expect(harness.commandTypes.filter(type => type === 'queue.leave')).toHaveLength(0);
});

test('local offers fixtures are explicitly labeled and never expose a Join action', async ({ page }) => {
    await page.goto('/online?fixtures=lobby');
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Tables / Offers' }).click();
    await expect(page.locator('#offers-fixture-banner')).toContainText('Local fixture');
    await expect(page.locator('#offers-fixture-banner')).toContainText('no games can be joined');
    await expect(page.locator('#offers-table-body tr')).toHaveCount(3);
    await expect(page.locator('#offers-table-wrap').getByRole('button')).toHaveCount(0);
    await expect(page.locator('#offers-status')).toHaveText('Local fixture');
});

test('a long local offers fixture scrolls inside the workspace and keeps its footer stable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/online?fixtures=lobby');
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Tables / Offers' }).click();
    const before = await page.evaluate(() => {
        const panel = document.querySelector('.play-workspace').getBoundingClientRect();
        const foot = document.querySelector('.workspace-foot').getBoundingClientRect();
        return { panelHeight: panel.height, panelBottom: panel.bottom, footBottom: foot.bottom };
    });
    await page.locator('#offers-table-body').evaluate(body => {
        for (let index = 0; index < 80; index += 1) {
            const row = document.createElement('tr');
            ['FixturePlayer', '1500', '3+2', 'Casual Blitz'].forEach(value => {
                const cell = document.createElement('td');
                cell.textContent = `${value}${index + 1}`;
                row.append(cell);
            });
            body.append(row);
        }
    });
    const after = await page.evaluate(() => {
        const panel = document.querySelector('.play-workspace').getBoundingClientRect();
        const body = document.querySelector('.workspace-body');
        const foot = document.querySelector('.workspace-foot').getBoundingClientRect();
        return {
            panelHeight: panel.height,
            panelBottom: panel.bottom,
            footBottom: foot.bottom,
            bodyScrolls: body.scrollHeight > body.clientHeight,
            bodyOverflowY: getComputedStyle(body).overflowY,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
    expect(Math.abs(after.panelHeight - before.panelHeight)).toBeLessThan(1);
    expect(Math.abs(after.panelBottom - before.panelBottom)).toBeLessThan(1);
    expect(Math.abs(after.footBottom - before.footBottom)).toBeLessThan(1);
    expect(after.bodyScrolls).toBe(true);
    expect(after.bodyOverflowY).toBe('auto');
    expect(after.horizontalOverflow).toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 320, height: 700 });
    await expect(page.locator('.offers-table th')).toHaveCount(4);
    const mobile = await onlineLayoutGeometry(page);
    expect(mobile.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(mobile.boardPanelIntersection).toBe(0);
});

test('Setup mutes invitation pop-ups while pending challenges remain available', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.challenges = [challengeFixture({ direction: 'incoming' })];
    await page.goto('/online');
    await expect(page.locator('#challenge-notice')).toBeVisible();

    const setupButton = page.getByRole('button', { name: /Setup/ });
    await setupButton.click();
    const dialog = page.getByRole('dialog', { name: 'Setup' });
    await expect(dialog).toBeVisible();
    await page.locator('#mute-invitation-popups').check();
    await expect(page.locator('#challenge-notice')).toBeHidden();
    await page.getByRole('button', { name: 'Close setup' }).click();
    await expect(setupButton).toBeFocused();

    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Players' }).click();
    await expect(page.locator('#challenges-list .challenge-row')).toHaveCount(1);
    await expect(page.locator('#challenges-list')).toContainText('Rival');
    await page.reload();
    await expect(page.locator('#challenge-notice')).toBeHidden();
    await page.getByRole('button', { name: /Setup/ }).click();
    await expect(page.locator('#mute-invitation-popups')).toBeChecked();
    await page.locator('#mute-invitation-popups').uncheck();
    await expect(page.locator('#challenge-notice')).toBeVisible();
});

test('captures sanitized Lobby Hub review states when requested', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.players = [
        { clerkId: 'fixture_nova', displayName: 'FixtureNova', status: 'online', rating: 1824, pool: 'rapid' },
        { clerkId: 'fixture_guest', displayName: 'FixtureGuest', status: 'seeking', rating: null, pool: 'blitz' }
    ];
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/online?fixtures=lobby');
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    const lobbyTabs = page.locator('.lobby-subtabs');
    await expect(page.locator('#players-list .player-row')).toHaveCount(2);

    if (process.env.CAISSA_CAPTURE_LOBBY_HUB === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/online-lobby-hub-v1/lobby-players-1440x900.png', fullPage: true });
    }
    await lobbyTabs.getByRole('tab', { name: 'Tables / Offers' }).click();
    if (process.env.CAISSA_CAPTURE_LOBBY_HUB === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/online-lobby-hub-v1/lobby-offers-local-fixtures-1440x900.png', fullPage: true });
    }
    await lobbyTabs.getByRole('tab', { name: 'Tournaments' }).click();
    if (process.env.CAISSA_CAPTURE_LOBBY_HUB === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/online-lobby-hub-v1/lobby-tournaments-1440x900.png', fullPage: true });
    }
    await page.getByRole('button', { name: /Setup/ }).click();
    if (process.env.CAISSA_CAPTURE_LOBBY_HUB === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/online-lobby-hub-v1/setup-open-1440x900.png', fullPage: true });
    }
    await page.locator('#mute-invitation-popups').check();
    if (process.env.CAISSA_CAPTURE_LOBBY_HUB === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/online-lobby-hub-v1/setup-muted-1440x900.png', fullPage: true });
    }
    await page.getByRole('button', { name: 'Close setup' }).click();
    await lobbyTabs.getByRole('tab', { name: 'Players' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await onlineLayoutGeometry(page);
    expect(mobile.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(mobile.boardPanelIntersection).toBe(0);
    if (process.env.CAISSA_CAPTURE_LOBBY_HUB === '1') {
        await page.screenshot({ path: 'docs/visual-evidence/online-lobby-hub-v1/lobby-mobile-390x844.png', fullPage: true });
    }
});

test('board group and workspace share aligned desktop geometry and contextual scroll ownership', async ({ page }) => {
    const desktopCases = [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'short', width: 1440, height: 720 },
        { name: 'compact-desktop', width: 1280, height: 720 },
        { name: 'zoom-25-on-2560x1440', zoom: 25, width: 10240, height: 5760 },
        { name: 'zoom-33-on-2560x1440', zoom: 33, width: 7758, height: 4364 },
        { name: 'zoom-50-on-2560x1440', zoom: 50, width: 5120, height: 2880 },
        { name: 'zoom-67-on-2560x1440', zoom: 67, width: 3821, height: 2149 },
        { name: 'zoom-80-on-2560x1440', zoom: 80, width: 3200, height: 1800 },
        { name: 'zoom-100-on-2560x1440', zoom: 100, width: 2560, height: 1440 },
        { name: 'zoom-125-on-2560x1440', zoom: 125, width: 2048, height: 1152 }
    ];
    for (const viewport of desktopCases) {
        await page.setViewportSize(viewport);
        await page.goto('/online');
        const geometry = await onlineLayoutGeometry(page);
        expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThan(1);
        expect(geometry.board.width).toBeGreaterThan(geometry.panel.width);
        expect(geometry.gap).toBeGreaterThanOrEqual(24);
        expect(geometry.gap).toBeLessThanOrEqual(32.1);
        expect(geometry.horizontalIntersection).toBe(0);
        expect(geometry.groupLeft).toBeGreaterThanOrEqual(geometry.main.x - 0.5);
        expect(geometry.groupRight).toBeLessThanOrEqual(geometry.main.right + 0.5);
        expect(Math.abs(geometry.groupCenterDelta)).toBeLessThan(1);
        expect(Math.abs(geometry.panel.y - geometry.boardColumn.y)).toBeLessThan(1);
        expect(Math.abs(geometry.panel.bottom - geometry.boardColumn.bottom)).toBeLessThan(1);
        expect(Math.abs(geometry.head.y - geometry.panel.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.foot.bottom - geometry.panel.bottom)).toBeLessThanOrEqual(1.1);
        expect(geometry.bodyOverflowY).toBe('auto');
        expect(geometry.moveListOverflowY).toBe('auto');
        expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
        expect(geometry.verticalOverflow).toBeLessThanOrEqual(0);
        expect(geometry.menuBoardIntersection).toBe(0);
        if (process.env.CAISSA_CAPTURE_ONLINE_LAYOUT === '1') {
            console.log(`CAISSA_ONLINE_LAYOUT_METRICS ${JSON.stringify({ viewport, geometry })}`);
            const path = `test-results/online-layout-${viewport.name}.png`;
            if (viewport.width <= 2560) await page.screenshot({ path, fullPage: true });
            else await page.locator('.online-main').screenshot({ path });
        }
    }

    const stackedCases = [
        { name: 'mobile', width: 390, height: 844 },
        { name: 'mobile-compact', width: 320, height: 700 },
        { name: 'mobile-narrow', width: 340, height: 760 },
        { name: 'breakpoint-900', width: 900, height: 844 }
    ];
    for (const viewport of stackedCases) {
        await page.setViewportSize(viewport);
        await page.goto('/online');
        const mobile = await onlineLayoutGeometry(page);
        expect(Math.abs(mobile.board.width - mobile.board.height)).toBeLessThan(1);
        expect(Math.abs(mobile.panel.width - mobile.boardColumn.width)).toBeLessThan(1);
        expect(mobile.panel.y - mobile.boardColumn.bottom).toBeGreaterThanOrEqual(13);
        expect(mobile.horizontalOverflow).toBeLessThanOrEqual(0);
        expect(mobile.boardPanelIntersection).toBe(0);
        expect(mobile.menuBoardIntersection).toBe(0);
        if (process.env.CAISSA_CAPTURE_ONLINE_LAYOUT === '1') {
            console.log(`CAISSA_ONLINE_LAYOUT_METRICS ${JSON.stringify({ viewport, geometry: mobile })}`);
            await page.screenshot({ path: `test-results/online-layout-${viewport.name}.png`, fullPage: true });
        }
    }

    await page.setViewportSize({ width: 901, height: 844 });
    await page.goto('/online');
    const desktopBoundary = await onlineLayoutGeometry(page);
    expect(desktopBoundary.panel.x).toBeGreaterThan(desktopBoundary.boardColumn.right);
    expect(desktopBoundary.gap).toBeGreaterThanOrEqual(24);
    expect(desktopBoundary.horizontalIntersection).toBe(0);
    expect(desktopBoundary.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(Math.abs(desktopBoundary.panel.y - desktopBoundary.boardColumn.y)).toBeLessThan(1);
    expect(Math.abs(desktopBoundary.panel.bottom - desktopBoundary.boardColumn.bottom)).toBeLessThan(1);
});

test('completed game actions survive at least three canonical polling cycles', async ({ page }) => {
    const harness = harnesses.get(page);
    await page.goto('/online');
    await expect(page.locator('#connection-label')).toHaveText('Connected');
    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.locator('#game-view')).toBeVisible();
    await page.locator('#resign-game').click();
    await page.locator('#confirm-dialog [value="confirm"]').click();
    await expect(page.locator('#result-view')).toBeVisible();

    const firstRead = harness.stateReads;
    for (let cycle = 1; cycle <= 3; cycle += 1) {
        await expect.poll(() => harness.stateReads, { timeout: 10_000 }).toBeGreaterThanOrEqual(firstRead + cycle);
        await expect(page.locator('#result-view')).toBeVisible();
        await expect(page.locator('#game-view')).toBeHidden();
        await expect(page.locator('#turn-copy')).toHaveText('Game over');
        await expect(page.locator('#rematch-game')).toBeVisible();
        await expect(page.locator('#analyze-game')).toBeVisible();
        await expect(page.locator('#download-pgn')).toBeVisible();
        if (process.env.CAISSA_CAPTURE_ONLINE_REVIEW_GATE === '1') {
            await page.locator('#result-view').screenshot({
                path: `docs/visual-evidence/caissa-online-game-over-poll-${cycle}.png`
            });
        }
    }

    await page.locator('#new-opponent').click();
    await expect(page.locator('#lobby-view')).toBeVisible();
    const clearedAtRead = harness.stateReads;
    await expect.poll(() => harness.stateReads, { timeout: 10_000 }).toBeGreaterThan(clearedAtRead);
    await expect(page.locator('#lobby-view')).toBeVisible();
    await expect(page.locator('#result-view')).toBeHidden();
});

test('players snapshot removes stale rows and restores its empty state', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.players = [{
        clerkId: 'user_rival', displayName: 'Rival', status: 'online', rating: 1512, pool: 'blitz'
    }];
    harness.emptyPlayersAfterRead = 2;

    await page.goto('/online');
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Players' }).click();
    await expect(page.locator('#players-list .player-row')).toHaveCount(1);
    await expect(page.locator('#players-count')).toHaveText('1 online');
    await expect(page.locator('#players-list')).toContainText('Rival');
    await expect(page.locator('#players-list button', { hasText: 'Challenge' })).toHaveCount(1);
    if (process.env.CAISSA_CAPTURE_ONLINE_REVIEW_GATE === '1') {
        await page.locator('#players-list').screenshot({
            path: 'docs/visual-evidence/caissa-online-players-before-expiry.png'
        });
    }

    await expect.poll(() => harness.stateReads, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    await expect(page.locator('#players-list')).toHaveClass('empty-state');
    await expect(page.locator('#players-list')).toContainText('No players online');
    await expect(page.locator('#players-list .player-row')).toHaveCount(0);
    await expect(page.locator('#players-count')).toHaveText('0 online');
    await expect(page.locator('#players-list button', { hasText: 'Challenge' })).toHaveCount(0);
    expect(harness.challengeCreates).toBe(0);
    if (process.env.CAISSA_CAPTURE_ONLINE_REVIEW_GATE === '1') {
        await page.locator('#players-list').screenshot({
            path: 'docs/visual-evidence/caissa-online-players-after-expiry.png'
        });
    }
});

test('records the online drag, drop and delayed-authority boundaries', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.moveDelayMs = 3500;
    await page.goto('/online');
    await page.getByRole('button', { name: 'Start Game' }).click();
    const source = await page.locator('.caissa-board__square[data-square="e2"]').boundingBox();
    const target = await page.locator('.caissa-board__square[data-square="e4"]').boundingBox();
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();
    await page.evaluate(() => {
        const root = document.querySelector('#online-board .caissa-board');
        const piece = document.querySelector('.caissa-board__piece[data-square="e2"]');
        const probe = window.__caissaDragProbe = {
            pointerMoves: 0, visualWrites: 0, geometryReadsDuringMove: 0,
            cursorToPieceLag: [], frameIntervals: [], longTasks: [],
            lastPointerAt: 0, dragging: false, inPointerMove: false, lastFrameAt: 0, pointerUpAt: 0,
            destinationAt: 0
        };
        const originalRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function (...args) {
            if (probe.inPointerMove) probe.geometryReadsDuringMove += 1;
            return originalRect.apply(this, args);
        };
        document.addEventListener('pointermove', () => { probe.inPointerMove = true; }, true);
        document.addEventListener('pointermove', () => { probe.inPointerMove = false; }, false);
        document.addEventListener('pointerup', () => { probe.inPointerMove = false; }, true);
        root.addEventListener('pointermove', () => {
            probe.pointerMoves += 1;
            probe.lastPointerAt = performance.now();
        }, true);
        root.addEventListener('pointerdown', () => {
            probe.dragging = true;
            probe.lastFrameAt = performance.now();
            const frame = now => {
                if (!probe.dragging) return;
                probe.frameIntervals.push(now - probe.lastFrameAt);
                probe.lastFrameAt = now;
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        }, true);
        root.addEventListener('pointerup', () => {
            probe.pointerUpAt = performance.now();
            probe.dragging = false;
        }, true);
        new MutationObserver(records => {
            for (const record of records) {
                if (record.attributeName === 'style' && piece.style.transform) {
                    probe.visualWrites += 1;
                    probe.cursorToPieceLag.push(performance.now() - probe.lastPointerAt);
                }
                if (record.attributeName === 'data-square' && piece.dataset.square === 'e4' && !probe.destinationAt) {
                    probe.destinationAt = performance.now();
                }
            }
        }).observe(piece, { attributes: true, attributeFilter: ['style', 'data-square'] });
        try {
            new PerformanceObserver(list => {
                if (probe.dragging) probe.longTasks.push(...list.getEntries().map(entry => entry.duration));
            }).observe({ type: 'longtask' });
        } catch (_) {}
    });

    await page.mouse.move(source.x + source.width * 0.28, source.y + source.height * 0.72);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width * 0.28, target.y + target.height * 0.72, { steps: 16 });
    await page.mouse.up();
    await expect(page.locator('.caissa-board__piece[data-square="e4"]')).toHaveCount(1);
    await page.waitForTimeout(2800);
    const revertedDuringCommit = await page.locator('.caissa-board__piece[data-square="e2"]').count() === 1;
    await expect(page.locator('#move-list')).toContainText('e4', { timeout: 4000 });
    const metrics = await page.evaluate(() => {
        const probe = window.__caissaDragProbe;
        const sortedLag = [...probe.cursorToPieceLag].sort((a, b) => a - b);
        const sortedFrames = [...probe.frameIntervals].filter(value => value > 0).sort((a, b) => a - b);
        const percentile = (items, p) => items.length ? items[Math.min(items.length - 1, Math.floor(items.length * p))] : 0;
        const resource = performance.getEntriesByType('resource')
            .filter(entry => entry.name.includes('/api/online'))
            .sort((a, b) => b.duration - a.duration)[0];
        return {
            pointerEvents: probe.pointerMoves,
            visualWrites: probe.visualWrites,
            geometryReadsDuringMove: probe.geometryReadsDuringMove,
            cursorLagP50Ms: percentile(sortedLag, 0.5),
            cursorLagP95Ms: percentile(sortedLag, 0.95),
            frameP50Ms: percentile(sortedFrames, 0.5),
            frameP95Ms: percentile(sortedFrames, 0.95),
            dropPresentationMs: probe.destinationAt - probe.pointerUpAt,
            httpDurationMs: resource?.duration || 0,
            longTasks: probe.longTasks.length
        };
    });
    console.log(`CAISSA_ONLINE_DRAG_METRICS ${JSON.stringify({ ...metrics, routeDurationMs: harness.moveRequestDurationMs, revertedDuringCommit })}`);
    expect(revertedDuringCommit).toBe(false);
    expect(metrics.visualWrites).toBeLessThanOrEqual(metrics.pointerEvents);
    expect(metrics.geometryReadsDuringMove).toBe(0);
    expect(metrics.dropPresentationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.dropPresentationMs).toBeLessThan(50);
    expect(harness.moveRequestDurationMs).toBeGreaterThan(3000);
    expect(metrics.longTasks).toBe(0);
    expect(harness.moveCommands).toBe(1);
});

test('a stale snapshot after commit cannot rewind the board or re-enable input', async ({ page }) => {
    const harness = harnesses.get(page);
    await page.goto('/online');
    await page.getByRole('button', { name: 'Start Game' }).click();
    await page.locator('.caissa-board__square[data-square="e2"]').click();
    await page.locator('.caissa-board__square[data-square="e4"]').click();
    await expect(page.locator('#move-list')).toContainText('e4');
    const readsBeforeStale = harness.stateReads;
    harness.nextStateSnapshots.push({
        ...harness.state,
        game: activeGame(),
        recentGames: [activeGame()]
    });
    await expect.poll(() => harness.stateReads, { timeout: 6000 }).toBeGreaterThan(readsBeforeStale);
    await expect(page.locator('.caissa-board__piece[data-square="e4"]')).toHaveCount(1);
    await expect(page.locator('.caissa-board__piece[data-square="e2"]')).toHaveCount(0);
    await expect(page.locator('#move-list')).toContainText('e4');
    await expect(page.locator('#online-board .caissa-board')).toHaveAttribute('aria-disabled', 'true');
    expect(harness.moveCommands).toBe(1);
});

test('incoming invitation stays visible across tabs, is deduplicated by id, and disappears on response', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.challenges = [challengeFixture({ direction: 'incoming' })];
    await page.goto('/online');
    await expect(page.locator('#challenge-notice')).toBeVisible();
    await expect(page.locator('#challenge-notice-title')).toContainText('Rival');
    await expect(page.locator('#challenge-notice-control')).toContainText('3+2');
    await page.evaluate(() => { window.__challengeNoticeNode = document.getElementById('challenge-notice'); });
    for (const tab of ['Games', 'Lobby', 'New Game']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expect(page.locator('#challenge-notice')).toBeVisible();
    }
    const firstRead = harness.stateReads;
    await expect.poll(() => harness.stateReads, { timeout: 6000 }).toBeGreaterThan(firstRead);
    expect(await page.evaluate(() => window.__challengeNoticeNode === document.getElementById('challenge-notice'))).toBe(true);
    await page.locator('#challenge-notice-decline').click();
    await expect(page.locator('#challenge-notice')).toBeHidden();
    expect(harness.state.challenges).toEqual([]);
    const readsAfterResponse = harness.stateReads;
    harness.nextStateSnapshots.push({ ...harness.state, challenges: [challengeFixture({ direction: 'incoming' })] });
    await expect.poll(() => harness.stateReads, { timeout: 6000 }).toBeGreaterThan(readsAfterResponse);
    await expect(page.locator('#challenge-notice')).toBeHidden();
});

test('invitation notice expires locally without waiting for another poll', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.challenges = [challengeFixture({ expiresAt: new Date(Date.now() + 1500).toISOString() })];
    await page.goto('/online');
    await expect(page.locator('#challenge-notice')).toBeVisible();
    await expect(page.locator('#challenge-notice')).toBeHidden({ timeout: 3000 });
    await expect(page.locator('#challenges-list .challenge-row')).toHaveCount(0);
});

test('outgoing invitation shows waiting, blocks duplicates, and null ratings render as Casual', async ({ page }) => {
    const harness = harnesses.get(page);
    const completed = completedGame();
    harness.state = {
        ...harness.state,
        recentGames: [completed],
        players: [{ clerkId: 'user_black', displayName: 'Rival', status: 'online', rating: null, pool: 'blitz' }],
        challenges: [challengeFixture({ direction: 'outgoing' })]
    };
    await page.goto('/online');
    await expect(page.locator('#challenge-notice-title')).toHaveText('Waiting for Rival');
    await expect(page.locator('#challenge-notice-actions')).toBeHidden();
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Players' }).click();
    await expect(page.locator('#players-list')).toContainText('Casual · Blitz');
    await expect(page.locator('#players-list')).not.toContainText('null');
    await expect(page.locator('#players-list button')).toHaveText('Waiting');
    await expect(page.locator('#players-list button')).toBeDisabled();
    expect(harness.challengeCreates).toBe(0);
    await page.getByRole('tab', { name: 'Games' }).click();
    await page.getByRole('tab', { name: 'Game History' }).click();
    await page.locator('#games-list .game-row').click();
    await expect(page.locator('#result-view')).toBeVisible();
    await expect(page.locator('#rematch-game')).toHaveText('Waiting for rematch');
    await expect(page.locator('#rematch-game')).toBeDisabled();
    if (process.env.CAISSA_CAPTURE_ONLINE_FEEDBACK === '1') {
        await page.screenshot({ path: 'test-results/online-feedback-rematch-desktop.png', fullPage: true });
    }
});

test('Games uses three contextual subtabs and keeps Open Games independent', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.state.recentGames = [completedGame()];
    await page.goto('/online');
    await page.getByRole('tab', { name: 'Games' }).click();
    const gameTabs = page.locator('.games-subtabs');
    await expect(gameTabs.getByRole('tab')).toHaveCount(3);
    await expect(gameTabs.getByRole('tab', { name: /Daily Games/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Daily Games' })).toBeVisible();
    await expect(page.locator('#games-panel-history')).toBeHidden();
    await gameTabs.getByRole('tab', { name: 'Game History' }).click();
    await expect(page.locator('#games-list .game-row')).toContainText('Alex');
    await expect(page.locator('#games-panel-daily')).toBeHidden();
    await gameTabs.getByRole('tab', { name: 'Game History' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(gameTabs.getByRole('tab', { name: /Watch Games/ })).toBeFocused();
    await expect(gameTabs.getByRole('tab', { name: /Watch Games/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Watch Games' })).toBeVisible();
    await expect(page.locator('#games-open')).toBeVisible();
    await expect(page.locator('#games-open')).toContainText('Public joinable games are not enabled in this version.');
    await expect(page.locator('#panel-games')).not.toContainText('YOUR BOARD');
});

test('reference composition keeps New Game, Games, and Lobby Players visually contextual', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.authSignedIn = false;
    harness.config = {
        ...harness.config,
        capabilities: {
            ...harness.config.capabilities,
            guestPlay: true,
            openGames: false,
            spectators: false,
            tournaments: false
        }
    };
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/online');
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play as Guest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
    if (process.env.CAISSA_CAPTURE_ONLINE_REFERENCE === '1') {
        await page.screenshot({ path: 'test-results/online-reference-new-game-1440x900.png', fullPage: true });
    }

    await page.getByRole('tab', { name: 'Games', exact: true }).click();
    await expect(page.locator('.games-subtabs [role="tab"]')).toHaveCount(3);
    await expect(page.locator('#games-open')).toBeVisible();
    if (process.env.CAISSA_CAPTURE_ONLINE_REFERENCE === '1') {
        await page.screenshot({ path: 'test-results/online-reference-games-1440x900.png', fullPage: true });
    }

    harness.authSignedIn = true;
    harness.state.players = [
        { clerkId: 'user_nova', displayName: 'NovaKnight', status: 'online', rating: 1824, pool: 'rapid' },
        { clerkId: 'user_criollito', displayName: 'Criollito', status: 'seeking', rating: null, pool: 'blitz' },
        { clerkId: 'user_muse', displayName: 'EndgameMuse', status: 'playing', rating: 1640, pool: 'rapid' }
    ];
    await page.reload();
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Players' }).click();
    await expect(page.locator('#players-count')).toHaveText('3 online');
    await expect(page.locator('#player-search')).toBeVisible();
    await expect(page.locator('#players-list .player-row')).toHaveCount(3);
    if (process.env.CAISSA_CAPTURE_ONLINE_REFERENCE === '1') {
        await page.screenshot({ path: 'test-results/online-reference-players-1440x900.png', fullPage: true });
    }
    const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight
    }));
    expect(overflow.x).toBeLessThanOrEqual(0);
    expect(overflow.y).toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'New Game' }).click();
    const mobile = await onlineLayoutGeometry(page);
    expect(mobile.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(mobile.panel.y).toBeGreaterThanOrEqual(mobile.boardColumn.bottom);
    expect(mobile.boardPanelIntersection).toBe(0);
    if (process.env.CAISSA_CAPTURE_ONLINE_REFERENCE === '1') {
        await page.screenshot({ path: 'test-results/online-reference-mobile-390x844.png', fullPage: true });
    }
});

test('New Game keeps authentication actions at its flexible footer and Lobby owns Tournaments', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.authSignedIn = false;
    harness.config = {
        ...harness.config,
        capabilities: {
            ...harness.config.capabilities,
            guestPlay: true,
            tournaments: false
        }
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/online');
    const access = page.locator('#lobby-access');
    await expect(page.locator('#panel-new')).not.toContainText('Tournaments');
    await expect(access).toBeVisible();
    let geometry = await lobbyFooterGeometry(page);
    expect(geometry.actionRowDelta).toBeLessThan(1);
    expect(geometry.accessFooterVerticalOverlap).toBeLessThan(0.5);
    expect(geometry.accessClippedTop).toBeLessThanOrEqual(0);
    expect(geometry.accessClippedBottom).toBeLessThan(0.5);
    if (process.env.CAISSA_CAPTURE_ONLINE_MICRO_POLISH === '1') {
        await page.screenshot({ path: 'test-results/online-micro-polish-new-game-desktop-1440x900.png', fullPage: true });
    }

    await page.setViewportSize({ width: 1440, height: 720 });
    await page.reload();
    await access.scrollIntoViewIfNeeded();
    geometry = await lobbyFooterGeometry(page);
    expect(geometry.actionRowDelta).toBeLessThan(1);
    expect(geometry.accessFooterVerticalOverlap).toBeLessThan(0.5);
    expect(geometry.accessClippedTop).toBeLessThanOrEqual(0);
    expect(geometry.accessClippedBottom).toBeLessThan(0.5);

    await page.setViewportSize({ width: 1152, height: 720 });
    await page.reload();
    await access.scrollIntoViewIfNeeded();
    geometry = await lobbyFooterGeometry(page);
    expect(geometry.actionRowDelta).toBeLessThan(1);
    expect(geometry.accessFooterVerticalOverlap).toBeLessThan(0.5);
    expect(geometry.accessClippedTop).toBeLessThanOrEqual(0);
    expect(geometry.accessClippedBottom).toBeLessThan(0.5);
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    if (process.env.CAISSA_CAPTURE_ONLINE_MICRO_POLISH === '1') {
        await page.screenshot({ path: 'test-results/online-micro-polish-new-game-mobile-top-390x844.png', fullPage: true });
    }
    await access.scrollIntoViewIfNeeded();
    geometry = await lobbyFooterGeometry(page);
    expect(geometry.accessFooterVerticalOverlap).toBeLessThan(0.5);
    expect(geometry.accessClippedTop).toBeLessThanOrEqual(0);
    expect(geometry.accessClippedBottom).toBeLessThan(0.5);
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
    if (process.env.CAISSA_CAPTURE_ONLINE_MICRO_POLISH === '1') {
        await page.screenshot({ path: 'test-results/online-micro-polish-new-game-mobile-footer-390x844.png', fullPage: true });
    }

    harness.authSignedIn = true;
    await page.reload();
    await expect(access).toBeHidden();
    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Tournaments' }).click();
    await expect(page.locator('#tournaments-coming-soon')).toContainText('CAISSA Tournaments');
    await expect(page.locator('#tournaments-coming-soon')).toContainText('Coming Soon');
});

test('mobile navigation scrolls clear of the board and leaves footer access reachable', async ({ page }) => {
    const harness = harnesses.get(page);
    harness.authSignedIn = false;
    harness.config = {
        ...harness.config,
        capabilities: {
            ...harness.config.capabilities,
            guestPlay: true,
            tournaments: false
        }
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/online');

    const top = await mobileNavigationGeometry(page);
    expect(top.navigationBoardIntersection).toBe(0);
    expect(top.navigationTop).toBeGreaterThanOrEqual(0);
    if (process.env.CAISSA_CAPTURE_ONLINE_MOBILE_NAV === '1') {
        await page.screenshot({ path: 'test-results/online-mobile-nav-top-390x844.png' });
    }

    const boardDocumentTop = await page.locator('#board-shell').evaluate(element => element.getBoundingClientRect().top + scrollY);
    await page.evaluate(target => scrollTo(0, target), Math.max(1, Math.round(boardDocumentTop - 22)));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const middle = await mobileNavigationGeometry(page);
    expect(middle.navigationBoardIntersection).toBe(0);
    expect(middle.navigationBottom).toBeLessThanOrEqual(0);
    expect(middle.boardProbeInsideBoard).toBe(true);
    if (process.env.CAISSA_CAPTURE_ONLINE_MOBILE_NAV === '1') {
        await page.screenshot({ path: 'test-results/online-mobile-nav-middle-390x844.png' });
    }

    const body = page.locator('.workspace-body');
    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.locator('#lobby-access').scrollIntoViewIfNeeded();
    await expect(page.locator('#lobby-access')).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Log in' })).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Play as Guest' })).toBeInViewport();
    const bottom = await mobileNavigationGeometry(page);
    expect(bottom.navigationBoardIntersection).toBe(0);
    expect(bottom.navigationBottom).toBeLessThanOrEqual(0);
    if (process.env.CAISSA_CAPTURE_ONLINE_MOBILE_NAV === '1') {
        await page.screenshot({ path: 'test-results/online-mobile-nav-footer-390x844.png' });
    }
});

test('custom Minutes and Increment fields align on desktop and narrow mobile', async ({ page }) => {
    await page.goto('/online');
    await page.locator('[data-control="custom"]').click();
    await expect(page.locator('#custom-clock label').nth(0)).toContainText('Minutes');
    await expect(page.locator('#custom-clock label').nth(1)).toContainText('Increment (seconds)');
    await expect(page.locator('#custom-clock')).not.toContainText(/^seconds$/);
    const desktop = await customClockGeometry(page);
    expect(Math.abs(desktop.minutes.width - desktop.increment.width)).toBeLessThan(1);
    expect(Math.abs(desktop.minutes.height - desktop.increment.height)).toBeLessThan(1);
    expect(Math.abs(desktop.minutes.y - desktop.increment.y)).toBeLessThan(1);
    if (process.env.CAISSA_CAPTURE_ONLINE_FEEDBACK === '1') {
        await page.screenshot({ path: 'test-results/online-feedback-custom-desktop.png', fullPage: true });
    }
    await page.setViewportSize({ width: 340, height: 760 });
    const mobile = await customClockGeometry(page);
    expect(Math.abs(mobile.minutes.width - mobile.increment.width)).toBeLessThan(1);
    expect(Math.abs(mobile.minutes.height - mobile.increment.height)).toBeLessThan(1);
    expect(mobile.increment.y).toBeGreaterThan(mobile.minutes.y + mobile.minutes.height);
    if (process.env.CAISSA_CAPTURE_ONLINE_FEEDBACK === '1') {
        await page.screenshot({ path: 'test-results/online-feedback-custom-mobile.png', fullPage: true });
    }
});

test('active game actions stay in a stable footer while move history owns the scroll', async ({ page }) => {
    const harness = harnesses.get(page);
    const moves = Array.from({ length: 80 }, (_, index) => ({
        ply: index + 1,
        from: index % 2 ? 'e7' : 'e2',
        to: index % 2 ? 'e5' : 'e4',
        san: index % 2 ? 'e5' : 'e4',
        color: index % 2 ? 'black' : 'white'
    }));
    const game = { ...activeGame(), moves, ply: moves.length, version: moves.length + 1 };
    harness.state = { ...harness.state, game, recentGames: [game] };

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/online');
    await expect(page.locator('.game-action-footer')).toBeVisible();
    await expect(page.locator('#offer-draw')).toHaveText('Offer draw');
    await expect(page.locator('#decline-draw')).toBeHidden();
    await expect(page.locator('#resign-game')).toBeVisible();
    const normal = await gameActionFooterGeometry(page);
    assertGameActionFooterGeometry(normal);
    expect(normal.visibleButtons).toEqual(['Offer draw', 'Resign']);
    if (process.env.CAISSA_CAPTURE_GAME_ACTION_FOOTER === '1') {
        await page.screenshot({ path: 'test-results/game-action-footer/after-normal-1440x900.png', fullPage: true });
    }

    const scrollProbe = await page.locator('#move-list').evaluate(element => {
        element.scrollTop = element.scrollHeight;
        return { scrollTop: element.scrollTop, max: element.scrollHeight - element.clientHeight };
    });
    expect(scrollProbe.max).toBeGreaterThan(0);
    expect(scrollProbe.scrollTop).toBeGreaterThan(0);
    const afterScroll = await gameActionFooterGeometry(page);
    expect(Math.abs(afterScroll.actionFooter.y - normal.actionFooter.y)).toBeLessThan(1);

    const incoming = { ...game, draw_offer_by: 'user_black', version: game.version + 1 };
    harness.state = { ...harness.state, game: incoming, recentGames: [incoming] };
    await page.reload();
    await expect(page.locator('#offer-draw')).toHaveText('Accept draw');
    await expect(page.locator('#decline-draw')).toBeVisible();
    const offered = await gameActionFooterGeometry(page);
    assertGameActionFooterGeometry(offered);
    expect(offered.visibleButtons).toEqual(['Accept draw', 'Decline draw', 'Resign']);
    expect(Math.abs(offered.actionFooter.y - normal.actionFooter.y)).toBeLessThan(1);
    expect(Math.abs(offered.actionFooter.height - normal.actionFooter.height)).toBeLessThan(1);
    if (process.env.CAISSA_CAPTURE_GAME_ACTION_FOOTER === '1') {
        await page.screenshot({ path: 'test-results/game-action-footer/after-incoming-draw-1440x900.png', fullPage: true });
    }

    for (const viewport of [
        { width: 1440, height: 720, label: 'short-desktop' },
        { width: 1152, height: 720, label: 'zoom-125-equivalent' },
        { width: 820, height: 1024, label: 'tablet' },
        { width: 390, height: 844, label: 'mobile' }
    ]) {
        await page.setViewportSize(viewport);
        await page.locator('.game-action-footer').scrollIntoViewIfNeeded();
        const geometry = await gameActionFooterGeometry(page);
        assertGameActionFooterGeometry(geometry);
        expect(geometry.minimumButtonHeight).toBeGreaterThanOrEqual(44);
        expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
        expect(geometry.boardActionsIntersection).toBe(0);
        if (process.env.CAISSA_CAPTURE_GAME_ACTION_FOOTER === '1' && viewport.label === 'mobile') {
            await page.screenshot({ path: 'test-results/game-action-footer/after-incoming-draw-mobile-390x844.png', fullPage: true });
        }
    }

    harness.state = { ...harness.state, game, recentGames: [game] };
    await page.reload();
    await page.locator('.game-action-footer').scrollIntoViewIfNeeded();
    if (process.env.CAISSA_CAPTURE_GAME_ACTION_FOOTER === '1') {
        await page.screenshot({ path: 'test-results/game-action-footer/after-normal-mobile-390x844.png', fullPage: true });
    }
});

test('draw and resign actions are canonical, single-submit, and restore across reconnect', async ({ page }) => {
    const harness = harnesses.get(page);
    const productWarnings = [];
    page.on('console', message => {
        if (message.type() === 'warning' && message.text().startsWith('CAISSA Online:')) {
            productWarnings.push(message.text());
        }
    });
    let game = activeGame();
    harness.state = { ...harness.state, game, recentGames: [game] };
    harness.gameCommandDelayMs = 250;
    await page.goto('/online');

    await page.locator('#offer-draw').evaluate(button => { button.click(); button.click(); });
    await expect(page.locator('.game-actions')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#offer-draw')).toBeDisabled();
    await expect(page.locator('#resign-game')).toBeDisabled();
    await expect.poll(() => harness.commandTypes.filter(type => type === 'game.drawOffer').length).toBe(1);
    await expect(page.locator('#offer-draw')).toHaveText('Draw offered');
    await expect(page.locator('.game-actions')).toHaveAttribute('aria-busy', 'false');

    game = { ...harness.state.game, draw_offer_by: 'user_black', version: harness.state.game.version + 1 };
    harness.state = { ...harness.state, game, recentGames: [game] };
    await page.reload();
    await expect(page.locator('#offer-draw')).toHaveText('Accept draw');
    await page.locator('#decline-draw').click();
    await expect(page.locator('#offer-draw')).toHaveText('Offer draw');
    expect(harness.commandTypes.filter(type => type === 'game.drawDecline')).toHaveLength(1);

    game = { ...harness.state.game, draw_offer_by: 'user_black', version: harness.state.game.version + 1 };
    harness.state = { ...harness.state, game, recentGames: [game] };
    await page.reload();
    await expect(page.locator('#offer-draw')).toHaveText('Accept draw');
    await page.locator('#offer-draw').click();
    await page.locator('#confirm-dialog button[value="confirm"]').click();
    await expect(page.locator('#result-view')).toBeVisible();
    await expect(page.locator('.game-action-footer')).toBeHidden();
    expect(harness.commandTypes.filter(type => type === 'game.drawAccept')).toHaveLength(1);

    game = { ...activeGame(), id: '33333333-3333-4333-8333-333333333333' };
    harness.state = { ...harness.state, game, recentGames: [game] };
    await page.reload();
    await page.locator('#resign-game').click();
    await page.locator('#confirm-dialog button[value="confirm"]').click();
    await expect(page.locator('#result-view')).toBeVisible();
    await expect(page.locator('.game-action-footer')).toBeHidden();
    expect(harness.commandTypes.filter(type => type === 'game.resign')).toHaveLength(1);
    expect(productWarnings).toEqual([]);
});

async function customClockGeometry(page) {
    return page.evaluate(() => {
        const rect = id => {
            const value = document.getElementById(id).getBoundingClientRect();
            return { x: value.x, y: value.y, width: value.width, height: value.height };
        };
        return { minutes: rect('custom-minutes'), increment: rect('custom-increment') };
    });
}

async function gameActionFooterGeometry(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const value = document.querySelector(selector).getBoundingClientRect();
            return { x: value.x, y: value.y, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
        };
        const intersection = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
        const moveList = document.querySelector('#move-list');
        const actionFooterElement = document.querySelector('.game-action-footer');
        const actionFooter = rect('.game-action-footer');
        const infoFooter = rect('.workspace-foot');
        const board = rect('#board-shell');
        const buttons = Array.from(document.querySelectorAll('.game-actions button:not([hidden])'));
        return {
            actionFooter,
            infoFooter,
            moveList: rect('#move-list'),
            actionInfoGap: infoFooter.y - actionFooter.bottom,
            actionInfoIntersection: intersection(actionFooter, infoFooter),
            boardActionsIntersection: intersection(board, actionFooter),
            moveScrollable: moveList.scrollHeight > moveList.clientHeight,
            moveOverflowY: getComputedStyle(moveList).overflowY,
            actionPosition: getComputedStyle(actionFooterElement).position,
            visibleButtons: buttons.map(button => button.textContent.trim()),
            minimumButtonHeight: Math.min(...buttons.map(button => button.getBoundingClientRect().height)),
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

function assertGameActionFooterGeometry(geometry) {
    expect(geometry.actionInfoIntersection).toBe(0);
    expect(geometry.actionInfoGap).toBeGreaterThanOrEqual(0);
    expect(geometry.actionInfoGap).toBeLessThanOrEqual(1);
    expect(geometry.moveList.bottom).toBeLessThanOrEqual(geometry.actionFooter.y + 1);
    expect(geometry.moveOverflowY).toBe('auto');
    expect(geometry.actionPosition).toBe('static');
}

async function lobbyFooterGeometry(page) {
    return page.evaluate(() => {
        const rectangle = selector => {
            const value = document.querySelector(selector).getBoundingClientRect();
            return { x: value.x, y: value.y, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
        };
        const body = rectangle('.workspace-body');
        const access = rectangle('#lobby-access');
        const footer = rectangle('.workspace-foot');
        const actionRows = Array.from(document.querySelectorAll('.lobby-access__actions > *'))
            .map(element => element.getBoundingClientRect().y);
        const intersection = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
        return {
            actionRowDelta: Math.max(...actionRows) - Math.min(...actionRows),
            accessFooterIntersection: intersection(access, footer),
            accessFooterVerticalOverlap: Math.max(0, Math.min(access.bottom, footer.bottom) - Math.max(access.y, footer.y)),
            accessClippedTop: body.y - access.y,
            accessClippedBottom: access.bottom - body.bottom,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

async function mobileNavigationGeometry(page) {
    return page.evaluate(() => {
        const navigation = document.querySelector('.online-side-menu>summary').getBoundingClientRect();
        const board = document.querySelector('#board-shell').getBoundingClientRect();
        const overlapWidth = Math.max(0, Math.min(navigation.right, board.right) - Math.max(navigation.left, board.left));
        const overlapHeight = Math.max(0, Math.min(navigation.bottom, board.bottom) - Math.max(navigation.top, board.top));
        const probeX = Math.max(board.left + 16, 16);
        const probeY = Math.max(board.top + 16, 16);
        const target = document.elementFromPoint(probeX, probeY);
        return {
            navigationTop: navigation.top,
            navigationBottom: navigation.bottom,
            navigationBoardIntersection: overlapWidth * overlapHeight,
            boardProbeInsideBoard: Boolean(target?.closest('#board-shell'))
        };
    });
}

async function onlineLayoutGeometry(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const value = document.querySelector(selector).getBoundingClientRect();
            return {
                x: value.x,
                y: value.y,
                width: value.width,
                height: value.height,
                right: value.right,
                bottom: value.bottom
            };
        };
        const boardColumn = rect('.board-column');
        const panel = rect('.play-workspace');
        const main = rect('.online-main');
        const menuTrigger = rect('.online-side-menu>summary');
        const groupLeft = Math.min(boardColumn.x, panel.x);
        const groupRight = Math.max(boardColumn.right, panel.right);
        const intersectionArea = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
        return {
            main,
            menuTrigger,
            boardColumn,
            board: rect('#board-shell'),
            panel,
            head: rect('.workspace-head'),
            foot: rect('.workspace-foot'),
            gap: panel.x - boardColumn.right,
            groupLeft,
            groupRight,
            groupCenterDelta: ((groupLeft + groupRight) / 2) - ((main.x + main.right) / 2),
            horizontalIntersection: Math.max(
                0,
                Math.min(boardColumn.right, panel.right) - Math.max(boardColumn.x, panel.x)
            ),
            bodyOverflowY: getComputedStyle(document.querySelector('.workspace-body')).overflowY,
            moveListOverflowY: getComputedStyle(document.querySelector('.move-list')).overflowY,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
            boardPanelIntersection: intersectionArea(boardColumn, panel),
            menuBoardIntersection: intersectionArea(menuTrigger, boardColumn)
        };
    });
}

function challengeFixture(overrides = {}) {
    return {
        id: '22222222-2222-4222-8222-222222222222', direction: 'incoming',
        otherClerkId: 'user_black', otherDisplayName: 'Rival', pool: 'blitz',
        baseMs: 180000, incrementMs: 2000, rated: false, state: 'pending',
        expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides
    };
}

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

function completedGame(source = activeGame()) {
    return {
        ...source,
        status: 'completed', result: '0-1', termination: 'resignation', version: Number(source?.version || 1) + 1,
        pgn: '[Event "CAISSA Online"]\n[Result "0-1"]\n\n0-1', clock_started_at: null,
        white_rating_after: 1480, white_rating_delta: -20,
        black_rating_after: 1532, black_rating_delta: 20,
        completed_at: new Date().toISOString()
    };
}

function drawnGame(source = activeGame()) {
    return {
        ...source,
        status: 'completed', result: '1/2-1/2', termination: 'agreement', draw_offer_by: null,
        version: Number(source?.version || 1) + 1,
        pgn: '[Event "CAISSA Online"]\n[Result "1/2-1/2"]\n\n1/2-1/2', clock_started_at: null,
        white_rating_after: source.white_rating_before, white_rating_delta: 0,
        black_rating_after: source.black_rating_before, black_rating_delta: 0,
        completed_at: new Date().toISOString()
    };
}
