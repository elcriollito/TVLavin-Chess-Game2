import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

test.use({ serviceWorkers: 'block' });

test('cold throttled postgame navigation does not reveal the embedded Analyzer', async ({ page, browserName }) => {
    test.setTimeout(150_000);
    test.skip(browserName !== 'chromium', 'Chromium CDP supplies deterministic network throttling.');
    await instrumentPlay(page);

    const navigations = [];
    const requestedScripts = [];
    const legacyVisibility = [];
    page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    page.on('request', request => {
        if (request.resourceType() === 'script') requestedScripts.push({
            url: request.url(),
            frameUrl: request.frame().url()
        });
    });
    page.on('console', message => {
        if (message.text().startsWith('__CAISSA_LEGACY_ANALYZE_VISIBLE__')) {
            legacyVisibility.push(message.text());
        }
    });
    await page.addInitScript(() => {
        const inspect = reason => {
            const section = document.getElementById('analyzeSection');
            if (!section || !location.pathname.startsWith('/play')) return;
            const style = getComputedStyle(section);
            const rect = section.getBoundingClientRect();
            const visible = section.classList.contains('active')
                || (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0);
            if (visible) console.info(`__CAISSA_LEGACY_ANALYZE_VISIBLE__${reason}`);
        };
        document.addEventListener('DOMContentLoaded', () => {
            inspect('domcontentloaded');
            const observer = new MutationObserver(() => inspect('mutation'));
            observer.observe(document.documentElement, {
                attributes: true, childList: true, subtree: true,
                attributeFilter: ['class', 'hidden', 'style', 'aria-hidden']
            });
        }, { once: true });
        addEventListener('pagehide', () => inspect('pagehide'), { once: true });
    });

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 300,
        downloadThroughput: 1024 * 1024 / 8,
        uploadThroughput: 512 * 1024 / 8,
        connectionType: 'cellular4g'
    });

    const response = await page.goto('/play/games', { waitUntil: 'domcontentloaded' });
    const playHtml = await response.text();
    expect(playHtml).not.toContain('id="analyzeSection"');
    expect(playHtml).not.toContain('js/play/play-v2-inline-analyze.js');
    expect(playHtml).not.toContain('data-caissa-analyze-v2');
    await expect(page.locator('[data-games-primary]')).toBeEnabled({ timeout: 30_000 });
    await page.locator('[data-games-primary]').click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App?.game?.history?.().length || 0), {
        timeout: 30_000
    }).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => {
        window.confirm = () => true;
        window.resignGame();
    });
    await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();

    await Promise.all([
        page.waitForURL(/\/analyze\?handoff=[A-Za-z0-9_-]+$/, { waitUntil: 'commit', timeout: 60_000 }),
        page.locator('[data-post-game-action="analyze"]:visible').first().click()
    ]);
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
        connectionType: 'none'
    });
    await expect(page).toHaveURL(/\/analyze\?handoff=[A-Za-z0-9_-]+$/);
    await expect(page.locator('[data-caissa-analyze-v2]')).toHaveAttribute('data-analyze-v2-ready', 'true', {
        timeout: 30_000
    });

    const legacyControllerRequested = requestedScripts.some(item => item.url.includes('play-v2-inline-analyze.js'));
    const playAnalyzeDeepRequests = requestedScripts.filter(item => new URL(item.frameUrl).pathname.startsWith('/play')
        && /analyze-(?:section|session|game-import|v2-shell)\.js/.test(item.url));
    console.log(JSON.stringify({ navigations, legacyVisibility, legacyControllerRequested, playAnalyzeDeepRequests }));
    expect(legacyVisibility).toEqual([]);
    expect(legacyControllerRequested).toBe(false);
    expect(playAnalyzeDeepRequests).toEqual([]);
});
