import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('signed-out visitor is sent through the member sign-in flow before creation', async ({ page }) => {
    await installHarness(page, { signedIn: false });
    await page.goto('/online');
    await page.locator('#tab-tournaments').click();
    await page.locator('#tournament-empty-create').click();

    await expect(page.locator('#signin-dialog')).toBeVisible();
    await expect(page.locator('#signin-dialog-title')).toHaveText('Sign in for CAISSA Tournaments');
    await expect(page.locator('#signin-dialog-copy')).toContainText('member account');
    if (process.env.CAISSA_CAPTURE_HFX_007 === '1') {
        await page.screenshot({
            path: 'docs/reports/evidence/hfx-007/signed-out-create-gate.png',
            fullPage: true
        });
    }
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/signin');
    expect(new URL(page.url()).searchParams.get('redirect_url'))
        .toBe('/online/tournaments?directory=1&create=1');
});

test('guest is prompted to upgrade to a member session and cannot submit creation', async ({ page }) => {
    const harness = await installHarness(page, { signedIn: true, guest: true });
    await page.goto('/online');
    await page.locator('#tab-tournaments').click();
    await page.locator('#tournament-empty-create').click();

    await expect(page.locator('#signin-dialog')).toBeVisible();
    await expect(page.locator('#signin-dialog-copy')).toContainText('member account');
    expect(harness.commands.filter(command => /^(tournament|daily)\.create$/u.test(command.eventType)))
        .toHaveLength(0);
});

test('ordinary member and official administrator see the same one-time CTA without recurrence UI', async ({ page }) => {
    const harness = await installHarness(page, { signedIn: true, communityCreator: true, admin: false });
    await page.goto('/online/tournaments?directory=1');
    await expect(page.locator('#tournament-directory-create')).toBeVisible();
    await page.locator('#tournament-directory-create').click();
    await expect(page.locator('#directory-panel-create')).toBeVisible();
    await expect(page.locator('#arena-create-title')).toBeFocused();
    await expect(page.locator('#arena-create-repeat')).toHaveCount(0);
    await expect(page.locator('#arena-create-recurrence')).toHaveCount(0);
    await expect(page.locator('#weekly-admin-controls')).toHaveCount(0);
    const accessibility = await new AxeBuilder({ page })
        .include('#tournament-directory-dialog')
        .analyze();
    expect(accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact)))
        .toEqual([]);
    if (process.env.CAISSA_CAPTURE_HFX_007 === '1') {
        await page.screenshot({
            path: 'docs/reports/evidence/hfx-007/community-create-desktop.png',
            fullPage: true
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
            path: 'docs/reports/evidence/hfx-007/community-create-mobile.png',
            fullPage: true
        });
    }

    harness.state.permissions.tournamentOrganizer = true;
    await page.reload();
    await expect(page.locator('#tournament-directory-create')).toBeVisible();
    await expect(page.locator('#weekly-admin-controls')).toHaveCount(0);
});

async function installHarness(page, {
    signedIn,
    guest = false,
    communityCreator = false,
    admin = false
}) {
    const harness = {
        commands: [],
        state: {
            profile: { display_name: guest ? 'Guest Player' : 'Community Member' },
            ticket: null, game: null, recentGames: [], players: [], challenges: [],
            permissions: {
                communityTournamentCreator: communityCreator,
                tournamentOrganizer: admin,
                recurringTournamentCreator: false
            },
            arena: { tournaments: [], current: null },
            daily: { tournaments: [], current: null, games: [], game: null, recentGames: [] }
        }
    };
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:${signedIn},isGuest:${guest},userId:${signedIn ? `'${guest ? 'guest_hfx007' : 'member_hfx007'}'` : 'null'},fullName:'Community Member',email:null,getToken:async()=>${signedIn ? "'hfx007-token'" : 'null'},whenReady:async()=>window.CAISSA_AUTH};`
    }));
    await page.route('**/api/online**', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.searchParams.get('action') === 'config') {
            return route.fulfill({ json: {
                protocolVersion: '1.0.0', rollout: 'preview', enabled: true,
                capabilities: {
                    matchmaking: true, guestPlay: false, rated: false,
                    tournaments: true, arenaS001: true, tournamentCreation: true,
                    dailyTournamentCreation: false, dailyTournaments: false,
                    publicTournamentDirectory: false, recurringTournaments: true
                }, realtime: null
            } });
        }
        if (request.method() === 'POST') harness.commands.push(request.postDataJSON());
        return route.fulfill({ json: {
            protocolVersion: '1.0.0', eventType: 'game.snapshot',
            serverTimestamp: new Date().toISOString(), data: { state: harness.state }
        } });
    });
    return harness;
}
