import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

async function openBots(page, viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto('/play/bots?simplified=1');
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
}

async function openCategory(page, name) {
    await page.getByRole('tab', { name: new RegExp(`^.*${name}`) }).click();
}

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('Bots is canonical and exposes the Classic piece ladder without engine internals', async ({ page }) => {
    await page.goto('/play/bots');
    expect(new URL(page.url()).pathname).toBe('/play/bots');
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await openBots(page);
    await expect(page.locator('[data-bot-card]')).toHaveCount(44);
    await expect(page.locator('.caissa-bots-panel__bot.is-preview-ready')).toHaveCount(44);
    await expect(page.getByRole('tab', { name: 'Play Bots' })).toBeVisible();
    await expect(page.locator('.caissa-bots-panel__title,.caissa-bots-panel__collection')).toHaveCount(0);
    await expect(page.locator('.caissa-bots-panel')).not.toContainText(/depth|MultiPV|centipawn|Worker URL/i);
    await expect(page.getByLabel(/Pip, 100 Elo target, New to Chess, preview ready/)).toBeVisible();
    await expect(page.locator('[data-bot-category-nav]')).toBeVisible();
    await openCategory(page, 'Intermediate');
    await expect(page.getByLabel(/Nora, 1000 Elo target, Intermediate, preview ready/)).toBeVisible();
    await openCategory(page, 'CM');
    await expect(page.getByLabel(/Manuel, 2200 Elo target, CM, preview ready/)).toBeVisible();
    await expect(page.getByLabel(/Pepe, 2250 Elo target, CM, preview ready/)).toBeVisible();
    await openCategory(page, 'GM');
    await expect(page.getByLabel(/Freya, 2800 Elo target, GM, preview ready/)).toBeVisible();
    await page.getByLabel(/Freya, 2800 Elo target/).check();
    await expect(page.locator('[data-bot-selected]')).toContainText('Freya');
    await expect(page.locator('[data-bot-selected]')).toContainText('GM · 2800 Elo target');
    await expect(page.locator('[data-bot-selected] img')).toBeVisible();
    await expect(page.locator('[data-bot-primary]')).toBeEnabled();
    const proof = await page.evaluate(() => ({
        mode: window.CaissaSimplifiedPlayShellInstance.getSnapshot().mode,
        selection: window.CaissaSimplifiedPlayShellInstance.getSnapshot().botsPanel,
        roster: window.CaissaBotCollections.classic.bots.map(bot => ({ id: bot.id, availability: bot.availability }))
    }));
    expect(proof.mode).toBe('bots');
    expect(proof.selection.selectedBotId).toBe('freya');
    expect(proof.selection.selectedCategoryId).toBe('grandmaster');
    expect(proof.selection.selectedEngineProfileId).toBeNull();
    expect(proof.selection.selectedStrengthProfileId).toBe('strength-2800');
    expect(proof.roster.filter(item => item.availability === 'qa-only')).toHaveLength(44);
});

test('Play starts once and sends one bounded personality candidate search through the existing worker', async ({ page }) => {
    await openBots(page);
    await openCategory(page, 'Intermediate');
    await page.getByLabel(/Nora, 1000 Elo target/).check();
    await page.locator('[data-bot-primary]').click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    const proof = await page.evaluate(() => ({
        session: window.CaissaBotSession.getSnapshot(),
        shell: window.CaissaSimplifiedPlayShellInstance.getSnapshot(),
        harness: window.__caissaPlayHarness.snapshot(),
        isolation: window.CaissaEngineRequestIsolation.inspect()
    }));
    expect(proof.session.activeBotId).toBe('nora');
    expect(proof.session.activePresentation.name).toBe('Nora');
    expect(proof.session.search.personalityPolicyId).toBe('strength-1000');
    expect(proof.session.search.candidateCount).toBe(5);
    expect(proof.shell.botsPanel.diagnostics.starts).toBe(1);
    expect(proof.harness.workersCreated).toBe(1);
    expect(proof.harness.workerMessages).toContain('go depth 6');
    expect(proof.isolation.counters.created).toBe(1);
});

test('active bot is immutable; New Game admits the next profile and Games restores Full Power', async ({ page }) => {
    await openBots(page);
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await openCategory(page, 'Beginner');
    await page.getByLabel(/Luna, 350 Elo target/).check();
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await page.locator('[data-bot-primary]').click();
    await expect(page.locator('.caissa-bots-panel')).toBeHidden();
    await expect(page.getByRole('radio', { name: /Vera, 1500 Elo target/ })).toHaveCount(0);
    await expect(page.locator('[data-bot-id="vera"]')).toBeHidden();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().activeBotId)).toBe('luna');
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(1);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await page.locator('[data-post-game-action="new-game"]').click();
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await openCategory(page, 'Advanced');
    await page.getByLabel(/Vera, 1500 Elo target/).check();
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await page.locator('[data-bot-primary]').click();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().activeBotId)).toBe('vera');
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(1);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await page.locator('[data-post-game-action="new-game"]').click();
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
    await openCategory(page, 'Intermediate');
    await page.getByLabel(/Nora, 1000 Elo target/).check();
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
    expect(proof.history).toEqual(['e4']); expect(proof.selected).toBe('nora'); expect(proof.request).toBeNull();
});

test('post-game identity and rematch retain the selected bot', async ({ page }) => {
    await openBots(page);
    await openCategory(page, 'Advanced');
    await page.getByLabel(/Vera, 1500 Elo target/).check();
    await page.locator('[data-bot-primary]').click();
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Lost'); await expect(page.locator('[data-post-game-reason]')).toHaveText('By Resignation');
    await expect(page.locator('[data-post-game-summary]')).toContainText('Vera');
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await page.locator('[data-post-game-action="rematch"]').click();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().activeBotId)).toBe('vera');
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
    await openCategory(page, 'Intermediate');
    await expect(page.getByLabel(/Nora, 1000 Elo target/)).toBeVisible();
    await page.getByLabel(/Nora, 1000 Elo target/).focus();
    expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
});
