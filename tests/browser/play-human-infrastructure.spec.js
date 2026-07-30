import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
});

test('QA Players exposes one truthful infrastructure layer and no fake capability', async ({ page }) => {
    await page.goto('/play/players?simplified=1');
    const panel = page.locator('[data-players-panel]');
    await expect(panel).toBeVisible();
    const status = panel.locator('[data-infrastructure-status]');
    await expect(status).toContainText('Foundation complete');
    await expect(status).toContainText('Runtime incomplete');
    await expect(status).toContainText('Production blocked');
    await expect(status).toContainText('Free Internet Chess Server: provider-entry');
    await expect(status).toContainText('CAISSA presentation over the existing FICS runtime');
    await expect(status).toContainText('Local human play: unsupported');
    await expect(status).toContainText('CAISSA player network: contract-ready');
    const findMatch = status.getByRole('button', { name: 'Find Match' });
    await expect(findMatch).toBeDisabled();
    await expect(status).toContainText('no CAISSA matchmaking backend exists');
    await expect(panel.locator('[data-presence-row]')).toHaveCount(0);
    await expect(panel.locator('[data-challenge-row]')).toHaveCount(0);
});

test('capability snapshot is immutable, bounded, resource-free, and production blocked', async ({ page }) => {
    await page.goto('/play/players?simplified=1');
    const proof = await page.evaluate(() => {
        const api = window.CaissaHumanPlayInfrastructure;
        const snapshot = api.getSnapshot();
        return {
            version: api.schemaVersion, capabilities: snapshot.capabilities.length,
            providers: snapshot.providers.length, sections: snapshot.sections.length,
            frozen: Object.isFrozen(snapshot) && Object.isFrozen(snapshot.capabilities),
            qaOnly: snapshot.qaOnly, productionReady: snapshot.productionReady,
            diagnostics: snapshot.diagnostics,
            size: JSON.stringify(snapshot).length
        };
    });
    expect(proof).toMatchObject({
        version: '1.0.0', capabilities: 26, providers: 4, sections: 5,
        frozen: true, qaOnly: true, productionReady: false
    });
    expect(proof.size).toBeLessThan(30000);
    expect(proof.diagnostics).toMatchObject({
        fakeRecordCount: 0, timerCount: 0, storageWrites: 0,
        lifecycleRotations: 0, fairPlayDecisions: 0, engineChanges: 0,
        gameRecordsCreated: 0, humanGamesStarted: 0
    });
});

test('infrastructure viewing preserves an active machine game and existing resources', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const before = await page.evaluate(() => {
        window.newGame({ mode: 'engine', color: 'white', timeControl: 0 });
        window.__infrastructureIsolation = {
            board: window.App.board, game: window.App.game, worker: window.App.engine?.worker || null
        };
        return {
            fen: window.App.game.fen(), lifecycle: window.App.gameLifecycle?.getSnapshot?.(),
            fairPlay: window.CaissaFairPlayPolicy.inspect()
        };
    });
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/players?simplified=1'));
    await expect(page.locator('[data-infrastructure-status]')).toBeVisible();
    const unchanged = await page.evaluate(() => ({
        sameBoard: window.App.board === window.__infrastructureBoard,
        sameGame: window.App.game === window.__infrastructureIsolation.game,
        sameWorker: (window.App.engine?.worker || null) === window.__infrastructureIsolation.worker,
        fen: window.App.game.fen(),
        lifecycle: window.App.gameLifecycle?.getSnapshot?.(),
        fairPlay: window.CaissaFairPlayPolicy.inspect()
    }));
    unchanged.sameBoard = await page.evaluate(() =>
        window.App.board === window.__infrastructureIsolation.board);
    expect(unchanged.sameBoard).toBe(true);
    expect(unchanged.sameGame).toBe(true);
    expect(unchanged.sameWorker).toBe(true);
    expect(unchanged.fen).toBe(before.fen);
    expect(unchanged.lifecycle?.sessionId).toBe(before.lifecycle?.sessionId);
    expect(unchanged.fairPlay).toEqual(before.fairPlay);
});

test('eight viewports keep infrastructure readable, reachable, and accessible', async ({ page }) => {
    const viewports = [
        { width: 320, height: 568 }, { width: 375, height: 667 },
        { width: 390, height: 844 }, { width: 412, height: 915 },
        { width: 768, height: 1024 }, { width: 1024, height: 768 },
        { width: 1366, height: 768 }, { width: 1440, height: 900 }
    ];
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto('/play/players?simplified=1');
        const status = page.locator('[data-infrastructure-status]');
        await expect(status).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open FICS Lobby' }).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    const results = await new AxeBuilder({ page })
        .include('[data-players-panel]')
        .analyze();
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});
