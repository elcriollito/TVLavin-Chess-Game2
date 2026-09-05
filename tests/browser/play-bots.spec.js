import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

async function openBots(page, viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto('/play/bots?simplified=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
}

async function openCategory(page, name) {
    await page.getByRole('tab', { name: new RegExp(`^.*${name}`) }).click();
}

async function activeBotsGeometry(page) {
    return page.locator('[data-caissa-bots-shell]').evaluate(shell => {
        const rect = selector => shell.querySelector(selector).getBoundingClientRect();
        const rounded = value => Math.round(value * 100) / 100;
        const head = rect(':scope > [data-caissa-bots-head]');
        const body = rect(':scope > [data-caissa-bots-body]');
        const foot = rect(':scope > [data-caissa-bots-foot]');
        const shellRect = shell.getBoundingClientRect();
        const tabs = document.querySelector('.caissa-simplified-shell__modes').getBoundingClientRect();
        const resources = rect('.caissa-simplified-shell__reference-tools');
        const moves = rect('[data-active-game-moves]');
        const portrait = rect('.caissa-bots-panel__selected-piece');
        const portraitImage = rect('.caissa-bots-panel__selected-piece img');
        const identity = rect('.caissa-bots-panel__selected-copy');
        return {
            fixed: [head.top - shellRect.top, head.height, body.top - shellRect.top,
                foot.top - shellRect.top, foot.bottom - shellRect.top, shellRect.height].map(rounded),
            headHeight: rounded(head.height), tabToHead: rounded(head.top - tabs.bottom),
            footAnchored: Math.abs(foot.bottom - shellRect.bottom) <= 1,
            bodyOverflow: getComputedStyle(shell.querySelector(':scope > [data-caissa-bots-body]')).overflowY,
            identity: {
                leftInset: rounded(portrait.left - head.left),
                topInset: rounded(portrait.top - head.top),
                imageSize: [rounded(portraitImage.width), rounded(portraitImage.height)],
                textCenterDelta: rounded((identity.top + identity.height / 2) - (head.top + head.height / 2))
            },
            resourcesClearMoves: resources.bottom <= moves.top + 1,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

async function botsHeadGeometry(page) {
    return page.locator('[data-caissa-bots-shell]').evaluate(shell => {
        const selected = shell.querySelector('[data-bot-selected]');
        const head = shell.querySelector('[data-caissa-bots-head]').getBoundingClientRect();
        const avatar = selected.querySelector('.caissa-bots-panel__selected-piece').getBoundingClientRect();
        const text = selected.querySelector('.caissa-bots-panel__selected-copy').getBoundingClientRect();
        const tabs = document.querySelector('.caissa-simplified-shell__modes').getBoundingClientRect();
        const round = value => Math.round(value * 100) / 100;
        return {
            headHeight: round(head.height), headLeftPadding: round(parseFloat(getComputedStyle(selected).paddingLeft)),
            avatarLeft: round(avatar.left - head.left), avatarTextGap: round(text.left - avatar.right),
            tabsToHead: round(head.top - tabs.bottom), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('Bots is canonical and exposes the Classic piece ladder without engine internals', async ({ page }) => {
    await page.goto('/play/bots', { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname).toBe('/play/bots');
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await openBots(page);
    await expect(page.locator('[data-bot-card]')).toHaveCount(44);
    await expect(page.locator('.caissa-bots-panel__bot.is-preview-ready')).toHaveCount(44);
    await expect(page.getByRole('tab', { name: 'Play Bots' })).toBeVisible();
    await expect(page.locator('.caissa-bots-panel__title,.caissa-bots-panel__collection')).toHaveCount(0);
    await expect(page.locator('.caissa-bots-panel')).not.toContainText(/depth|MultiPV|centipawn|Worker URL/i);
    await expect(page.getByLabel(/Pip, 100 Elo target, New to Chess, preview ready/)).toBeVisible();
    const pipAvatar = await page.locator('[data-bot-selected] img').getAttribute('src');
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
    await expect(page.locator('[data-bot-selected]')).toContainText('ELO 2800');
    await expect(page.locator('[data-bot-selected] img')).toBeVisible();
    expect(await page.locator('[data-bot-selected] img').getAttribute('src')).not.toBe(pipAvatar);
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
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(2);
    expect((await page.evaluate(() => window.App.game.history()))[0]).toBe('e4');
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

test('active Head Body Foot geometry is frozen through moves, Hint, Undo, and required viewports', async ({ page }) => {
    await openBots(page, { width: 1600, height: 1000 });
    await page.locator('[data-bot-primary]').click();
    const baseline = await activeBotsGeometry(page);
    expect(baseline).toMatchObject({ headHeight: 150, tabToHead: 8, footAnchored: true, bodyOverflow: 'auto',
        identity: { imageSize: [100, 100], textCenterDelta: 0 },
        resourcesClearMoves: true, overflow: 0 });
    expect(baseline.identity.leftInset).toBeLessThanOrEqual(24);
    expect(baseline.identity.topInset).toBeLessThanOrEqual(14);

    for (let turn = 0; turn < 4; turn += 1) {
        const count = await page.evaluate(() => window.App.game.history().length);
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(move).toBeTruthy();
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(count + 2);
    }
    expect((await activeBotsGeometry(page)).fixed).toEqual(baseline.fixed);

    await page.locator('[data-active-game-action="coach-hint"]').click();
    expect((await activeBotsGeometry(page)).fixed).toEqual(baseline.fixed);
    await page.locator('[data-active-game-action="coach-undo"]').click();
    expect((await activeBotsGeometry(page)).fixed).toEqual(baseline.fixed);

    for (const [viewport, expectedHeight] of [[{ width: 1366, height: 768 }, 150], [{ width: 390, height: 844 }, 112]]) {
        await page.setViewportSize(viewport);
        const geometry = await activeBotsGeometry(page);
        expect(geometry).toMatchObject({ headHeight: expectedHeight, tabToHead: 8, footAnchored: true, bodyOverflow: 'auto',
            resourcesClearMoves: true, overflow: 0 });
        expect(geometry.identity.imageSize).toEqual(viewport.width === 390 ? [74, 74] : [100, 100]);
        expect(Math.abs(geometry.identity.textCenterDelta)).toBeLessThanOrEqual(1);
        expect(geometry.identity.leftInset).toBeLessThanOrEqual(viewport.width === 390 ? 18 : 24);
        expect(geometry.identity.topInset).toBeLessThanOrEqual(14);
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect.poll(async () => (await activeBotsGeometry(page)).fixed).toEqual(baseline.fixed);
});

test('permanent Bot Head remains left-aligned and phase-invariant at required viewports', async ({ page }) => {
    const viewports = [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }, { width: 390, height: 844 }];
    await openBots(page, viewports[0]);
    await openCategory(page, 'Advanced');
    await page.getByLabel(/Vera, 1500 Elo target/).check();
    await expect(page.locator('[data-bot-selected]')).toContainText('Vera');
    await expect(page.locator('[data-bot-selected]')).toContainText('ELO 1500');
    const setup = new Map();
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        const geometry = await botsHeadGeometry(page);
        setup.set(viewport.width, geometry);
        expect(geometry).toMatchObject({ headHeight: viewport.width === 390 ? 112 : 150,
            tabsToHead: 8, overflow: 0 });
        expect(geometry.avatarLeft).toBeLessThanOrEqual(12);
        expect(geometry.avatarTextGap).toBeGreaterThanOrEqual(10);
    }
    await page.locator('[data-bot-primary]').click();
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        expect(await botsHeadGeometry(page)).toEqual(setup.get(viewport.width));
    }
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('[data-caissa-bots-shell]')).toHaveAttribute('data-bot-shell-phase', 'game-over');
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        expect(await botsHeadGeometry(page)).toEqual(setup.get(viewport.width));
    }
});

test('active bot is immutable; New Game admits the next profile and Games restores Full Power', async ({ page }) => {
    await openBots(page);
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await openCategory(page, 'Beginner');
    await page.getByLabel(/Luna, 350 Elo target/).check();
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await page.locator('[data-bot-primary]').click();
    const botsShell = page.locator('[data-caissa-bots-shell]');
    await expect(botsShell).toBeVisible();
    await expect(botsShell).toHaveAttribute('data-bot-shell-phase', 'active-game');
    await expect(botsShell.locator(':scope > [data-caissa-bots-head]')).toBeVisible();
    await expect(botsShell.locator(':scope > [data-caissa-bots-head]')).toContainText('Luna');
    await expect(botsShell.locator(':scope > [data-caissa-bots-head]')).toContainText('ELO 350');
    await expect(botsShell.locator(':scope > [data-caissa-bots-body] [data-active-game-context]')).toBeVisible();
    await expect(botsShell.locator(':scope > [data-caissa-bots-body]')).toContainText('Game in progress');
    await expect(botsShell.locator(':scope > [data-caissa-bots-foot] [data-active-game-action="resign"]')).toBeVisible();
    await expect(botsShell.locator(':scope > [data-caissa-bots-foot] [data-active-game-action="share"]')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaSimplifiedPlayShellInstance.getSnapshot().botsPanel))
        .toMatchObject({ phase: 'active-game', architecture: 'head-body-foot', structuralRegionCount: 3 });
    const geometry = await botsShell.evaluate(shell => {
        const head = shell.querySelector(':scope > [data-caissa-bots-head]').getBoundingClientRect();
        const body = shell.querySelector(':scope > [data-caissa-bots-body]').getBoundingClientRect();
        const foot = shell.querySelector(':scope > [data-caissa-bots-foot]').getBoundingClientRect();
        return { order: head.top <= body.top && body.top <= foot.top, footInside: foot.bottom <= shell.getBoundingClientRect().bottom + 1,
            boardCount: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
            coachShellCount: document.querySelectorAll('[data-caissa-coach-shell]:not([hidden])').length };
    });
    expect(geometry).toEqual({ order: true, footInside: true, boardCount: 1, coachShellCount: 0 });
    for (const viewport of [{ width: 1600, height: 1000 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        const gap = await botsShell.evaluate(shell => {
            const tabs = document.querySelector('.caissa-simplified-shell__modes').getBoundingClientRect();
            const head = shell.querySelector(':scope > [data-caissa-bots-head]').getBoundingClientRect();
            return head.top - tabs.bottom;
        });
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThanOrEqual(8);
    }
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
    await expect(botsShell.locator(':scope > [data-caissa-bots-head]')).toContainText('Vera');
    await expect(botsShell.locator(':scope > [data-caissa-bots-head]')).toContainText('ELO 1500');
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(1);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await page.locator('[data-post-game-action="new-game"]').click();
    await page.getByRole('tab', { name: /^(?:Play Game|Games)$/ }).click();
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.locator('[data-games-primary]').click();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().fullPower)).toBe(true);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(2);
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
    const shell = page.locator('[data-caissa-bots-shell]');
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'game-over');
    await expect(shell.locator(':scope > [data-caissa-bots-head]')).toContainText('Vera');
    await expect(shell.locator(':scope > [data-caissa-bots-head]')).toContainText('ELO 1500');
    await expect(shell.locator(':scope > [data-caissa-bots-body] > .caissa-post-game')).toBeVisible();
    await expect(shell.locator(':scope > [data-caissa-bots-body] [data-post-game-action="analyze"]')).toBeVisible();
    await expect(shell.locator(':scope > [data-caissa-bots-foot] [data-post-game-action="analyze"]')).toHaveCount(0);
    await expect(shell.locator(':scope > [data-caissa-bots-foot] > .caissa-bots-panel__post-game-foot')).toBeVisible();
    await expect(shell.locator(':scope > [data-caissa-bots-foot] .caissa-post-game__actions')).toBeVisible();
    await expect(shell.locator(':scope > [data-caissa-bots-foot] .caissa-post-game__consent')).toBeVisible();
    await expect(shell.locator(':scope > [data-caissa-bots-foot] [data-post-game-action]')).toHaveCount(6);
    await expect(shell.locator(':scope > [data-caissa-bots-foot] [data-active-game-action]')).toHaveCount(0);
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Lost'); await expect(page.locator('[data-post-game-reason]')).toHaveText('By Resignation');
    await expect(page.locator('[data-post-game-summary]')).toContainText('Vera');
    await expect(page.locator('[data-post-game-summary]')).toBeHidden();
    await expect(page.locator('[data-caissa-floating-controls]')).toBeHidden();
    for (const [viewport, expectedHeadHeight] of [[{ width: 1600, height: 1000 }, 150],
        [{ width: 1366, height: 768 }, 150], [{ width: 390, height: 844 }, 112]]) {
        await page.setViewportSize(viewport);
        await expect.poll(() => shell.evaluate(node => {
            const head = node.querySelector(':scope > [data-caissa-bots-head]').getBoundingClientRect();
            const tabs = document.querySelector('.caissa-simplified-shell__modes').getBoundingClientRect();
            return { headHeight: head.height, tabToHead: head.top - tabs.bottom };
        })).toEqual({ headHeight: expectedHeadHeight, tabToHead: 8 });
        const geometry = await shell.evaluate(node => {
            const rect = selector => node.querySelector(selector).getBoundingClientRect();
            const head = rect(':scope > [data-caissa-bots-head]');
            const body = rect(':scope > [data-caissa-bots-body]');
            const foot = rect(':scope > [data-caissa-bots-foot]');
            const tabs = document.querySelector('.caissa-simplified-shell__modes').getBoundingClientRect();
            const analyze = rect(':scope > [data-caissa-bots-body] [data-post-game-action="analyze"]');
            return { headHeight: head.height, tabToHead: head.top - tabs.bottom,
                separated: body.bottom <= foot.top, analyzeInBody: analyze.top >= body.top && analyze.bottom <= body.bottom,
                bodyOverflow: getComputedStyle(node.querySelector(':scope > [data-caissa-bots-body]')).overflowY,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        expect(geometry).toMatchObject({ headHeight: expectedHeadHeight, tabToHead: 8, separated: true,
            analyzeInBody: true, bodyOverflow: 'auto', overflow: 0 });
        for (const action of await shell.locator(':scope > [data-caissa-bots-foot] [data-post-game-action]').all()) {
            await action.scrollIntoViewIfNeeded();
            expect(await action.evaluate(node => {
                const box = node.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                return hit === node || node.contains(hit);
            })).toBe(true);
        }
    }
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeEnabled();
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().actions.analyze.enabled)).toBe(true);
    await page.locator('[data-post-game-action="rematch"]').click();
    expect(await page.evaluate(() => window.CaissaBotSession.getSnapshot().activeBotId)).toBe('vera');
    await expect(page.locator('body')).not.toHaveClass(/caissa-bots-game-over-active/);
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
    expect(await page.getByLabel(/Nora, 1000 Elo target/).locator('..').evaluate(node =>
        getComputedStyle(node).outlineStyle)).not.toBe('none');
});
