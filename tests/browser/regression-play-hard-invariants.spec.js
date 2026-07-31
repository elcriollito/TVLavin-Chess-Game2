import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test('final Season 10 hard invariants remain exact', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await page.goto('/');
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);

    await page.goto('/play');
    await expect(page.locator('.caissa-simplified-shell')).toBeHidden();
    await expect(page.locator('.main-content.cais-grid')).toBeVisible();

    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    const initial = await page.evaluate(() => ({
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        liveRegions: document.querySelectorAll('.caissa-simplified-shell [aria-live]').length,
        shell: window.CaissaSimplifiedPlayShellInstance.getSnapshot(),
        events: window.CaissaEventLifecycle.inspect(),
        lazy: window.CaissaPlayLazyLoader.inspect(),
        lazyScripts: [...document.querySelectorAll('script[data-caissa-lazy-resource]')].map(node => node.src),
        deferred: {
            bots: !!window.CaissaBotsPanel, coach: !!window.CaissaCoachPanel,
            players: !!window.CaissaPlayersPanel, mentor: !!window.CaissaMentorFoundation,
            analyze: !!window.AnalyzeSection
        }
    }));
    expect(initial).toMatchObject({
        boards: 1, workers: 1, liveRegions: 2,
        shell: { qaOnly: true, active: true },
        events: { activeTimers: 0, activeObservers: 0 },
        deferred: { bots: false, coach: false, players: false, mentor: false, analyze: false }
    });
    expect(initial.lazy.resources.filter(resource => resource.state === 'loaded')).toEqual([]);
    expect(new Set(initial.lazyScripts).size).toBe(initial.lazyScripts.length);

    const listenerBaseline = initial.events.activeListeners;
    for (const mode of ['bots', 'coach', 'players', 'games', 'players']) {
        await page.evaluate(value => window.CaissaPlayRouteController.navigate(`/play/${value}?simplified=1`), mode);
        await expect(page.locator(`[data-shell-mode="${mode}"]`)).toHaveAttribute('aria-selected', 'true');
    }
    await expect(page.locator('[data-players-panel]')).toBeVisible();
    const players = await page.evaluate(() => ({
        infrastructure: window.CaissaHumanPlayInfrastructure.getSnapshot(),
        diagnostics: window.CaissaHumanPlayInfrastructure.getSnapshot().diagnostics,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        listeners: window.CaissaEventLifecycle.inspect().activeListeners,
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length
    }));
    expect(players.infrastructure).toMatchObject({ qaOnly: true, productionReady: false });
    expect(players.diagnostics.humanGamesStarted).toBe(0);
    expect(players).toMatchObject({ workers: 1, listeners: listenerBaseline, boards: 1 });

    const disposal = await page.evaluate(() => {
        const shell = window.CaissaSimplifiedPlayShellInstance;
        shell.deactivate();
        const inactive = window.CaissaEventLifecycle.inspect();
        shell.activate();
        return { inactive, active: window.CaissaEventLifecycle.inspect() };
    });
    expect(disposal.inactive.activeTimers).toBe(0);
    expect(disposal.inactive.activeObservers).toBe(0);
    expect(disposal.active.activeListeners).toBe(listenerBaseline);
});
