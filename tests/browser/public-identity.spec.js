import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';

const output = name => `test-results/public-identity/${name}.png`;

async function installAccountFixture(context, initialIdentity) {
    const state = { identity: { ...initialIdentity } };
    await context.addInitScript(() => Object.defineProperty(HTMLScriptElement.prototype, 'integrity', {
        configurable: true, get: () => '', set: () => {}
    }));
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: 'pk_test_public_identity_fixture', registrationTracking: true })
    }));
    await context.route('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js', route => route.fulfill({
        status: 200, contentType: 'text/javascript',
        body: `window.Clerk={user:{id:'synthetic-owner',fullName:'Private Synthetic Name',firstName:'Private',imageUrl:null,primaryEmailAddress:{emailAddress:'private.synthetic@example.test'}},session:{getToken:async()=> 'fixture-token'},load:async()=>{},addListener:()=>{},signOut:async()=>{}};`
    }));
    await context.route('**/api/user/sync', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await context.route('**/api/wallet', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ credits: 5, isPremium: false, role: 'member' }) }));
    await context.route('**/api/beta/access', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }));
    await context.route('**/api/user/public-identity', async route => {
        const request = route.request();
        if (request.method() === 'GET') return route.fulfill({ json: { identity: state.identity } });
        const body = request.postDataJSON();
        if (request.method() === 'POST') {
            const normalizedNickname = String(body.nickname || '').trim();
            return route.fulfill({ json: { available: normalizedNickname !== 'TakenKnight', normalizedNickname } });
        }
        state.identity = {
            ...state.identity,
            nickname: body.nickname || null,
            displayName: body.nickname || state.identity.fallbackAlias,
            hasCustomNickname: Boolean(body.nickname),
            policyVersion: 1,
            version: state.identity.version + 1,
            updatedAt: new Date().toISOString()
        };
        return route.fulfill({ json: { identity: state.identity } });
    });
    return state;
}

async function openAccount(page, options = {}) {
    await page.goto('/endgame-trainer', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => window.CAISSA_AUTH?.status)).toBe('authenticated');
    if (options.direct === true) {
        await page.evaluate(() => window.CaissaUIAuth._openAccountDialog(document.activeElement));
        await expect(page.locator('.caissa-public-identity-dialog')).toBeVisible();
        await expect(page.locator('#public-nickname-input')).toBeEnabled();
        return;
    }
    await page.locator('#sidebarUserInfo').click();
    await page.locator('#sidebarAccountBtn').click();
    await expect(page.locator('.caissa-public-identity-dialog')).toBeVisible();
    await expect(page.locator('#public-nickname-input')).toBeEnabled();
}

test('My Account public identity states are accessible and preserve private/public separation', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const fixture = await installAccountFixture(context, {
        displayName: 'ElCriollito', nickname: 'ElCriollito', fallbackAlias: 'Player-A1B2C3D4E5F60718',
        hasCustomNickname: true, policyVersion: 1, version: 1, updatedAt: '2026-10-14T00:00:00Z'
    });
    const page = await context.newPage();
    await openAccount(page);
    const dialog = page.locator('.caissa-public-identity-dialog');
    await expect(dialog.getByText('Private Synthetic Name')).toBeVisible();
    await expect(dialog.locator('[data-public-preview]')).toHaveText('ElCriollito');
    await dialog.screenshot({ path: output('01-account-desktop-existing') });

    await page.locator('#public-nickname-input').fill('OpenKnight');
    await expect(page.locator('[data-unsaved]')).toBeVisible();
    await dialog.screenshot({ path: output('03-account-editor-open') });
    await page.locator('[data-check-nickname]').click();
    await expect(dialog.locator('[role=status]')).toContainText('is available');
    await dialog.screenshot({ path: output('04-nickname-available') });

    await page.locator('#public-nickname-input').fill('TakenKnight');
    await page.locator('[data-check-nickname]').click();
    await expect(dialog.locator('[role=status]')).toContainText('unavailable');
    await dialog.screenshot({ path: output('05-nickname-occupied') });

    await page.locator('#public-nickname-input').fill('ÉchecsRoyal');
    await page.locator('.public-identity-save').click();
    await expect(dialog.locator('[role=status]')).toHaveText('Public identity saved.');
    await expect(page.locator('[data-public-preview]')).toHaveText('ÉchecsRoyal');
    await dialog.screenshot({ path: output('06-nickname-saved') });

    await page.locator('#public-nickname-input').fill('Knight\u202Evil');
    await expect(dialog.locator('[role=status]')).toContainText('Invisible');
    await dialog.screenshot({ path: output('07-unicode-validation-error') });

    fixture.identity = {
        displayName: 'Player-FE12DC34BA987654', nickname: null, fallbackAlias: 'Player-FE12DC34BA987654',
        hasCustomNickname: false, policyVersion: 1, version: 1, updatedAt: '2026-10-14T00:00:00Z'
    };
    await page.locator('.public-identity-close').click();
    const mobileToggle = page.locator('.caissa-standalone-mobile-toggle');
    if (await mobileToggle.isVisible() && !await page.locator('#mainNav').isVisible()) await mobileToggle.click();
    await page.locator('#sidebarUserInfo').click();
    await page.locator('#sidebarAccountBtn').click();
    await expect(page.locator('[data-public-preview]')).toHaveText('Player-FE12DC34BA987654');
    await dialog.screenshot({ path: output('02-account-desktop-fallback') });

    const serious = (await new AxeBuilder({ page }).include('.caissa-public-identity-dialog').analyze())
        .violations.filter(item => ['critical', 'serious'].includes(item.impact));
    expect(serious).toEqual([]);
    await page.evaluate(() => {
        window.CAISSA_AUTH.publicIdentity = { displayName: 'MustBeCleared' };
        window.dispatchEvent(new CustomEvent('caissa-auth-change', {
            detail: { isSignedIn: false, userId: null }
        }));
    });
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => window.CAISSA_AUTH.publicIdentity)).toBeNull();
    await context.close();
});

test('My Account remains usable at 390px and 340px without horizontal overflow', async ({ browser }) => {
    for (const width of [390, 340]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        await installAccountFixture(context, {
            displayName: 'Player-0A1B2C3D4E5F6789', nickname: null, fallbackAlias: 'Player-0A1B2C3D4E5F6789',
            hasCustomNickname: false, policyVersion: 1, version: 1, updatedAt: '2026-10-14T00:00:00Z'
        });
        const page = await context.newPage();
        await openAccount(page, { direct: true });
        const metrics = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            dialogWidth: document.querySelector('.caissa-public-identity-dialog').getBoundingClientRect().width,
            viewport: innerWidth
        }));
        expect(metrics.overflow).toBeLessThanOrEqual(0);
        expect(metrics.dialogWidth).toBeLessThanOrEqual(metrics.viewport);
        await expect(page.locator('.public-identity-save')).toBeVisible();
        if (width === 390) {
            await page.locator('.public-identity-save').scrollIntoViewIfNeeded();
            await page.locator('.caissa-public-identity-dialog').screenshot({ path: output('08-account-mobile-390x844') });
        }
        await context.close();
    }
});

test('My Account remains bounded at reduced desktop height and a 125% equivalent viewport', async ({ browser }) => {
    for (const viewport of [{ width: 1440, height: 720 }, { width: 1152, height: 720 }]) {
        const context = await browser.newContext({ viewport });
        await installAccountFixture(context, {
            displayName: 'SafeKnight', nickname: 'SafeKnight', fallbackAlias: 'Player-1122334455667788',
            hasCustomNickname: true, policyVersion: 1, version: 1, updatedAt: '2026-10-14T00:00:00Z'
        });
        const page = await context.newPage();
        await openAccount(page, { direct: true });
        const metrics = await page.evaluate(() => {
            const dialog = document.querySelector('.caissa-public-identity-dialog');
            const rect = dialog.getBoundingClientRect();
            return {
                pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                dialogRight: rect.right,
                dialogBottom: rect.bottom,
                viewportWidth: innerWidth,
                viewportHeight: innerHeight
            };
        });
        expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
        expect(metrics.dialogRight).toBeLessThanOrEqual(metrics.viewportWidth);
        expect(metrics.dialogBottom).toBeLessThanOrEqual(metrics.viewportHeight);
        await page.locator('.public-identity-save').scrollIntoViewIfNeeded();
        await expect(page.locator('.public-identity-save')).toBeVisible();
        await expect(page.locator('.public-identity-close')).toBeVisible();
        await context.close();
    }
});

test('Online surfaces render only public snapshots and preserve temporary guest aliases', async ({ page }) => {
    const game = activeGame();
    const history = {
        ...game,
        id: '22222222-2222-4222-8222-222222222222',
        identity_policy_version: 0,
        black_clerk_id: 'synthetic_b',
        black_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        black_display_name: 'Player-ABCDEF0123456789',
        status: 'completed', result: '1-0', termination: 'resignation',
        pgn: '[Event "CAISSA Online"]\n[White "RoyalKnight"]\n[Black "Player-ABCDEF0123456789"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0',
        clock_started_at: null, completed_at: new Date().toISOString()
    };
    const state = {
        profile: { display_name: 'RoyalKnight' }, ticket: null, game, recentGames: [history], challenges: [],
        players: [
            { clerkId: 'synthetic_b', displayName: 'OpenKnight', status: 'online', rating: 1512, pool: 'blitz' },
            { clerkId: 'guest_subject', displayName: 'Guest-AB12CD', status: 'playing', rating: null, pool: 'blitz' }
        ]
    };
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript', body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'synthetic_a',fullName:'Private Name Must Not Render',email:'private@example.test',getToken:async()=> 'fixture-token',whenReady:async()=>window.CAISSA_AUTH};`
    }));
    await page.route('**/api/online**', route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('action') === 'config') return route.fulfill({ json: {
            protocolVersion: '1.0.0', rollout: 'preview', enabled: true,
            capabilities: { matchmaking: true, rated: false, tournaments: false, guestPlay: true }, realtime: null
        } });
        return route.fulfill({ json: { protocolVersion: '1.0.0', eventType: 'game.snapshot', serverTimestamp: new Date().toISOString(), data: { state } } });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/online');
    await expect(page.locator('#player-bottom .player-name')).toHaveText('RoyalKnight');
    await expect(page.locator('#player-top .player-name')).toHaveText('Guest-AB12CD');
    await expect(page.locator('.online-layout').getByText('Private Name Must Not Render')).toHaveCount(0);
    await page.screenshot({ path: output('09-new-game-canonical-player-strips'), fullPage: true });

    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Players' }).click();
    await expect(page.locator('#players-list')).toContainText('OpenKnight');
    await expect(page.locator('#players-list')).toContainText('Guest-AB12CD');
    await page.locator('.play-workspace').screenshot({ path: output('10-online-players-directory') });

    await page.getByRole('tab', { name: 'Games', exact: true }).click();
    await page.getByRole('tab', { name: 'Game History' }).click();
    await expect(page.locator('#games-list')).toContainText('RoyalKnight');
    await expect(page.locator('#games-list')).toContainText('Player-ABCDEF0123456789');
    await expect(page.locator('#games-list')).not.toContainText('private@example.test');
    await page.locator('.play-workspace').screenshot({ path: output('11-online-game-history-sanitized') });

    state.game = null;
    await page.locator('#games-list .game-row').click();
    await expect(page.locator('#result-view')).toBeVisible();
    await page.locator('#result-view').screenshot({ path: output('13-historical-game-sanitized') });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-pgn').click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const exportedPgn = await fs.readFile(downloadPath, 'utf8');
    expect(exportedPgn).toContain('[White "RoyalKnight"]');
    expect(exportedPgn).toContain('[Black "Player-ABCDEF0123456789"]');
    expect(exportedPgn).not.toContain('private@example.test');
    await download.saveAs('test-results/public-identity/14-historical-export-sanitized.pgn');

    await page.getByRole('tab', { name: 'Lobby', exact: true }).click();
    await page.locator('.lobby-subtabs').getByRole('tab', { name: 'Players' }).click();
    await page.locator('.play-workspace').screenshot({ path: output('12-guest-vs-registered') });
});

function activeGame() {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    return {
        id: '11111111-1111-4111-8111-111111111111', protocol_version: '1.0.0', status: 'active',
        pool: 'blitz', rated: false, base_ms: 180000, increment_ms: 2000,
        white_clerk_id: 'synthetic_a', black_clerk_id: 'guest_subject',
        white_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        black_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        identity_policy_version: 1,
        white_display_name: 'RoyalKnight', black_display_name: 'Guest-AB12CD', initial_fen: fen, fen,
        moves: [], pgn: '', ply: 0, turn: 'white', version: 1,
        white_time_ms: 180000, black_time_ms: 180000,
        white_rating_before: 1500, black_rating_before: null,
        clock_started_at: new Date(Date.now() + 5000).toISOString(), created_at: new Date().toISOString()
    };
}
