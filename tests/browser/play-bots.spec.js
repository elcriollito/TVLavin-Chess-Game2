import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, monitorRuntime, playMove } from '../play/playwright-helpers.js';

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

test('post-game identity and simplified Foot retain the selected bot and owned callbacks', async ({ page }) => {
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
    await expect(shell.locator(':scope > [data-caissa-bots-foot] [data-post-game-action="rematch"]')).toBeHidden();
    await expect(shell.locator(':scope > [data-caissa-bots-foot] [data-post-game-action]:visible')).toHaveCount(2);
    await expect(shell.locator(':scope > [data-caissa-bots-foot] .caissa-bots-panel__post-game-menu')).not.toHaveAttribute('open', '');
    await expect(shell.locator(':scope > [data-caissa-bots-foot] .caissa-post-game__consent')).toBeHidden();
    await expect(shell.locator(':scope > [data-caissa-bots-foot] [data-post-game-action]')).toHaveCount(6);
    await expect(shell.locator(':scope > [data-caissa-bots-foot] [data-active-game-action]')).toHaveCount(0);
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Lost'); await expect(page.locator('[data-post-game-reason]')).toHaveText('By Resignation');
    await expect(page.locator('[data-post-game-summary]')).toContainText('Vera');
    await expect(page.locator('[data-post-game-summary]')).toBeHidden();
    await expect(page.locator('[data-caissa-floating-controls]')).toBeHidden();
    const menu = shell.locator('.caissa-bots-panel__post-game-menu');
    const menuToggle = menu.locator('summary');
    for (const [viewport, expectedHeadHeight] of [[{ width: 1600, height: 1000 }, 150],
        [{ width: 1366, height: 768 }, 150], [{ width: 390, height: 844 }, 112]]) {
        await page.setViewportSize(viewport);
        await expect.poll(() => shell.evaluate(node => {
            const head = node.querySelector(':scope > [data-caissa-bots-head]').getBoundingClientRect();
            const tabs = document.querySelector('.caissa-simplified-shell__modes').getBoundingClientRect();
            return { headHeight: head.height, tabToHead: head.top - tabs.bottom };
        })).toEqual({ headHeight: expectedHeadHeight, tabToHead: 8 });
        await menuToggle.scrollIntoViewIfNeeded();
        const geometry = await shell.evaluate(node => {
            const rect = selector => node.querySelector(selector).getBoundingClientRect();
            const head = rect(':scope > [data-caissa-bots-head]');
            const body = rect(':scope > [data-caissa-bots-body]');
            const foot = rect(':scope > [data-caissa-bots-foot]');
            const tabs = document.querySelector('.caissa-simplified-shell__modes').getBoundingClientRect();
            const analyze = rect(':scope > [data-caissa-bots-body] [data-post-game-action="analyze"]');
            const board = document.querySelector('#chessboard .board-b72b1').getBoundingClientRect();
            const rounded = value => Math.round(value * 100) / 100;
            return { headHeight: head.height, tabToHead: head.top - tabs.bottom,
                separated: body.bottom <= foot.top, analyzeInBody: analyze.top >= body.top && analyze.bottom <= body.bottom,
                bodyOverflow: getComputedStyle(node.querySelector(':scope > [data-caissa-bots-body]')).overflowY,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                fixed: [head.top, head.height, body.top, body.height, foot.top, foot.height,
                    board.top, board.left, board.width, board.height].map(rounded) };
        });
        expect(geometry).toMatchObject({ headHeight: expectedHeadHeight, tabToHead: 8, separated: true,
            analyzeInBody: true, bodyOverflow: 'auto', overflow: 0 });
        for (const action of await shell.locator(':scope > [data-caissa-bots-foot] [data-post-game-action]:visible').all()) {
            await action.scrollIntoViewIfNeeded();
            expect(await action.evaluate(node => {
                const box = node.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                return hit === node || node.contains(hit);
            })).toBe(true);
        }
        await menuToggle.click();
        await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
        await expect(menu.locator('.caissa-bots-panel__post-game-menu-items')).toBeVisible();
        const openGeometry = await shell.evaluate(node => {
            const rect = selector => node.querySelector(selector).getBoundingClientRect();
            const head = rect(':scope > [data-caissa-bots-head]');
            const body = rect(':scope > [data-caissa-bots-body]');
            const foot = rect(':scope > [data-caissa-bots-foot]');
            const board = document.querySelector('#chessboard .board-b72b1').getBoundingClientRect();
            const toggle = rect('.caissa-bots-panel__post-game-menu-toggle');
            const popover = rect('.caissa-bots-panel__post-game-menu-items');
            const rounded = value => Math.round(value * 100) / 100;
            return { fixed: [head.top, head.height, body.top, body.height, foot.top, foot.height,
                board.top, board.left, board.width, board.height].map(rounded),
                opensUp: popover.bottom <= toggle.top,
                rightAligned: Math.abs(popover.right - toggle.right) <= 1,
                inViewport: popover.left >= 0 && popover.top >= 0 && popover.right <= innerWidth,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        expect(openGeometry).toMatchObject({ fixed: geometry.fixed, opensUp: true,
            rightAligned: true, inViewport: true, overflow: 0 });
        await menu.locator('[data-post-game-action="copy-pgn"]').focus();
        await page.keyboard.press('Escape');
        await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
        await expect(menuToggle).toBeFocused();
        await menuToggle.click();
        await page.locator('#chessboard .board-b72b1').click({ position: { x: 8, y: 8 } });
        await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    }
    expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeEnabled();
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().actions.analyze.enabled)).toBe(true);
    await menuToggle.click();
    await expect(menu).toHaveAttribute('open', '');
    await expect(menu.locator('[data-post-game-action]')).toHaveText(['Copy PGN', 'Download PGN', 'Save PGN Locally']);
    await expect(menu.locator('.caissa-post-game__consent')).toBeVisible();
    await menu.locator('[data-post-game-action="copy-pgn"]').click();
    await expect(menu.locator('[data-post-game-feedback]')).toContainText('PGN');
    await menu.locator('[data-post-game-consent]').check();
    await expect(menu.locator('[data-post-game-action="save-game"]')).toBeEnabled();
    await shell.locator('[data-post-game-action="new-game"]').click();
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'setup');
    await expect(shell.locator('[data-bot-selected]')).toContainText('Vera');
    await expect(page.locator('body')).not.toHaveClass(/caissa-bots-game-over-active/);
});

test('Bots analysis handoff reaches Guided Review with one authoritative analysis and ply owner', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openBots(page, { width: 1600, height: 1000 });
    await openCategory(page, 'Advanced');
    await page.getByLabel(/Vera, 1500 Elo target/).check();
    await page.locator('[data-bot-primary]').click();
    for (let turn = 0; turn < 2; turn += 1) {
        const count = await page.evaluate(() => window.App.game.history().length);
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(count + 2);
    }
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await page.evaluate(() => window.__caissaPlayHarness.configure({
        resetSearchSequence: true,
        scores: [30, 40, 110, 190, -190],
        bestMoves: ['a1a1', 'a1a1', 'a1a1', 'a1a1', 'a1a1']
    }));
    await page.locator('[data-bots-primary-post-game-action]').click();
    const shell = page.locator('[data-caissa-bots-shell]');
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'analysis-summary');
    await expect(shell.locator('[data-bots-analysis-head]')).toBeVisible();
    await expect(shell.locator('[data-bots-analysis-head] img')).toHaveAttribute('src', '/assets/play/caissa-coach-goddess.png');
    await expect(shell.locator('[data-bots-analysis-summary]')).toBeVisible();
    await expect(shell.locator('.caissa-bots-analysis-summary__review')).toBeEnabled({ timeout: 20_000 });
    await expect(shell.locator('.caissa-bots-analysis-summary__name')).toHaveText(['You', 'Vera']);
    await expect(shell.locator('.caissa-bots-analysis-summary__accuracy-value')).toHaveCount(2);
    await expect(shell.locator('.caissa-bots-analysis-summary__row')).not.toHaveCount(0);
    const summaryAlignment = await shell.evaluate(node => {
        const center = selector => { const box = node.querySelector(selector).getBoundingClientRect(); return box.left + box.width / 2; };
        return {
            playerProfile: center('.caissa-bots-analysis-summary__profile:first-child'),
            playerAccuracy: center('.caissa-bots-analysis-summary__accuracy-value:first-of-type'),
            playerCount: center('.caissa-bots-analysis-summary__count[data-side="player"]'),
            botProfile: center('.caissa-bots-analysis-summary__profile:last-child'),
            botAccuracy: center('.caissa-bots-analysis-summary__accuracy-value:last-of-type'),
            botCount: center('.caissa-bots-analysis-summary__count[data-side="bot"]')
        };
    });
    expect(Math.abs(summaryAlignment.playerProfile - summaryAlignment.playerAccuracy)).toBeLessThanOrEqual(1);
    expect(Math.abs(summaryAlignment.playerProfile - summaryAlignment.playerCount)).toBeLessThanOrEqual(1);
    expect(Math.abs(summaryAlignment.botProfile - summaryAlignment.botAccuracy)).toBeLessThanOrEqual(1);
    expect(Math.abs(summaryAlignment.botProfile - summaryAlignment.botCount)).toBeLessThanOrEqual(1);
    await expect(shell.locator(':scope > [data-caissa-bots-foot] button:visible')).toHaveText(['New Game', 'Review Game']);
    await expect(shell.locator('[data-bot-selected]')).toBeHidden();
    await expect(shell.locator('[data-post-game-action]:visible, [data-active-game-action]:visible')).toHaveCount(0);
    const proof = await page.evaluate(() => ({
        summary: window.CaissaBotsAnalysisSummaryPresentation.getSnapshot(),
        phase: window.CaissaBotsPanelInstance.getSnapshot().phase,
        resultCount: window.AnalyzeSection.analysisResults.length,
        moveCount: window.AnalyzeSection.getLoadedMoves().length,
        boardCount: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        visibleCaissa: [...document.querySelectorAll('[data-caissa-bots-shell] img')]
            .filter(node => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0)
            .filter(node => node.getAttribute('src')?.includes('caissa-coach-goddess')).length,
        visibleBot: [...document.querySelectorAll('.caissa-bots-analysis-summary__bot-avatar img')]
            .filter(node => node.getBoundingClientRect().width > 0).length
    }));
    expect(proof).toMatchObject({ phase: 'analysis-summary', resultCount: proof.moveCount,
        boardCount: 1, visibleCaissa: 1, visibleBot: 1,
        summary: { mounted: true, phase: 'summary', analysisStartRequests: 1,
            analysisOwner: 'AnalyzeSection', analysisResultsOwner: 'AnalyzeSection.analysisResults' } });
    const summarySymbols = await page.evaluate(() => Object.fromEntries(
        [...document.querySelectorAll('.caissa-bots-analysis-summary__row')].map(row => [row.dataset.quality,
            row.querySelector('[data-classification-symbol]')?.textContent])));
    expect(summarySymbols).toMatchObject({ Inaccuracy: '?!', Mistake: '?', Blunder: '??' });

    const measured = [];
    for (const viewport of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        const geometry = await shell.evaluate(node => {
            const rect = selector => node.querySelector(selector).getBoundingClientRect();
            const head = rect(':scope > [data-caissa-bots-head]');
            const body = rect(':scope > [data-caissa-bots-body]');
            const foot = rect(':scope > [data-caissa-bots-foot]');
            return { head: Math.round(head.height), body: Math.round(body.height), foot: Math.round(foot.height),
                anchored: Math.abs(foot.bottom - node.getBoundingClientRect().bottom) <= 1,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                bodyOverflow: getComputedStyle(node.querySelector(':scope > [data-caissa-bots-body]')).overflowY };
        });
        expect(geometry).toMatchObject({ head: viewport.width === 390 ? 112 : 150,
            anchored: true, overflow: 0, bodyOverflow: 'auto' });
        expect(geometry.body).toBeGreaterThan(0); expect(geometry.foot).toBeGreaterThanOrEqual(52);
        measured.push({ viewport: `${viewport.width}x${viewport.height}`, ...geometry });
        if (viewport.width === 1600) await page.screenshot({ path: 'test-results/play-bots-analysis-summary-desktop.png', fullPage: true });
        if (viewport.width === 390) {
            await shell.scrollIntoViewIfNeeded();
            for (const action of await shell.locator(':scope > [data-caissa-bots-foot] button:visible').all()) {
                await action.scrollIntoViewIfNeeded(); await expect(action).toBeVisible();
            }
            await shell.scrollIntoViewIfNeeded();
            await page.screenshot({ path: 'test-results/play-bots-analysis-summary-mobile.png' });
        }
    }
    console.log(`BOTS_ANALYSIS_SUMMARY_GEOMETRY ${JSON.stringify(measured)}`);

    const immutableBefore = await page.evaluate(() => ({
        pgn: window.AnalyzeSection.loadedGame.pgn,
        loadedMoves: JSON.stringify(window.AnalyzeSection.getLoadedMoves({ verbose: true })),
        appHistory: JSON.stringify(window.App.moveHistory),
        analysis: JSON.stringify(window.AnalyzeSection.analysisResults),
        accuracy: [...document.querySelectorAll('.caissa-bots-analysis-summary__accuracy-value')].map(node => node.textContent),
        classifications: [...document.querySelectorAll('.caissa-bots-analysis-summary__row')].map(node => node.textContent),
        analysisStartRequests: window.CaissaBotsAnalysisSummaryPresentation.getSnapshot().analysisStartRequests
    }));
    const summaryCounts = await page.evaluate(() => Object.fromEntries(
        [...document.querySelectorAll('.caissa-bots-analysis-summary__row')].map(row => [row.dataset.quality, {
            player: Number(row.querySelector('[data-side="player"]')?.textContent),
            bot: Number(row.querySelector('[data-side="bot"]')?.textContent)
        }])));
    await page.evaluate(() => window.addEventListener('caissa:bots-guided-review-request', event => {
        window.__botsReviewHandoff = event.detail;
    }, { once: true }));
    await shell.locator('.caissa-bots-analysis-summary__review').click();
    const handoff = await page.evaluate(() => window.__botsReviewHandoff);
    expect(handoff).toMatchObject({ contextId: 'bots-review-summary', analysisOwner: 'AnalyzeSection' });
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'guided-review');
    await expect(shell.locator('[data-bots-guided-review]')).toBeVisible();
    await expect(shell.locator('[data-bots-guided-head] img')).toHaveCount(1);
    await expect(page.locator('#playSection #chessboard .board-b72b1:visible')).toHaveCount(1);
    await expect(page.locator('#analyzeSection .analyze-layout:visible')).toHaveCount(0);
    await expect(page.locator('.caissa-simplified-shell__board-stage > :is(.caissa-simplified-shell__board-actions, .caissa-simplified-shell__utility-bar):visible')).toHaveCount(0);
    await expect(page.locator('.caissa-simplified-shell__board-stage > .caissa-simplified-shell__player:visible')).toHaveCount(0);
    await expect(shell.locator('[data-bots-guided-nav]')).toHaveCount(4);
    await expect(shell.locator('[data-bots-guided-notation] [aria-current="move"]')).toHaveCount(1);
    await expect(shell).not.toContainText(/centipawn|depth|nodes|hash|threads|MultiPV|Game Info|Critical Moments|Move Evidence/i);

    const assertProjectedPly = async index => {
        await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(index);
        if (index < 0) return;
        const projection = await page.evaluate(() => {
            const selected = window.AnalyzeSection.analysisResults[window.AnalyzeSection.currentMoveIndex];
            const move = window.AnalyzeSection.getLoadedMoves({ verbose: true })[window.AnalyzeSection.currentMoveIndex];
            const rail = window.CaissaEvaluationRailInstance.getSnapshot();
            return { board: window.App.boardAdapter.getPosition(), expectedFen: selected.fenAfter,
                lastMove: window.App.boardAdapter.getSnapshot().lastMove, expectedMove: { from: move.from, to: move.to },
                railCp: rail.scoreCp, expectedCp: Number.isFinite(selected.evalAfter) ? Math.round(selected.evalAfter * 100) : null,
                railSource: rail.source };
        });
        expect(projection.board).toBe(projection.expectedFen);
        expect(projection.lastMove).toEqual(projection.expectedMove);
        if (projection.expectedCp !== null) expect(projection.railCp).toBe(projection.expectedCp);
        expect(projection.railSource).toBe('bots-guided-review-ply');
    };
    const symbolCases = await page.evaluate(() => ['Inaccuracy', 'Mistake', 'Blunder'].map(quality => {
        const index = window.AnalyzeSection.analysisResults.findIndex(item => item?.quality === quality);
        const item = window.AnalyzeSection.analysisResults[index];
        return { quality, index, symbol: item?.annotation || null,
            move: window.AnalyzeSection.getLoadedMoves()[index] || null, side: index % 2 === 0 ? 'player' : 'bot' };
    }));
    expect(symbolCases).toEqual([
        expect.objectContaining({ quality: 'Inaccuracy', index: expect.any(Number), symbol: '?!', move: expect.any(String) }),
        expect.objectContaining({ quality: 'Mistake', index: expect.any(Number), symbol: '?', move: expect.any(String) }),
        expect.objectContaining({ quality: 'Blunder', index: expect.any(Number), symbol: '??', move: expect.any(String) })
    ]);
    for (const item of symbolCases) {
        expect(item.index).toBeGreaterThanOrEqual(0);
        expect(summaryCounts[item.quality]?.[item.side]).toBeGreaterThan(0);
        await shell.locator(`[data-bots-guided-ply="${item.index}"]`).click();
        await assertProjectedPly(item.index);
        await expect(shell.locator(`[data-bots-guided-ply="${item.index}"] .caissa-bots-guided__annotation`)).toHaveText(item.symbol);
        await expect(shell.locator('.caissa-bots-guided__move')).toHaveText(`${item.move}${item.symbol}`);
        await expect(page.locator('#chessboard [data-caissa-coach-move-annotation]')).toHaveText(item.symbol);
    }
    await shell.locator('[data-bots-guided-ply="0"]').click();
    await assertProjectedPly(0);
    await shell.getByRole('button', { name: 'Next move' }).click(); await assertProjectedPly(1);
    await shell.getByRole('button', { name: 'Previous move' }).click(); await assertProjectedPly(0);
    const literalPly = Math.min(2, await page.evaluate(() => window.AnalyzeSection.getLoadedMoves().length - 1));
    await shell.locator(`[data-bots-guided-ply="${literalPly}"]`).click(); await assertProjectedPly(literalPly);
    await shell.getByRole('button', { name: 'Last move' }).click();
    await assertProjectedPly(await page.evaluate(() => window.AnalyzeSection.getLoadedMoves().length - 1));
    await shell.getByRole('button', { name: 'First position' }).click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(-1);
    const initialProjection = await page.evaluate(() => ({
        board: window.App.boardAdapter.getPosition(),
        expectedFen: window.AnalyzeSection.analysisResults[0].fenBefore,
        railCp: window.CaissaEvaluationRailInstance.getSnapshot().scoreCp,
        expectedCp: Math.round(window.AnalyzeSection.analysisResults[0].evalBefore * 100),
        railSource: window.CaissaEvaluationRailInstance.getSnapshot().source
    }));
    expect(initialProjection.board).toBe(initialProjection.expectedFen);
    expect(initialProjection.railCp).toBe(initialProjection.expectedCp);
    expect(initialProjection.railSource).toBe('bots-guided-review-ply');

    const moments = await page.evaluate(() => window.CaissaBotsGuidedReviewPresentation.getSnapshot().reviewMoments);
    expect(moments.some(index => index % 2 === 0)).toBe(true);
    expect(moments.some(index => index % 2 === 1)).toBe(true);
    await shell.locator('[data-bots-guided-next-moment]').click(); await assertProjectedPly(moments[0]);
    if (moments.length > 1) { await shell.locator('[data-bots-guided-next-moment]').click(); await assertProjectedPly(moments[1]); }
    await shell.locator('[data-bots-guided-explain]').click();
    await expect(shell.locator('[data-bots-guided-detail]')).toBeVisible();

    const guidedGeometry = [];
    for (const viewport of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await shell.scrollIntoViewIfNeeded();
        const geometry = await shell.evaluate(node => {
            const rect = selector => node.querySelector(selector).getBoundingClientRect();
            const head = rect(':scope > [data-caissa-bots-head]'); const body = rect(':scope > [data-caissa-bots-body]');
            const foot = rect(':scope > [data-caissa-bots-foot]'); const before = [head.top, foot.top, foot.bottom];
            node.querySelector(':scope > [data-caissa-bots-body]').scrollTop = 120;
            const afterHead = rect(':scope > [data-caissa-bots-head]');
            const afterFoot = rect(':scope > [data-caissa-bots-foot]');
            const after = [afterHead.top, afterFoot.top, afterFoot.bottom];
            return { head: Math.round(head.height), body: Math.round(body.height), foot: Math.round(foot.height),
                fixedDuringBodyScroll: before.every((value, index) => Math.abs(value - after[index]) <= 1),
                anchored: Math.abs(foot.bottom - node.getBoundingClientRect().bottom) <= 1,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                bodyOverflow: getComputedStyle(node.querySelector(':scope > [data-caissa-bots-body]')).overflowY,
                minTarget: Math.min(...[...node.querySelectorAll(':scope > [data-caissa-bots-foot] [data-bots-foot-content="guided-review"] button')]
                    .map(button => button.getBoundingClientRect().height)) };
        });
        expect(geometry).toMatchObject({ head: viewport.width === 390 ? 112 : 150,
            fixedDuringBodyScroll: true, anchored: true, overflow: 0, bodyOverflow: 'auto' });
        expect(geometry.minTarget).toBeGreaterThanOrEqual(44); guidedGeometry.push({ viewport: `${viewport.width}x${viewport.height}`, ...geometry });
        await shell.locator(':scope > [data-caissa-bots-body]').evaluate(node => { node.scrollTop = 0; });
        await page.evaluate(() => window.scrollTo(0, 0));
        if (viewport.width === 1600) await page.screenshot({ path: 'test-results/play-bots-guided-review-desktop.png', fullPage: true });
        if (viewport.width === 390) await page.screenshot({ path: 'test-results/play-bots-guided-review-mobile.png', fullPage: true });
    }
    console.log(`BOTS_GUIDED_REVIEW_GEOMETRY ${JSON.stringify(guidedGeometry)}`);

    const entry = await page.evaluate(() => ({
        ply: window.AnalyzeSection.currentMoveIndex,
        fen: window.AnalyzeSection.getCoachReviewProjection().fen,
        rail: window.CaissaEvaluationRailInstance.getSnapshot().scoreCp,
        lastMove: window.App.boardAdapter.getSnapshot().lastMove,
        orientation: window.App.boardAdapter.getSnapshot().orientation
    }));
    await page.setViewportSize({ width: 1600, height: 1000 }); await shell.scrollIntoViewIfNeeded();
    await shell.locator('.caissa-bots-guided__analysis').click();
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'analysis-exploration');
    await expect(shell.locator('[data-bots-analysis-exploration]')).toBeVisible();
    await expect(shell.locator('[data-bots-exploration-head] img')).toHaveCount(1);
    await expect(shell.locator('[data-bots-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');
    await expect(shell.locator('[data-bots-exploration-engine]')).toHaveAttribute('aria-label', 'Engine On');
    await expect(shell.locator('[data-bots-exploration-nav]')).toHaveCount(4);
    await expect(shell).not.toContainText(/centipawn|depth|nodes|hash|threads|MultiPV|NPS|worker/i);
    expect(await page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(entry.ply);
    const sourceEntry = await page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot());
    expect(sourceEntry).toMatchObject({ entryReviewPly: entry.ply, mode: 'source',
        sourceCursor: entry.ply + 1, sourcePlyCount: immutableBefore ? JSON.parse(immutableBefore.loadedMoves).length : 0,
        temporaryPlyCount: 0 });
    await expect(shell.locator('[data-bots-exploration-source] .caissa-bots-exploration__move'))
        .toHaveCount(sourceEntry.sourcePlyCount);
    await expect(shell.locator('[data-bots-exploration-source] [aria-current="move"]')).toHaveCount(1);
    await expect(shell.locator('[data-bots-exploration-variation-section]')).toBeHidden();
    expect(await page.evaluate(() => window.App.boardAdapter.getSnapshot().orientation)).toBe(entry.orientation);
    await expect(page.locator('#chessboard [data-caissa-coach-move-annotation]')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/play-bots-analysis-exploration-engine-on.png', fullPage: true });

    const assertSourcePosition = async cursor => {
        const proof = await page.evaluate(target => {
            const game = new Chess(window.AnalyzeSection.loadedGame.initialFen || undefined);
            const moves = window.AnalyzeSection.getLoadedMoves();
            for (let index = 0; index < target; index += 1) game.move(moves[index]);
            const state = window.CaissaBotsAnalysisExploration.getSnapshot();
            return { board: window.App.boardAdapter.getPosition(), expected: game.fen(), mode: state.mode,
                cursor: state.sourceCursor, authoritative: window.AnalyzeSection.currentMoveIndex };
        }, cursor);
        expect(proof).toMatchObject({ board: proof.expected, mode: 'source', cursor, authoritative: entry.ply });
    };
    for (const item of symbolCases) {
        const studyMove = shell.locator(`[data-bots-exploration-source-cursor="${item.index + 1}"]`);
        await expect(studyMove.locator('[data-bots-exploration-annotation]')).toHaveText(item.symbol);
        await studyMove.click(); await assertSourcePosition(item.index + 1);
    }
    await expect(shell.locator('[data-bots-exploration-annotation][data-quality="Mistake"]')).toHaveText('?');
    expect(await shell.locator('[data-bots-exploration-annotation][data-quality="Blunder"]').allTextContents())
        .toEqual(expect.arrayContaining(['??']));
    await page.screenshot({ path: 'test-results/play-bots-study-annotations-desktop.png', fullPage: true });
    await shell.getByRole('button', { name: 'First study position' }).click(); await assertSourcePosition(0);
    await shell.getByRole('button', { name: 'Next study move' }).click(); await assertSourcePosition(1);
    await shell.getByRole('button', { name: 'Last study position' }).click();
    await assertSourcePosition(sourceEntry.sourcePlyCount);
    const branchCursor = Math.min(2, sourceEntry.sourcePlyCount);
    await shell.locator(`[data-bots-exploration-source-cursor="${branchCursor}"]`).click();
    await assertSourcePosition(branchCursor);

    const playTemporary = async excluded => {
        const move = await page.evaluate(avoid => {
            const owner = window.CaissaBotsAnalysisExploration;
            for (const file of 'abcdefgh') for (const rank of '12345678') {
                const candidates = owner.movesFrom(`${file}${rank}`);
                const selected = candidates.find(item => `${item.from}${item.to}${item.promotion || ''}` !== avoid);
                if (selected) return { from: selected.from, to: selected.to,
                    key: `${selected.from}${selected.to}${selected.promotion || ''}` };
            }
            return null;
        }, excluded || '');
        expect(move).not.toBeNull();
        const before = await page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot());
        await page.locator(`#chessboard .square-${move.from}`).click();
        await page.locator(`#chessboard .square-${move.to}`).click();
        await expect.poll(() => page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().temporaryCursor))
            .toBe(before.mode === 'temporary' ? before.temporaryCursor + 1 : 1);
        return move.key;
    };
    await playTemporary(); await playTemporary(); const discardedMove = await playTemporary();
    await expect(shell.locator('[data-bots-exploration-variation-section]')).toBeVisible();
    await expect(shell.locator('[data-bots-exploration-source] .is-branch-anchor')).toHaveCount(1);
    await expect(shell.locator('[data-bots-exploration-source] .caissa-bots-exploration__move'))
        .toHaveCount(sourceEntry.sourcePlyCount);
    await expect(shell.locator('[data-bots-exploration-cursor][aria-current="move"]')).toHaveCount(1);
    await expect(shell.locator('[data-bots-exploration-variation-section] [data-bots-exploration-annotation]')).toHaveCount(0);
    const temporaryProjection = await page.evaluate(() => {
        const line = window.CaissaBotsAnalysisExploration.getLine(); const move = line.at(-1);
        return { board: window.App.boardAdapter.getPosition(), expectedFen: window.CaissaBotsAnalysisExploration.getFen(),
            lastMove: window.App.boardAdapter.getSnapshot().lastMove, expectedMove: { from: move.from, to: move.to },
            badgeCount: document.querySelectorAll('#chessboard [data-caissa-coach-move-annotation]').length };
    });
    expect(temporaryProjection.board).toBe(temporaryProjection.expectedFen);
    expect(temporaryProjection.lastMove).toEqual(temporaryProjection.expectedMove);
    expect(temporaryProjection.badgeCount).toBe(0);
    await shell.getByRole('button', { name: 'Previous study move' }).click();
    const beforeBranch = await page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot());
    await playTemporary(discardedMove);
    const afterBranch = await page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot());
    expect(afterBranch.temporaryPlyCount).toBe(beforeBranch.cursor + 1);
    expect(afterBranch.atLast).toBe(true);

    await shell.locator('[data-bots-exploration-engine]').click();
    await expect(shell.locator('[data-bots-exploration-engine]')).toHaveAttribute('aria-pressed', 'false');
    await expect(shell.locator('[data-bots-exploration-engine]')).toHaveAttribute('aria-label', 'Engine Off');
    const requestsOff = await page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().engineRequests);
    await shell.getByRole('button', { name: 'First study position' }).click();
    await shell.getByRole('button', { name: 'Last study position' }).click();
    expect(await page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().engineRequests)).toBe(requestsOff);
    await page.screenshot({ path: 'test-results/play-bots-analysis-exploration-engine-off.png', fullPage: true });
    await shell.locator('[data-bots-exploration-engine]').click();
    await expect(shell.locator('[data-bots-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');

    const explorationGeometry = [];
    for (const viewport of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await shell.scrollIntoViewIfNeeded();
        const geometry = await shell.evaluate(node => {
            const rect = selector => node.querySelector(selector).getBoundingClientRect();
            const head = rect(':scope > [data-caissa-bots-head]'); const bodyNode = node.querySelector(':scope > [data-caissa-bots-body]');
            const body = bodyNode.getBoundingClientRect(); const foot = rect(':scope > [data-caissa-bots-foot]');
            const before = [head.top, foot.top, foot.bottom]; bodyNode.scrollTop = 120;
            const afterHead = rect(':scope > [data-caissa-bots-head]'); const afterFoot = rect(':scope > [data-caissa-bots-foot]');
            return { head: Math.round(head.height), body: Math.round(body.height), foot: Math.round(foot.height),
                fixed: before.every((value, index) => Math.abs(value - [afterHead.top, afterFoot.top, afterFoot.bottom][index]) <= 1),
                anchored: Math.abs(foot.bottom - node.getBoundingClientRect().bottom) <= 1,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                bodyOverflow: getComputedStyle(bodyNode).overflowY,
                minTarget: Math.min(...[...node.querySelectorAll('[data-bots-foot-content="analysis-exploration"] button')]
                    .map(button => button.getBoundingClientRect().height)) };
        });
        expect(geometry).toMatchObject({ head: viewport.width === 390 ? 112 : 150, fixed: true,
            anchored: true, overflow: 0, bodyOverflow: 'auto' });
        expect(geometry.minTarget).toBeGreaterThanOrEqual(44); explorationGeometry.push({ viewport: `${viewport.width}x${viewport.height}`, ...geometry });
        await shell.locator(':scope > [data-caissa-bots-body]').evaluate(node => { node.scrollTop = 0; });
        await page.evaluate(() => window.scrollTo(0, 0));
        if (viewport.width === 1600) await page.screenshot({ path: 'test-results/play-bots-analysis-exploration-desktop.png', fullPage: true });
        if (viewport.width === 390) {
            await page.screenshot({ path: 'test-results/play-bots-analysis-exploration-mobile.png', fullPage: true });
            await page.screenshot({ path: 'test-results/play-bots-study-annotations-mobile.png', fullPage: true });
        }
    }
    console.log(`BOTS_ANALYSIS_EXPLORATION_GEOMETRY ${JSON.stringify(explorationGeometry)}`);
    const accessibility = await new AxeBuilder({ page }).include('[data-caissa-bots-shell]').analyze();
    expect(accessibility.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    await shell.locator('[data-bots-exploration-back]').click();
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'guided-review');
    const restored = await page.evaluate(() => ({
        ply: window.AnalyzeSection.currentMoveIndex,
        fen: window.App.boardAdapter.getPosition(),
        expectedFen: window.AnalyzeSection.getCoachReviewProjection().fen,
        rail: window.CaissaEvaluationRailInstance.getSnapshot().scoreCp,
        lastMove: window.App.boardAdapter.getSnapshot().lastMove,
        selectedPly: Number(document.querySelector('[data-bots-guided-notation] [aria-current="move"]')?.dataset.botsGuidedPly),
        badgeCount: document.querySelectorAll('#chessboard [data-caissa-coach-move-annotation]').length,
        explorationActive: window.CaissaBotsAnalysisExploration.isActive()
    }));
    expect(restored).toMatchObject({ ply: entry.ply, fen: entry.fen, expectedFen: entry.fen,
        rail: entry.rail, lastMove: entry.lastMove, selectedPly: entry.ply, badgeCount: 1, explorationActive: false });
    const immutableAfter = await page.evaluate(() => ({
        pgn: window.AnalyzeSection.loadedGame.pgn,
        loadedMoves: JSON.stringify(window.AnalyzeSection.getLoadedMoves({ verbose: true })),
        appHistory: JSON.stringify(window.App.moveHistory),
        analysis: JSON.stringify(window.AnalyzeSection.analysisResults),
        accuracy: [...document.querySelectorAll('.caissa-bots-analysis-summary__accuracy-value')].map(node => node.textContent),
        classifications: [...document.querySelectorAll('.caissa-bots-analysis-summary__row')].map(node => node.textContent),
        analysisStartRequests: window.CaissaBotsAnalysisSummaryPresentation.getSnapshot().analysisStartRequests
    }));
    expect(immutableAfter).toEqual(immutableBefore);
    runtime.assertClean();
    await shell.locator('.caissa-bots-guided__new-game').click();
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'setup');
    await expect(shell.locator('[data-bots-analysis-summary]')).toHaveCount(0);
    await expect(shell.locator('[data-bot-selected]')).toContainText('Vera');
});

test('Review with Mentor is an external observer with live Study FEN and zero board authority', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openBots(page, { width: 1600, height: 1000 });
    await openCategory(page, 'Advanced');
    await page.getByLabel(/Vera, 1500 Elo target/).check();
    await page.locator('[data-bot-primary]').click();
    for (let turn = 0; turn < 2; turn += 1) {
        const count = await page.evaluate(() => window.App.game.history().length);
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(count + 2);
    }
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    const shell = page.locator('[data-caissa-bots-shell]');
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'game-over');
    await shell.locator('[data-post-game-action="mentor-review"]').click();
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'analysis-exploration', { timeout: 25_000 });

    const mentor = page.locator('[data-caissa-mentor-shell]');
    await expect(mentor).toBeVisible();
    await expect(mentor).toContainText('Bots Analysis · current board position shared');
    await expect(shell.locator('[data-bots-mentor-study]')).toHaveCount(0);
    await expect(page.locator('#playSection #chessboard .board-b72b1:visible')).toHaveCount(1);
    await expect(page.locator('#analyzeSection .analyze-layout:visible')).toHaveCount(0);
    await expect(page.locator('.caissa-mentor-review:visible, [data-native-mentor-review]:visible, #mentor-review-board:visible')).toHaveCount(0);

    const immutableBefore = await page.evaluate(() => ({
        pgn: window.AnalyzeSection.loadedGame.pgn,
        loadedMoves: JSON.stringify(window.AnalyzeSection.getLoadedMoves({ verbose: true })),
        appHistory: JSON.stringify(window.App.moveHistory),
        analysis: JSON.stringify(window.AnalyzeSection.analysisResults),
        authoritativePly: window.AnalyzeSection.currentMoveIndex
    }));
    const legalMoves = () => page.evaluate(() => { const owner = window.CaissaBotsAnalysisExploration; const moves = [];
        for (const file of 'abcdefgh') for (const rank of '12345678')
            for (const move of owner.movesFrom(`${file}${rank}`)) moves.push(`${move.from}${move.to}${move.promotion || ''}`);
        return moves.sort(); });
    const frame = () => page.evaluate(() => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
        const round = value => Math.round((value || 0) * 100) / 100;
        const navigation = rect('.main-navigation'); const play = rect('.caissa-simplified-shell');
        const workspace = rect('.caissa-simplified-shell__workspace'); const board = rect('#playSection #chessboard .board-b72b1');
        const context = rect('.caissa-simplified-shell__context'); const head = rect('[data-caissa-bots-head]');
        const body = rect('[data-caissa-bots-body]'); const foot = rect('[data-caissa-bots-foot]');
        const playStyle = getComputedStyle(document.querySelector('.caissa-simplified-shell'));
        return { navigation: round(navigation?.width), play: round(play?.width), workspace: round(workspace?.width),
            board: [round(board?.width), round(board?.height)], context: round(context?.width),
            wraps: [round(head?.height), round(body?.height), round(foot?.height)],
            scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
            scroll: [round(scrollX), round(scrollY)], scale: window.visualViewport?.scale || 1,
            transform: playStyle.transform, zoom: playStyle.zoom };
    });
    const settleFrame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const assertMentorContext = async expectedMode => {
        const proof = await page.evaluate(() => {
            const owner = window.CaissaBotsAnalysisExploration.getSnapshot();
            const shared = window.CaissaMentorFloatingShell.inspect().context;
            return { ownerFen: owner.currentFen, mentorFen: shared?.fen,
                boardFen: window.App.boardAdapter.getPosition(), mode: owner.mode,
                mentorMode: shared?.mode, authoritativePly: window.AnalyzeSection.currentMoveIndex };
        });
        expect(proof).toMatchObject({ ownerFen: proof.boardFen, mentorFen: proof.boardFen,
            mode: expectedMode, mentorMode: expectedMode, authoritativePly: immutableBefore.authoritativePly });
    };
    await assertMentorContext('source');
    await mentor.getByRole('button', { name: 'Minimize CAISSA Mentor' }).click();
    await expect(mentor).toBeHidden();
    await shell.getByRole('button', { name: 'First study position' }).click();
    await assertMentorContext('source');
    await shell.getByRole('button', { name: 'Next study move' }).click();
    await assertMentorContext('source');
    await shell.getByRole('button', { name: 'Last study position' }).click();
    await assertMentorContext('source');
    await shell.getByRole('button', { name: 'Previous study move' }).click();
    await assertMentorContext('source');
    await shell.locator('[data-bots-exploration-source-cursor="1"]').click();
    await assertMentorContext('source');
    await page.locator('[data-caissa-mentor-launcher]').click(); await expect(mentor).toBeVisible();
    const boardBeforeInteraction = await page.locator('#playSection #chessboard .board-b72b1').boundingBox();

    const candidate = await page.evaluate(() => {
        const owner = window.CaissaBotsAnalysisExploration;
        for (const file of 'abcdefgh') for (const rank of '12345678') {
            const move = owner.movesFrom(`${file}${rank}`)[0];
            if (move) return { from: move.from, to: move.to };
        }
        return null;
    });
    expect(candidate).not.toBeNull();
    await page.locator(`#chessboard .square-${candidate.from}`).click();
    await page.locator(`#chessboard .square-${candidate.to}`).click();
    await expect.poll(() => page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().mode)).toBe('temporary');
    await assertMentorContext('temporary');

    await mentor.getByRole('button', { name: 'Minimize CAISSA Mentor' }).click();
    await shell.getByRole('button', { name: 'Previous study move' }).click();
    const dragCandidate = await page.evaluate(() => {
        const owner = window.CaissaBotsAnalysisExploration;
        for (const file of 'abcdefgh') for (const rank of '12345678') {
            const move = owner.movesFrom(`${file}${rank}`)[0]; if (move) return { from: move.from, to: move.to };
        }
        return null;
    });
    await page.locator('[data-caissa-mentor-launcher]').click(); await expect(mentor).toBeVisible();
    const from = page.locator(`#chessboard .square-${dragCandidate.from}`); const to = page.locator(`#chessboard .square-${dragCandidate.to}`);
    const beforeDrag = await page.evaluate(() => ({ fen: window.CaissaBotsAnalysisExploration.getFen(),
        board: window.App.boardAdapter.getPosition(), cursor: window.CaissaBotsAnalysisExploration.getSnapshot().temporaryCursor }));
    const fromBox = await from.boundingBox(); const toBox = await to.boundingBox();
    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down(); await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 8 }); await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().temporaryCursor)).toBe(beforeDrag.cursor + 1);
    const afterDrag = await page.evaluate(() => ({ fen: window.CaissaBotsAnalysisExploration.getFen(),
        board: window.App.boardAdapter.getPosition() }));
    expect(afterDrag.fen).not.toBe(beforeDrag.fen); expect(afterDrag.board).toBe(afterDrag.fen);
    await assertMentorContext('temporary');

    await page.evaluate(() => window.eval(`LLMProvider.chat = async messages => {
        window.__botsMentorMessages = messages; return { content: 'Contextual test answer.', isSharedApi: false };
    }`));
    const askedFen = await page.evaluate(() => window.CaissaBotsAnalysisExploration.getFen());
    await mentor.locator('#caissaMentorInput').fill('What is the threat?');
    await mentor.getByRole('button', { name: 'Send to Mentor' }).click();
    await expect(mentor.locator('.caissa-mentor-shell__message--mentor')).toHaveText('Contextual test answer.');
    expect(await page.evaluate(() => window.__botsMentorMessages[0].content)).toContain(`Current FEN: ${askedFen}`);

    const beforeMinimize = await page.evaluate(() => ({ fen: window.CaissaBotsAnalysisExploration.getFen(),
        draft: window.CaissaBotsAnalysisExploration.getSnapshot().temporaryPlyCount }));
    await mentor.getByRole('button', { name: 'Minimize CAISSA Mentor' }).click(); await expect(mentor).toBeHidden();
    await page.locator('[data-caissa-mentor-launcher]').click(); await expect(mentor).toBeVisible();
    expect(await page.evaluate(() => window.CaissaMentorFloatingShell.inspect().context.fen)).toBe(beforeMinimize.fen);

    const geometry = [];
    for (const viewport of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await shell.scrollIntoViewIfNeeded(); await settleFrame();
        await page.evaluate(() => window.scrollTo(0, 0));
        const openFrame = await frame();
        const measured = await shell.evaluate(node => {
            const head = node.querySelector(':scope > [data-caissa-bots-head]').getBoundingClientRect();
            const bodyNode = node.querySelector(':scope > [data-caissa-bots-body]');
            const body = bodyNode.getBoundingClientRect();
            const foot = node.querySelector(':scope > [data-caissa-bots-foot]').getBoundingClientRect();
            const mentorNode = document.querySelector('[data-caissa-mentor-shell]').getBoundingClientRect();
            const boardNode = document.querySelector('#playSection #chessboard .board-b72b1').getBoundingClientRect();
            return { head: Math.round(head.height), body: Math.round(body.height), foot: Math.round(foot.height),
                mentorWidth: Math.round(mentorNode.width), boardWidth: Math.round(boardNode.width),
                anchored: Math.abs(foot.bottom - node.getBoundingClientRect().bottom) <= 1,
                bodyOverflow: getComputedStyle(bodyNode).overflowY,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        expect(measured).toMatchObject({ head: viewport.width === 390 ? 112 : 150,
            anchored: true, bodyOverflow: 'auto', overflow: 0 });
        expect(measured.mentorWidth).toBeLessThanOrEqual(viewport.width);
        expect(measured.boardWidth).toBeGreaterThan(viewport.width === 390 ? 300 : 500);
        if (viewport.width === 1600) await page.screenshot({ path: 'test-results/play-bots-mentor-open-desktop.png', fullPage: true });
        if (viewport.width === 390) await page.screenshot({ path: 'test-results/play-bots-mentor-open-mobile.png', fullPage: true });
        await mentor.getByRole('button', { name: 'Minimize CAISSA Mentor' }).click(); await expect(mentor).toBeHidden();
        const minimizedFrame = await frame();
        if (viewport.width === 1600) await page.screenshot({ path: 'test-results/play-bots-mentor-minimized-desktop.png', fullPage: true });
        if (viewport.width === 390) await page.screenshot({ path: 'test-results/play-bots-mentor-minimized-mobile.png', fullPage: true });
        expect(minimizedFrame).toEqual(openFrame);
        await page.locator('[data-caissa-mentor-launcher]').click(); await expect(mentor).toBeVisible();
        geometry.push({ viewport: `${viewport.width}x${viewport.height}`, frame: openFrame, ...measured });
    }
    console.log(`BOTS_MENTOR_STUDY_GEOMETRY ${JSON.stringify(geometry)}`);
    const accessibility = await new AxeBuilder({ page }).include('[data-caissa-mentor-shell]').analyze();
    expect(accessibility.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);

    await page.setViewportSize({ width: 1600, height: 1000 }); await settleFrame(); await page.evaluate(() => window.scrollTo(0, 0));
    const legalOpen = await legalMoves(); const frameOpen = await frame();
    await mentor.getByRole('button', { name: 'Minimize CAISSA Mentor' }).click(); await expect(mentor).toBeHidden();
    const legalMinimized = await legalMoves(); const frameMinimized = await frame();
    expect(legalMinimized).toEqual(legalOpen); expect(frameMinimized).toEqual(frameOpen);
    const minimizedMove = legalMinimized.find(move => move.length === 4); expect(minimizedMove).toBeTruthy();
    const beforeMinimizedMove = await page.evaluate(() => ({ fen: window.CaissaBotsAnalysisExploration.getFen(),
        cursor: window.CaissaBotsAnalysisExploration.getSnapshot().temporaryCursor }));
    await page.locator(`#chessboard .square-${minimizedMove.slice(0, 2)}`).click();
    await expect(page.locator('#chessboard .caissa-board-legal-target')).not.toHaveCount(0);
    await page.locator(`#chessboard .square-${minimizedMove.slice(2, 4)}`).click();
    await expect.poll(() => page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().temporaryCursor))
        .toBe(beforeMinimizedMove.cursor + 1);
    expect(await page.evaluate(() => window.CaissaBotsAnalysisExploration.getFen())).not.toBe(beforeMinimizedMove.fen);
    await shell.getByRole('button', { name: 'Previous study move' }).click();
    expect(await page.evaluate(() => window.CaissaBotsAnalysisExploration.getFen())).toBe(beforeMinimizedMove.fen);
    await page.locator('[data-caissa-mentor-launcher]').click(); await expect(mentor).toBeVisible();
    const draftBeforeLeave = await page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().temporaryPlyCount);
    const fenBeforeClose = await page.evaluate(() => window.CaissaBotsAnalysisExploration.getFen());
    const legalBeforeClose = await page.evaluate(() => { const owner = window.CaissaBotsAnalysisExploration; const moves = [];
        for (const file of 'abcdefgh') for (const rank of '12345678')
            for (const move of owner.movesFrom(`${file}${rank}`)) moves.push(`${move.from}${move.to}${move.promotion || ''}`);
        return moves.sort(); });
    const equivalentGeometry = [];
    for (const viewport of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await shell.scrollIntoViewIfNeeded(); await settleFrame(); await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => { const owner = window.CaissaBotsAnalysisExploration.getSnapshot();
            window.CaissaMentorFloatingShell.setContext({ source: 'bots-analysis-study', fen: owner.currentFen, mode: owner.mode });
            window.CaissaMentorFloatingShell.open(); });
        await expect(mentor).toBeVisible(); const open = await frame();
        if (viewport.width === 1600) await page.screenshot({ path: 'test-results/play-bots-mentor-open-desktop.png', fullPage: true });
        if (viewport.width === 390) await page.screenshot({ path: 'test-results/play-bots-mentor-open-mobile.png', fullPage: true });
        await page.evaluate(() => window.CaissaMentorFloatingShell.minimize()); await expect(mentor).toBeHidden();
        const minimized = await frame();
        if (viewport.width === 1600) await page.screenshot({ path: 'test-results/play-bots-mentor-minimized-desktop.png', fullPage: true });
        if (viewport.width === 390) await page.screenshot({ path: 'test-results/play-bots-mentor-minimized-mobile.png', fullPage: true });
        await page.evaluate(() => window.CaissaMentorFloatingShell.close()); await expect(mentor).toBeHidden();
        const closedFrame = await frame(); expect(minimized).toEqual(open); expect(closedFrame).toEqual(open);
        equivalentGeometry.push({ viewport: `${viewport.width}x${viewport.height}`, open, minimized, closed: closedFrame });
        if (viewport.width === 1600) await page.screenshot({ path: 'test-results/play-bots-mentor-closed-desktop.png', fullPage: true });
        if (viewport.width === 390) await page.screenshot({ path: 'test-results/play-bots-mentor-closed-mobile.png', fullPage: true });
    }
    console.log(`BOTS_MENTOR_FRAME_EQUIVALENCE ${JSON.stringify(equivalentGeometry)}`);
    const closed = await page.evaluate(() => ({ fen: window.CaissaBotsAnalysisExploration.getFen(),
        draft: window.CaissaBotsAnalysisExploration.getSnapshot().temporaryPlyCount,
        context: window.CaissaMentorFloatingShell.inspect().context,
        legal: (() => { const owner = window.CaissaBotsAnalysisExploration; const moves = [];
            for (const file of 'abcdefgh') for (const rank of '12345678')
                for (const move of owner.movesFrom(`${file}${rank}`)) moves.push(`${move.from}${move.to}${move.promotion || ''}`);
            return moves.sort(); })() }));
    expect(closed).toMatchObject({ fen: fenBeforeClose, draft: draftBeforeLeave, context: null });
    expect(closed.legal).toEqual(legalBeforeClose);
    expect(closed.legal).toEqual(legalOpen);
    expect(boardBeforeInteraction.width).toBeGreaterThan(500);
    await page.setViewportSize({ width: 1600, height: 1000 }); await shell.scrollIntoViewIfNeeded(); await settleFrame(); await page.evaluate(() => window.scrollTo(0, 0));
    const closedMove = closed.legal.find(move => move.length === 4); expect(closedMove).toBeTruthy();
    const beforeClosedMove = await page.evaluate(() => ({ fen: window.CaissaBotsAnalysisExploration.getFen(),
        cursor: window.CaissaBotsAnalysisExploration.getSnapshot().temporaryCursor }));
    await page.locator(`#chessboard .square-${closedMove.slice(0, 2)}`).click();
    await page.locator(`#chessboard .square-${closedMove.slice(2, 4)}`).click();
    await expect.poll(() => page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().temporaryCursor))
        .toBe(beforeClosedMove.cursor + 1);
    expect(await page.evaluate(() => window.CaissaBotsAnalysisExploration.getFen())).not.toBe(beforeClosedMove.fen);
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'analysis-exploration');
    await shell.locator('[data-bots-exploration-back]').click();
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'guided-review');
    await expect(mentor).toContainText('General Mentor · no board position is shared');
    const immutableAfter = await page.evaluate(() => ({
        pgn: window.AnalyzeSection.loadedGame.pgn,
        loadedMoves: JSON.stringify(window.AnalyzeSection.getLoadedMoves({ verbose: true })),
        appHistory: JSON.stringify(window.App.moveHistory),
        analysis: JSON.stringify(window.AnalyzeSection.analysisResults),
        authoritativePly: window.AnalyzeSection.currentMoveIndex
    }));
    expect(immutableAfter).toEqual(immutableBefore);
    const restored = await page.evaluate(() => ({
        board: window.App.boardAdapter.getPosition(),
        projection: window.AnalyzeSection.getCoachReviewProjection().fen,
        selected: Number(document.querySelector('[data-bots-guided-notation] [aria-current="move"]')?.dataset.botsGuidedPly)
    }));
    expect(restored).toMatchObject({ board: restored.projection, selected: immutableBefore.authoritativePly });
    runtime.assertClean();
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
