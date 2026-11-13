import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

async function startBotGame(page, botLabel) {
    await page.goto('/play/bots?simplified=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    if (botLabel) await page.getByLabel(botLabel).check();
    await page.locator('[data-bot-primary]').click();
    await expect(page.locator('[data-caissa-bots-shell]'))
        .toHaveAttribute('data-bot-shell-phase', 'active-game');
}

async function playThreeTurns(page) {
    for (let turn = 0; turn < 3; turn += 1) {
        const before = await page.evaluate(() => window.App.game.history().length);
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(move).toBeTruthy();
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(before + 2);
    }
}

async function installDiagnostics(page, { deterministicEngine = true, engineScenario = {} } = {}) {
    if (deterministicEngine) await instrumentPlay(page, engineScenario);
    else {
        await page.route('**/api/public-auth-config', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ publishableKey: '' })
        }));
        await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    }
    await page.addInitScript(() => {
        window.__caissaResignHotfix = { unhandled: [], fetches: [], xhr: [] };
        window.addEventListener('unhandledrejection', event => {
            window.__caissaResignHotfix.unhandled.push({
                message: String(event.reason?.message || event.reason || ''),
                code: event.reason?.code || null,
                stack: String(event.reason?.stack || '')
            });
        });
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (...args) => {
            window.__caissaResignHotfix.fetches.push(String(args[0]?.url || args[0] || ''));
            return nativeFetch(...args);
        };
        const nativeOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            window.__caissaResignHotfix.xhr.push(`${method} ${url}`);
            return nativeOpen.call(this, method, url, ...rest);
        };
    });
}

test('confirmed resignation completes once for Pip and a second bot', async ({ page }, testInfo) => {
    await installDiagnostics(page);
    await page.setViewportSize(testInfo.project.name === 'webkit'
        ? { width: 390, height: 844 } : { width: 430, height: 932 });
    await startBotGame(page, /Pip, 100 Elo target/);
    await playThreeTurns(page);

    const before = await page.evaluate(() => ({
        teardownCount: window.CaissaPlayV2BotWorkerReadiness.getSnapshot().diagnostics.teardowns,
        fetchCount: window.__caissaResignHotfix.fetches.length,
        xhrCount: window.__caissaResignHotfix.xhr.length
    }));
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('[data-caissa-bots-shell]'))
        .toHaveAttribute('data-bot-shell-phase', 'game-over');
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await page.waitForTimeout(50);

    const result = await page.evaluate(() => ({
        gameActive: window.App.gameActive,
        gameStatus: { ...window.App.gameStatus },
        lifecycle: window.CaissaGameLifecycle.getSnapshot(),
        worker: window.CaissaPlayV2BotWorkerReadiness.getSnapshot(),
        notification: document.getElementById('notification')?.textContent || '',
        evidence: window.__caissaResignHotfix
    }));
    expect(result.gameActive).toBe(false);
    expect(result.gameStatus.state).toBe('White resigned');
    expect(result.lifecycle.state).toBe('completed');
    expect(result.worker.activeWorkerCount).toBe(0);
    expect(result.worker.diagnostics.teardowns - before.teardownCount).toBe(1);
    expect(result.evidence.fetches.length).toBe(before.fetchCount);
    expect(result.evidence.xhr.length).toBe(before.xhrCount);
    expect(result.evidence.unhandled).toEqual([]);
    expect(result.notification).not.toBe('An error occurred while processing your request.');

    await page.screenshot({
        path: `test-results/play-bots-resign-${testInfo.project.name}-${page.viewportSize().width}.png`,
        fullPage: true
    });

    await page.locator('[data-post-game-action="new-game"]').click();
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await page.getByLabel(/Nia, 150 Elo target/).check();
    await page.locator('[data-bot-primary]').click();
    await expect(page.locator('[data-caissa-bots-shell]'))
        .toHaveAttribute('data-bot-shell-phase', 'active-game');
    await playThreeTurns(page);
    const secondBefore = await page.evaluate(() =>
        window.CaissaPlayV2BotWorkerReadiness.getSnapshot().diagnostics.teardowns);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('[data-caissa-bots-shell]'))
        .toHaveAttribute('data-bot-shell-phase', 'game-over');
    await page.waitForTimeout(50);
    const secondResult = await page.evaluate(() => ({
        gameActive: window.App.gameActive,
        gameStatus: { ...window.App.gameStatus },
        lifecycle: window.CaissaGameLifecycle.getSnapshot(),
        worker: window.CaissaPlayV2BotWorkerReadiness.getSnapshot(),
        notification: document.getElementById('notification')?.textContent || '',
        evidence: window.__caissaResignHotfix
    }));
    expect(secondResult.gameActive).toBe(false);
    expect(secondResult.gameStatus.state).toBe('White resigned');
    expect(secondResult.lifecycle.state).toBe('completed');
    expect(secondResult.worker.activeWorkerCount).toBe(0);
    expect(secondResult.worker.diagnostics.teardowns - secondBefore).toBe(1);
    expect(secondResult.evidence.unhandled).toEqual([]);
    expect(secondResult.notification).not.toBe('An error occurred while processing your request.');

    await page.locator('[data-post-game-action="analyze"]:visible').click();
    await page.waitForURL(url => url.pathname === '/analyze' && Boolean(url.searchParams.get('handoff')));
    expect(new URL(page.url()).pathname).toBe('/analyze');
});

test('real browser engine resignation exposes no teardown rejection', async ({ page }, testInfo) => {
    await installDiagnostics(page, { deterministicEngine: false });
    await page.setViewportSize(testInfo.project.name === 'webkit'
        ? { width: 390, height: 844 } : { width: 430, height: 932 });
    await startBotGame(page, /Pip, 100 Elo target/);
    await playThreeTurns(page);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('[data-caissa-bots-shell]'))
        .toHaveAttribute('data-bot-shell-phase', 'game-over');
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => ({
        unhandled: window.__caissaResignHotfix.unhandled,
        notification: document.getElementById('notification')?.textContent || '',
        worker: window.CaissaPlayV2BotWorkerReadiness.getSnapshot(),
        gameActive: window.App.gameActive,
        lifecycle: window.CaissaGameLifecycle.getSnapshot()
    }));
    expect(result.gameActive).toBe(false);
    expect(result.lifecycle.state).toBe('completed');
    expect(result.worker.activeWorkerCount).toBe(0);
    expect(result.unhandled).toEqual([]);
    expect(result.notification).not.toBe('An error occurred while processing your request.');
});

test('resignation while the bot is thinking cancels cleanly', async ({ page }) => {
    await installDiagnostics(page, { engineScenario: { delayMs: 1000 } });
    await page.setViewportSize({ width: 390, height: 844 });
    await startBotGame(page, /Pip, 100 Elo target/);
    for (let turn = 0; turn < 1; turn += 1) {
        const before = await page.evaluate(() => window.App.game.history().length);
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length), { timeout: 5_000 })
            .toBe(before + 2);
    }
    const searchesBefore = await page.evaluate(() => window.__caissaPlayHarness.snapshot()
        .workerMessages.filter(message => message.startsWith('go ')).length);
    const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
    expect(await playMove(page, move.from, move.to)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__caissaPlayHarness.snapshot()
        .workerMessages.filter(message => message.startsWith('go ')).length)).toBe(searchesBefore + 1);
    await page.evaluate(() => {
        window.__caissaResignHotfix.sequence = [];
        const engine = window.App.engine;
        const stopAnalysis = engine.stopAnalysis.bind(engine);
        const terminate = engine.terminate.bind(engine);
        engine.stopAnalysis = (...args) => {
            window.__caissaResignHotfix.sequence.push('stop-analysis');
            return stopAnalysis(...args);
        };
        engine.terminate = (...args) => {
            window.__caissaResignHotfix.sequence.push(`terminate:${args[0] || ''}`);
            return terminate(...args);
        };
    });

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('[data-caissa-bots-shell]'))
        .toHaveAttribute('data-bot-shell-phase', 'game-over');
    await page.waitForTimeout(50);
    const result = await page.evaluate(() => ({
        unhandled: window.__caissaResignHotfix.unhandled,
        notification: document.getElementById('notification')?.textContent || '',
        worker: window.CaissaPlayV2BotWorkerReadiness.getSnapshot(),
        lifecycle: window.CaissaGameLifecycle.getSnapshot(),
        sequence: window.__caissaResignHotfix.sequence
    }));
    expect(result.lifecycle.state).toBe('completed');
    expect(result.worker.activeWorkerCount).toBe(0);
    expect(result.unhandled).toEqual([]);
    expect(result.notification).not.toBe('An error occurred while processing your request.');
    expect(result.sequence[0]).toBe('terminate:postgame');
    expect(result.sequence.filter(entry => entry === 'stop-analysis').length).toBeLessThanOrEqual(1);
});
