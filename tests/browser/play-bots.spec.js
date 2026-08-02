import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

async function openBots(page, viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto('/play/bots?simplified=1');
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
}

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('Bots is internal and exposes four unrated evidence-backed personality profiles', async ({ page }) => {
    await page.goto('/play/bots');
    expect(new URL(page.url()).pathname).toBe('/play/games');
    await expect(page.locator('.caissa-bots-panel')).toHaveCount(0);
    await openBots(page);
    await expect(page.locator('.caissa-bots-panel__card')).toHaveCount(4);
    await expect(page.getByText(/QA-only machine opponents/i)).toBeVisible();
    await expect(page.locator('.caissa-bots-panel')).not.toContainText(/\bElo\b/i);
    await expect(page.locator('.caissa-bots-panel')).not.toContainText(/depth|MultiPV|centipawn|Worker URL/i);
    await expect(page.getByText(/Unrated · calibration pending/)).toHaveCount(4);
    await expect(page.getByLabel(/Beginner, Unrated · calibration pending, Limited, with bounded inaccuracies\., beginner/)).toBeVisible();
    await expect(page.getByLabel(/Casual, Unrated · calibration pending, Balanced recreational behavior\., casual/)).toBeVisible();
    await expect(page.getByLabel(/Tactical, Unrated · calibration pending, Prefers sound forcing candidates\., intermediate/)).toBeVisible();
    await expect(page.getByLabel(/Solid, Unrated · calibration pending, Prefers stable, lower-exposure candidates\., advanced/)).toBeVisible();
    await page.getByLabel(/Solid, Unrated/).check();
    const proof = await page.evaluate(() => ({
        mode: window.CaissaSimplifiedPlayShellInstance.getSnapshot().mode,
        profiles: window.CaissaBotRegistry.list().map(profile => ({
            id: profile.id, calibration: profile.calibrationStatus,
            policy: profile.personalityPolicyId
        }))
    }));
    expect(proof.mode).toBe('bots');
    expect(proof.profiles.map(item => item.id)).toEqual(['beginner', 'casual', 'tactical', 'solid']);
    expect(proof.profiles.every(item => ['estimated', 'internally-tested'].includes(item.calibration))).toBe(true);
});

test('Play starts once and sends one bounded personality candidate search through the existing worker', async ({ page }) => {
    await openBots(page);
    await page.getByLabel(/Tactical, Unrated/).check();
    await page.locator('[data-bot-primary]').click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    const proof = await page.evaluate(() => ({
        session: window.CaissaBotSession.getSnapshot(),
        shell: window.CaissaSimplifiedPlayShellInstance.getSnapshot(),
        harness: window.__caissaPlayHarness.snapshot(),
        isolation: window.CaissaEngineRequestIsolation.inspect()
    }));
    expect(proof.session.activeBotId).toBe('tactical');
    expect(proof.session.search.personalityPolicyId).toBe('tactical');
    expect(proof.session.search.candidateCount).toBe(5);
    expect(proof.shell.botsPanel.diagnostics.starts).toBe(1);
    expect(proof.harness.workersCreated).toBe(1);
    expect(proof.harness.workerMessages).toContain('go depth 9');
    expect(proof.isolation.counters.created).toBe(1);
});

test('pending selection does not mutate an active bot; Games starts restore Full Power', async ({ page }) => {
    await openBots(page);
    await page.getByLabel(/Casual, Unrated/).check();
    await page.locator('[data-bot-primary]').click();
    await page.getByLabel(/Solid, Unrated/).check();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().activeBotId)).toBe('casual');
    await page.getByRole('tab', { name: 'Games' }).click();
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.locator('[data-games-primary]').click();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().fullPower)).toBe(true);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workerMessages.includes('go movetime 2000'))).toBe(true);
});

test('an invalid candidate set fails honestly, preserves the profile, and cancels the opponent request', async ({ page }) => {
    await openBots(page);
    await page.getByLabel(/Tactical, Unrated/).check();
    await page.locator('[data-bot-primary]').click();
    await page.evaluate(() => window.__caissaPlayHarness.configure({
        candidateMoves: ['a1a8', 'a1a8', 'a1a8', 'a1a8', 'a1a8']
    }));
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect(page.locator('#engineStatusText')).toHaveText('Bot move unavailable');
    const proof = await page.evaluate(() => ({
        history: window.App.game.history(), selected: window.CaissaBotSession.getSnapshot().activeBotId,
        request: window.CaissaEngineRequestIsolation.getActiveRequest('opponent-move')
    }));
    expect(proof.history).toEqual(['e4']); expect(proof.selected).toBe('tactical'); expect(proof.request).toBeNull();
});

test('post-game identity and rematch retain the selected bot', async ({ page }) => {
    await openBots(page);
    await page.getByLabel(/Solid, Unrated/).check();
    await page.locator('[data-bot-primary]').click();
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Lost'); await expect(page.locator('[data-post-game-reason]')).toHaveText('By Resignation');
    await expect(page.locator('[data-post-game-summary]')).toContainText('Solid');
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await page.locator('[data-post-game-action="rematch"]').click();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().activeBotId)).toBe('solid');
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

test('Bots cards pass serious accessibility checks in forced colors and ordinary rendering', async ({ page }) => {
    await openBots(page, { width: 390, height: 844 });
    const results = await new AxeBuilder({ page }).include('.caissa-bots-panel').analyze();
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await expect(page.getByLabel(/Tactical, Unrated/)).toBeVisible();
    await page.getByLabel(/Tactical, Unrated/).focus();
    expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
});
