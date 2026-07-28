import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

async function openBots(page, viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto('/play/bots?simplified=1');
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
}

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('Bots is QA-only and exposes four truthful differentiated profiles', async ({ page }) => {
    await page.goto('/play/bots');
    expect(new URL(page.url()).pathname).toBe('/play/games');
    await expect(page.locator('.caissa-bots-panel')).toHaveCount(0);
    await openBots(page);
    await expect(page.locator('.caissa-bots-panel__card')).toHaveCount(4);
    await expect(page.getByText(/not formal Elo/i)).toBeVisible();
    const proof = await page.evaluate(() => ({
        mode: window.CaissaSimplifiedPlayShellInstance.getSnapshot().mode,
        profiles: window.CaissaBotRegistry.list().map(profile => ({
            id: profile.id, calibration: profile.calibrationStatus,
            depth: window.CaissaBotPresets.get(profile.enginePresetId).search.depth
        }))
    }));
    expect(proof.mode).toBe('bots');
    expect(proof.profiles.map(item => item.depth)).toEqual([2, 5, 9, 14]);
    expect(proof.profiles.every(item => ['estimated', 'internally-tested'].includes(item.calibration))).toBe(true);
});

test('Play Bot starts once and sends the selected bounded depth through the existing worker', async ({ page }) => {
    await openBots(page);
    await page.getByLabel(/Caissa Grove/).check();
    await page.locator('[data-bot-primary]').click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    const proof = await page.evaluate(() => ({
        session: window.CaissaBotSession.getSnapshot(),
        shell: window.CaissaSimplifiedPlayShellInstance.getSnapshot(),
        harness: window.__caissaPlayHarness.snapshot(),
        isolation: window.CaissaEngineRequestIsolation.inspect()
    }));
    expect(proof.session.activeBotId).toBe('caissa-grove');
    expect(proof.session.search).toEqual({ depth: 9 });
    expect(proof.shell.botsPanel.diagnostics.starts).toBe(1);
    expect(proof.harness.workersCreated).toBe(1);
    expect(proof.harness.workerMessages).toContain('go depth 9');
    expect(proof.isolation.counters.created).toBe(1);
});

test('pending selection does not mutate an active bot; Games starts restore Full Power', async ({ page }) => {
    await openBots(page);
    await page.getByLabel(/Caissa Trail/).check();
    await page.locator('[data-bot-primary]').click();
    await page.getByLabel(/Caissa Summit/).check();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().activeBotId)).toBe('caissa-trail');
    await page.getByRole('tab', { name: 'Games' }).click();
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.locator('[data-games-primary]').click();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().fullPower)).toBe(true);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workerMessages.includes('go movetime 2000'))).toBe(true);
});

test('post-game identity and rematch retain the selected bot', async ({ page }) => {
    await openBots(page);
    await page.getByLabel(/Caissa Summit/).check();
    await page.locator('[data-bot-primary]').click();
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-summary]')).toContainText('Caissa Summit');
    await page.locator('[data-post-game-action="rematch"]').click();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().activeBotId)).toBe('caissa-summit');
});

test('catalog stays reachable and bounded across required viewports', async ({ page }) => {
    await openBots(page, { width: 320, height: 568 });
    for (const [width, height] of [
        [320, 568], [375, 667], [390, 844], [412, 915],
        [768, 1024], [1024, 768], [1366, 768], [1440, 900]
    ]) {
        await page.setViewportSize({ width, height });
        const proof = await page.evaluate(() => {
            const panel = document.querySelector('.caissa-bots-panel');
            const action = document.querySelector('[data-bot-primary]');
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                panelVisible: !!panel && getComputedStyle(panel).display !== 'none',
                actionHeight: action?.getBoundingClientRect().height || 0
            };
        });
        expect(proof.overflow).toBeLessThanOrEqual(1);
        expect(proof.panelVisible).toBe(true);
        expect(proof.actionHeight).toBeGreaterThanOrEqual(44);
    }
});
