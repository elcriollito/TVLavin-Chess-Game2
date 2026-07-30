import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/players-panel.js', import.meta.url), 'utf8');

function load(actions = {}) {
    const window = {
        document: { createElement() { throw new Error('DOM access is mount-only'); } },
        CaissaNavigation: { navigateToSection() {} },
        CaissaPlayRouteController: { navigate() {} }
    };
    vm.runInNewContext(source, { window, globalThis: window });
    return {
        api: window.CaissaPlayersPanel,
        panel: window.CaissaPlayersPanel.create({ actions })
    };
}

test('publishes frozen versioned contracts and bounded vocabularies', () => {
    const { api } = load();
    assert.equal(api.schemaVersion, '1.2.0');
    assert.equal(api.snapshotSchemaVersion, '1.2.0');
    assert.ok(Object.isFrozen(api));
    assert.ok(Object.isFrozen(api.statuses));
    assert.ok(Object.isFrozen(api.reasonCodes));
    assert.deepEqual([...api.sectionIds], [
        'friendsOnline', 'availablePlayers', 'challenges',
        'recentOpponents', 'suggestedPlayers'
    ]);
    for (const status of [
        'available', 'loading', 'empty', 'coming-later', 'unavailable',
        'disconnected', 'error', 'disabled'
    ]) assert.ok(api.statuses.includes(status));
});

test('default snapshot is detached, deeply frozen, JSON-safe, and truthful', () => {
    const { panel } = load();
    const snapshot = panel.getSnapshot();
    assert.equal(snapshot.activeSection, 'availablePlayers');
    assert.equal(snapshot.sections.friendsOnline.status, 'coming-later');
    assert.equal(snapshot.sections.availablePlayers.status, 'unavailable');
    assert.equal(snapshot.sections.availablePlayers.reasonCode, 'NO_REAL_DATA');
    assert.equal(snapshot.sections.challenges.status, 'unavailable');
    assert.equal(snapshot.sections.recentOpponents.status, 'empty');
    assert.equal(snapshot.sections.suggestedPlayers.status, 'coming-later');
    assert.equal(snapshot.providers.find(item => item.id === 'future-caissa-network').connectionStatus, 'unavailable');
    assert.equal(snapshot.providers.find(item => item.id === 'fics').ownership, 'external-fics');
    assert.equal(snapshot.diagnostics.playerItemCount, 0);
    assert.equal(snapshot.diagnostics.socketCount, 0);
    assert.equal(snapshot.diagnostics.workerCount, 0);
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.sections.availablePlayers.emptyState));
    assert.doesNotThrow(() => JSON.stringify(snapshot));
    const next = panel.getSnapshot();
    assert.notEqual(snapshot, next);
    assert.notEqual(snapshot.sections, next.sections);
});

test('sections select without loading or fabricating data', () => {
    const { api, panel } = load();
    for (const sectionId of api.sectionIds) {
        const selected = panel.selectSection(sectionId);
        assert.equal(selected.ok, true);
        assert.equal(panel.getSnapshot().activeSection, sectionId);
        assert.equal(panel.getSnapshot().diagnostics.playerItemCount, 0);
    }
    assert.equal(panel.selectSection('__proto__').ok, false);
    assert.equal({}.polluted, undefined);
});

test('real entry actions invoke exactly once and unsupported actions fail closed', () => {
    const calls = [];
    const { panel } = load({
        openFics: options => calls.push(['fics', options]),
        connectFics: options => calls.push(['connect', options]),
        openClassic: options => calls.push(['classic', options]),
        returnToGames: options => calls.push(['games', options])
    });
    for (const actionId of ['open-fics', 'connect-fics', 'open-classic', 'return-to-games'])
        assert.equal(panel.executeAction(actionId, { from: 'test' }).ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
        ['fics', { from: 'test' }], ['connect', { from: 'test' }],
        ['classic', { from: 'test' }], ['games', { from: 'test' }]
    ]);
    assert.equal(panel.executeAction('start-matchmaking').ok, false);
    assert.equal(panel.getSnapshot().diagnostics.actionsCompleted, 4);
    assert.equal(panel.getSnapshot().diagnostics.humanGamesStarted, 0);
});

test('malformed input, refresh, and disposal remain bounded', () => {
    const { api } = load();
    const panel = api.create(JSON.parse('{"__proto__":{"polluted":true},"actions":"bad"}'));
    assert.equal(panel.refresh().reasonCode, 'NO_REAL_DATA');
    assert.equal(panel.dispose().reasonCode, 'DISPOSED');
    assert.equal(panel.dispose().status, 'unchanged');
    assert.equal(panel.selectSection('availablePlayers').reasonCode, 'DISPOSED');
    assert.equal(panel.getSnapshot().status, 'disabled');
    assert.equal({}.polluted, undefined);
});

test('providers are unique, immutable data and do not overclaim capabilities', () => {
    const { api } = load();
    const ids = api.providers.map(provider => provider.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(api.providers.every(provider => Object.isFrozen(provider.capabilities)));
    const future = api.providers.find(provider => provider.id === 'future-caissa-network');
    assert.equal(future.capabilities.presence, false);
    assert.equal(future.capabilities.matchmaking, false);
    const classic = api.providers.find(provider => provider.id === 'caissa-classic');
    assert.equal(classic.capabilities.proprietaryMatchmaking, false);
});

test('presence registry integration renders only active immutable records in snapshots', () => {
    const active = Object.freeze({
        presenceId: 'fics:real', provider: 'fics', displayName: 'Real',
        status: 'available', rating: null
    });
    const registry = {
        expire() {},
        getProvider: () => Object.freeze({ provider: 'fics', status: 'connected' }),
        list: () => Object.freeze([active])
    };
    const { api } = load();
    const panel = api.create({ presenceRegistry: registry });
    assert.equal(panel.refresh({ observedAt: 1000 }).reasonCode, 'PROVIDER_AVAILABLE');
    const snapshot = panel.getSnapshot();
    assert.equal(snapshot.sections.availablePlayers.status, 'available');
    assert.equal(snapshot.sections.availablePlayers.itemCount, 1);
    assert.equal(snapshot.diagnostics.playerItemCount, 1);
    assert.ok(Object.isFrozen(snapshot));
});

test('challenge registry integration exposes truthful immutable row counts without starting games', () => {
    const challenge = Object.freeze({
        challengeId: 'fics:seek-1', provider: 'fics', direction: 'incoming',
        challengerName: 'RealChallenger', challengedName: 'Me', state: 'pending',
        rated: 'casual', colorPreference: 'random', timeControl: null,
        availableActions: Object.freeze(['accept', 'decline'])
    });
    const challengeRegistry = {
        expire() {}, list: () => Object.freeze([challenge]), get: () => challenge
    };
    const { api } = load();
    const panel = api.create({ challengeRegistry });
    const refreshed = panel.refresh({ observedAt: 1000 });
    assert.equal(refreshed.reasonCode, 'PROVIDER_AVAILABLE');
    const snapshot = panel.getSnapshot();
    assert.equal(snapshot.sections.challenges.status, 'available');
    assert.equal(snapshot.sections.challenges.itemCount, 1);
    assert.equal(snapshot.diagnostics.challengeItemCount, 1);
    assert.equal(snapshot.diagnostics.humanGamesStarted, 0);
});

test('static guard proves no runtime, connection, storage, game, or fixture ownership', () => {
    for (const forbidden of [
        /\bnew\s+WebSocket\b/, /\bnew\s+Worker\b/, /postMessage\s*\(/,
        /localStorage|sessionStorage|indexedDB/, /setInterval|setTimeout|requestAnimationFrame/,
        /\bApp\.(?:game|board)\s*=/, /\.move\s*\(/, /startNewGame|humanGameStart/,
        /sendCommand|style12|pendingSeek|activeTables|seekActions/,
        /fixture|mockPlayer|fakePlayer|samplePlayer/i
    ]) assert.doesNotMatch(source, forbidden);
});

test('both SPA pages register PlayersPanel once before the simplified shell', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/players-panel\.js/g) || []).length, 1);
        assert.ok(html.indexOf('players-panel.js') < html.indexOf('simplified-play-shell.js'));
    }
});
