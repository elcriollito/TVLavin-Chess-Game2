import { test, expect } from '@playwright/test';

test('internal-only rejection is explicit and leaves no usable Join or Ready state', async ({ page }) => {
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'unapproved_human',fullName:'Human Tester',email:'human@example.test',getToken:async()=> 'denied-token',whenReady:async()=>window.CAISSA_AUTH};queueMicrotask(()=>window.dispatchEvent(new CustomEvent('caissa-auth-change',{detail:window.CAISSA_AUTH})));`
    }));
    await page.route('**/api/online**', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.searchParams.get('action') === 'config') {
            return route.fulfill({ json: {
                protocolVersion: '1.0.0', rollout: 'internal', enabled: true,
                capabilities: { matchmaking: true, tournaments: true, arenaS001: true },
                realtime: null
            } });
        }
        return route.fulfill({ status: 403, json: { code: 'ONLINE_INTERNAL_ONLY' } });
    });

    await page.goto('/online/tournaments');

    await expect(page.locator('#connection-label')).toHaveText('Access denied');
    await expect(page.locator('#workspace-title')).toHaveText('Access required');
    await expect(page.locator('#game-badge')).toHaveText('ACCESS DENIED');
    await expect(page.locator('#curtain-title')).toHaveText('Private beta access denied');
    await expect(page.locator('#curtain-copy')).toContainText('not authorized');
    await expect(page.locator('#tab-tournaments')).toBeVisible();
    await expect(page.locator('#arena-directory')).toBeHidden();
    await expect(page.locator('#find-game')).toBeDisabled();
    await expect(page.locator('#find-game')).toHaveText('Access required');
    await expect(page.locator('#arena-join')).toBeHidden();
});
