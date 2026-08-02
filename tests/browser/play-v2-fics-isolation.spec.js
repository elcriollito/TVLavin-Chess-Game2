import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test('Play v2 emits no FICS request/resource/identity surface and cannot fall back after load failure', async ({ page }) => {
    const requests = [];
    page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (/fics|freechess/i.test(pathname) && !/play-v2-fics-isolation\.js$/i.test(pathname)) requests.push(request.url());
    });
    await instrumentPlay(page, { autoReply: false });
    await page.goto('/play/games?simplified=1&provider=fics&fallback=fics');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.evaluate(async () => {
        try { await window.CaissaPlayLazyLoader.load('players-stack', { qa: true, retry: true }); } catch (_) {}
        window.CaissaPlayRouteController.navigate('/play/players?simplified=1&provider=fics');
    });
    await expect(page).toHaveURL(/\/play\/games\?simplified=1/);
    const proof = await page.evaluate(() => ({
        playersGlobal: !!window.CaissaPlayersPanel,
        playersPanel: document.querySelectorAll('[data-players-panel]').length,
        providerRows: document.querySelectorAll('[data-player-provider],[data-player-rating],[data-challenge-id]').length,
        ficsText: /FICS|Free Internet Chess Server/i.test(document.querySelector('[data-caissa-simplified-shell]')?.textContent || ''),
        ficsScripts: [...document.scripts].filter(node => /js\/play\/players|fics-(?:presence|challenge|human)/i.test(node.src)).length,
        group: window.CaissaPlayLoadRegistry.get('players-stack'),
        policy: window.CaissaPlayV2FicsIsolation.policy
    }));
    expect(proof).toMatchObject({ playersGlobal: false, playersPanel: 0, providerRows: 0,
        ficsText: false, ficsScripts: 0, group: null });
    expect(proof.policy.playersRuntime).toBe('blocked');
    expect(requests).toEqual([]);
});

test('QA and legacy documents retain separate resource ownership', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    expect(await page.locator('body').getAttribute('data-caissa-play-v2-entry')).toBe('qa-only');
    expect(await page.evaluate(() => [...document.styleSheets, ...document.scripts]
        .map(resource => resource.href || resource.src)
        .filter(Boolean)
        .filter(source => /(?:css|js)\/fics|js\/play\/players\//i.test(new URL(source).pathname)))).toEqual([]);

    await page.goto('/play');
    expect(await page.locator('body').getAttribute('data-caissa-play-v2-entry')).toBeNull();
    expect(await page.evaluate(() => [...document.scripts].some(node => /js\/fics-client\.js/i.test(node.src)))).toBe(true);

    await page.goto('/');
    expect(await page.evaluate(() => [...document.scripts].some(node => /js\/fics-style12\.js/i.test(node.src)))).toBe(true);

    await page.goto('/yahoo-classic');
    expect(await page.evaluate(() => [...document.scripts].some(node => /js\/fics-client\.js/i.test(node.src)))).toBe(true);
});

test('Games retains one board and Bots creates its Worker only after Play', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await page.goto('/play/beta/games');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.goto('/play/beta/bots');
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    expect(await page.evaluate(() => ({
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        botsAllowed: window.CaissaPlayV2FicsIsolation.authorize({ type: 'dynamic-group', value: 'bots-stack' }).allowed,
        playersAllowed: window.CaissaPlayV2FicsIsolation.isModeAllowed('players')
    }))).toEqual({ boards: 1, workers: 0, botsAllowed: true, playersAllowed: false });
    await page.locator('[data-bot-primary]').click();
    await expect.poll(() => page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(1);
});
