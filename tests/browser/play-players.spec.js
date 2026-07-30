import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
    await page.goto('/play/players?simplified=1');
    await expect(page.locator('[data-players-panel]')).toBeVisible();
});

test('QA route opens Players in the shared shell with five truthful sections', async ({ page }) => {
    await expect(page.locator('[data-shell-mode="players"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-players-section]')).toHaveCount(5);
    await expect(page.locator('[data-players-panel-section]')).toHaveCount(5);
    await expect(page.locator('[data-players-panel-section="availablePlayers"]')).toContainText('Open the real FICS lobby');
    await expect(page.locator('[data-players-panel-section="friendsOnline"]')).toContainText('Friends are coming later');
    await expect(page.locator('[data-players-panel-section="challenges"]')).toContainText('No CAISSA challenge service');
    await expect(page.locator('[data-players-panel-section="recentOpponents"]')).toContainText('No human game history');
    await expect(page.locator('[data-players-panel-section="suggestedPlayers"]')).toContainText('Suggestions need real presence');
    await expect(page.locator('[data-player-id], [data-player-row]')).toHaveCount(0);
});

test('real injected provider snapshot renders typed rows while stale, expired, and disconnected fail closed', async ({ page }) => {
    const result = await page.evaluate(() => {
        const now = 1700000000000;
        const snapshot = {
            provider: 'fics', status: 'connected', authenticated: true,
            observedAt: now, providerTimestamp: now,
            source: 'browser-adapter-fixture',
            records: [{
                provider: 'fics', providerPlayerId: 'VerifiedUser', displayName: 'VerifiedUser',
                rating: { value: 1812, ratingType: 'blitz', provisional: true },
                title: null, status: 'available', preferredTimeControls: [],
                country: null, friendState: 'unsupported', guest: false, lastSeenAt: null,
                providerTimestamp: now, observedAt: now,
                challengeAvailability: 'provider-only',
                capabilities: { challengeEntry: true }, sourceConfidence: 'direct'
            }]
        };
        const ingested = window.CaissaPresenceRegistryInstance.ingest(snapshot);
        const refreshed = window.CaissaPlayersPanelInstance.refresh({ observedAt: now });
        return { ingested, refreshed };
    });
    expect(result.ingested.ok).toBe(true);
    expect(result.refreshed.ok).toBe(true);
    const row = page.locator('[data-presence-row]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('VerifiedUser');
    await expect(row).toContainText('FICS');
    await expect(row).toContainText('1812 blitz provisional');
    await expect(row).toHaveAttribute('aria-label', /provider fics, status available, blitz rating 1812, provisional/);

    await page.evaluate(() => window.CaissaPlayersPanelInstance.refresh({ observedAt: 1700000120000 }));
    await expect(page.locator('[data-presence-row]')).toHaveCount(0);
    await expect(page.locator('[data-players-panel-section="availablePlayers"]')).toContainText('Presence data is stale');

    await page.evaluate(() => window.CaissaPlayersPanelInstance.refresh({ observedAt: 1700000200000 }));
    await expect(page.locator('[data-presence-row]')).toHaveCount(0);

    await page.evaluate(() => {
        window.CaissaPresenceRegistryInstance.ingest({
            provider: 'fics', status: 'disconnected', authenticated: false,
            observedAt: 1700000200001, providerTimestamp: null, records: [], source: 'browser-adapter-fixture'
        });
        window.CaissaPlayersPanelInstance.refresh({ observedAt: 1700000200001 });
    });
    await expect(page.locator('[data-players-panel-section="availablePlayers"]')).toContainText('FICS is disconnected');
    await expect(page.locator('[data-presence-row]')).toHaveCount(0);
});

test('provider-owned challenge fixtures render and validated duplicate actions invoke the adapter once', async ({ page }) => {
    const setup = await page.evaluate(() => {
        const makeRequest = (direction, reference, capabilities) => ({
            provider: 'fics', requestId: `request-${reference}`, direction,
            challengerId: direction === 'incoming' ? 'fics:challenger' : 'fics:me',
            challengedId: direction === 'incoming' ? 'fics:me' : 'fics:opponent',
            challengerName: direction === 'incoming' ? 'RealChallenger' : 'Me',
            challengedName: direction === 'incoming' ? 'Me' : 'RealOpponent',
            timeControl: {
                initialSeconds: 300, incrementSeconds: 3,
                category: 'blitz', providerRepresentation: '5+3'
            },
            rated: 'casual', colorPreference: 'random', variant: 'standard',
            createdAt: 1700000000000, expiresAt: 1700000060000,
            providerReference: reference, capabilities
        });
        const incoming = window.CaissaChallengeLifecycle.createChallenge(makeRequest(
            'incoming', 'challenge-1',
            { submit: false, accept: true, decline: true, cancel: false, reconnect: false, activeGame: true }
        )).value;
        const pending = window.CaissaChallengeLifecycle.transition(incoming, {
            challengeId: incoming.challengeId, provider: 'fics',
            eventType: 'PROVIDER_PENDING', observedAt: 1700000001000,
            providerTimestamp: 1700000001000, sourceConfidence: 'provider',
            reasonCode: null, correlationId: 'provider-event-1'
        }).value;
        const registry = window.CaissaChallengeRegistry.create();
        registry.ingest(pending);
        let calls = 0;
        const adapter = Object.freeze({
            isSupported: () => true,
            getCapabilities: () => Object.freeze({
                create: false, accept: true, decline: true,
                cancel: false, reconnect: false, activeGame: true
            }),
            acceptChallenge: () => new Promise(resolve => {
                calls += 1;
                setTimeout(() => {
                    const current = registry.get(pending.challengeId);
                    const transitioned = window.CaissaChallengeLifecycle.transition(current, {
                        challengeId: current.challengeId, provider: 'fics',
                        eventType: 'PROVIDER_ACCEPTED', observedAt: 1700000002000,
                        providerTimestamp: 1700000002000, sourceConfidence: 'provider',
                        reasonCode: null, correlationId: 'provider-event-2'
                    });
                    resolve({ ok: true, providerUpdate: transitioned.value });
                }, 20);
            }),
            declineChallenge: () => Promise.resolve({ ok: false, providerUpdate: null })
        });
        const host = document.createElement('div');
        host.dataset.challengeFixtureHost = '';
        document.body.appendChild(host);
        const panel = window.CaissaPlayersPanel.create({
            challengeRegistry: registry, challengeAdapters: { fics: adapter }
        });
        panel.mount({ host });
        panel.selectSection('challenges');
        panel.refresh({ observedAt: 1700000001000 });
        window.__challengeFixture = { panel, registry, calls: () => calls, engine: window.App?.engine };
        return panel.getSnapshot();
    });
    expect(setup.sections.challenges.itemCount).toBe(1);
    const host = page.locator('[data-challenge-fixture-host]');
    const row = host.locator('[data-challenge-row]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('RealChallenger');
    await expect(row).toContainText('FICS');
    await expect(row).toContainText('incoming');
    await expect(row).toContainText('pending');
    await expect(row).toContainText('5+3 · casual · random');
    await expect(row.getByRole('button', { name: /Accept RealChallenger/ })).toHaveCount(1);
    await expect(row.getByRole('button', { name: /Decline RealChallenger/ })).toHaveCount(1);

    await row.getByRole('button', { name: /Accept RealChallenger/ }).dblclick();
    await expect(row).toContainText('accepted');
    await expect(row.getByRole('button')).toHaveCount(0);
    expect(await page.evaluate(() => window.__challengeFixture.calls())).toBe(1);
    const resources = await page.evaluate(() => ({
        boards: document.querySelectorAll('#chessboard').length,
        sameEngine: window.App?.engine === window.__challengeFixture.engine,
        diagnostics: window.__challengeFixture.panel.inspect().diagnostics,
        game: window.CaissaPlayCompatibility.getSnapshot()
    }));
    expect(resources.boards).toBe(1);
    expect(resources.sameEngine).toBe(true);
    expect(resources.diagnostics).toMatchObject({
        humanGamesStarted: 0, providerConnectionsCreated: 0,
        storageWrites: 0, timerCount: 0, socketCount: 0, workerCount: 0
    });
    expect(resources.game.game.active).toBe(false);
    for (const [width, height] of [
        [320, 568], [375, 667], [390, 844], [412, 915],
        [768, 1024], [1024, 768], [1366, 768], [1440, 900]
    ]) {
        await page.setViewportSize({ width, height });
        const geometry = await row.evaluate(node => {
            const box = node.getBoundingClientRect();
            return {
                left: box.left, right: box.right,
                viewport: document.documentElement.clientWidth,
                scrollWidth: node.scrollWidth, clientWidth: node.clientWidth
            };
        });
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    }
});

test('Players viewing preserves the board, worker, lifecycle, FairPlay, and active game state', async ({ page }) => {
    const before = await page.evaluate(() => {
        window.__playersIsolation = {
            board: window.App?.board,
            game: window.App?.game,
            worker: window.App?.engine?.worker || null
        };
        return {
        gameFen: window.App?.game?.fen?.(),
        gameActive: window.App?.gameActive,
        lifecycle: window.App?.gameLifecycle?.getSnapshot?.() || null,
        fairPlay: window.CaissaFairPlayPolicy?.inspect?.() || null,
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        players: window.CaissaPlayersPanel && window.CaissaSimplifiedPlayShellInstance
            .getSnapshot().playersPanel
        };
    });
    await page.locator('[data-shell-mode="games"]').click();
    await expect(page).toHaveURL(/\/play\/games\?simplified=1/);
    await page.locator('[data-shell-mode="players"]').click();
    await expect(page).toHaveURL(/\/play\/players\?simplified=1/);
    const after = await page.evaluate(() => ({
        sameBoard: window.App?.board === window.__playersIsolation.board,
        sameGame: window.App?.game === window.__playersIsolation.game,
        gameFen: window.App?.game?.fen?.(),
        gameActive: window.App?.gameActive,
        sameWorker: (window.App?.engine?.worker || null) === window.__playersIsolation.worker,
        lifecycle: window.App?.gameLifecycle?.getSnapshot?.() || null,
        fairPlay: window.CaissaFairPlayPolicy?.inspect?.() || null,
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        resources: window.CaissaSimplifiedPlayShellInstance.getSnapshot().playersPanel.diagnostics
    }));
    expect(after.sameBoard).toBe(true);
    expect(after.sameGame).toBe(true);
    expect(after.sameWorker).toBe(true);
    expect(after.gameFen).toBe(before.gameFen);
    expect(after.gameActive).toBe(before.gameActive);
    expect(after.lifecycle).toEqual(before.lifecycle);
    expect(after.fairPlay).toEqual(before.fairPlay);
    expect(after.boards).toBe(1);
    expect(after.resources.socketCount).toBe(0);
    expect(after.resources.workerCount).toBe(0);
    expect(after.resources.storageWrites).toBe(0);
    expect(after.resources.humanGamesStarted).toBe(0);
});

test('FICS and Classic actions enter their existing independently owned flows', async ({ page }) => {
    await page.locator('[data-players-action="open-fics"]').first().click();
    await expect(page.locator('#ficsSection')).toHaveClass(/active/);
    await expect(page.locator('#ficsConnectionStatus')).toContainText(/Not connected|Disconnected/);
    await page.goBack();
    await expect(page.locator('[data-players-panel]')).toBeVisible();
    await page.locator('[data-players-action="open-classic"]').first().click();
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
    await expect(page.locator('#ycClassicLoginStatus')).toBeVisible();
});

test('non-QA Players route remains inactive and canonicalizes to Games', async ({ page }) => {
    await page.goto('/play/players');
    await expect(page).toHaveURL(/\/play\/games$/);
    await expect(page.locator('[data-players-panel]')).toBeHidden();
    await expect(page.locator('[data-shell-mode="players"]')).toHaveCount(1);
});

test('Back and Forward restore Players without recreating the board', async ({ page }) => {
    await page.evaluate(() => {
        window.__playersBoardNode = document.querySelector('#playSection #chessboard .board-b72b1');
    });
    await page.locator('[data-shell-mode="games"]').click();
    await page.goBack();
    await expect(page.locator('[data-players-panel]')).toBeVisible();
    expect(await page.evaluate(() =>
        document.querySelector('#playSection #chessboard .board-b72b1') === window.__playersBoardNode
    )).toBe(true);
    await page.goForward();
    await expect(page.locator('[data-shell-mode="games"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toHaveCount(1);
});

test('mobile layout keeps every section and action reachable with no serious accessibility violations', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const tabs = page.locator('[data-players-section]');
    for (let index = 0; index < await tabs.count(); index += 1) {
        await tabs.nth(index).click();
        const id = await tabs.nth(index).getAttribute('data-players-section');
        await expect(page.locator(`[data-players-panel-section="${id}"]`)).toBeVisible();
    }
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(page.locator('[data-players-panel-section="availablePlayers"]')).toBeVisible();
    for (const action of await page.locator('.caissa-players-panel__footer [data-players-action]').all()) {
        const box = await action.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const results = await new AxeBuilder({ page })
        .include('[data-players-panel]')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
