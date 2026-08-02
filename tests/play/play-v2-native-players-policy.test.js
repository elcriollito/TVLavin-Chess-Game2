import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
function load() { const window = {}; new vm.Script(read('js/play/play-v2-native-players-policy.js'))
    .runInContext(vm.createContext({ window, globalThis: window, Object })); return window.CaissaPlayV2NativePlayersPolicy; }

test('PlayV2NativePlayersPolicy@1.0.0 freezes the complete CAISSA-native decision', () => {
    const policy = load(); assert.equal(policy.contractId, 'PlayV2NativePlayersPolicy@1.0.0'); assert.equal(Object.isFrozen(policy), true);
    const expected = { provider: 'caissa-native', currentRuntime: 'blocked', publicReady: false, routeAvailability: 'blocked',
        tabAvailability: 'omitted', runtimeResources: 'prohibited', fictionalUsers: 'prohibited', simulatedPresence: 'prohibited',
        fabricatedRatings: 'prohibited', simulatedChallenges: 'prohibited', fakeMatchmaking: 'prohibited',
        analyticsTransport: 'disabled', activationRequiresNativeInfrastructureCertification: true };
    for (const [key, value] of Object.entries(expected)) assert.equal(policy[key], value, key);
    for (const key of ['ficsProvider', 'ficsFallback', 'ficsIdentity', 'ficsProfiles', 'ficsPresence', 'ficsRatings',
        'ficsLobby', 'ficsSeeks', 'ficsChallenges', 'ficsMatchmaking', 'ficsGameServer', 'ficsClocks', 'ficsReconnect',
        'ficsModeration']) assert.equal(policy[key], 'prohibited', key);
});

test('all sixteen native capabilities are missing and fully gated', () => {
    const policy = load(); assert.equal(policy.capabilities.length, 16);
    assert.equal(new Set(policy.capabilities.map(item => item.capabilityId)).size, 16);
    for (const item of policy.capabilities) {
        assert.match(item.requiredOwner, /^native-/); assert.equal(item.currentStatus, 'missing');
        for (const gate of ['securityGate', 'privacyGate', 'reliabilityGate', 'testingGate']) assert.equal(item[gate], 'required-not-certified');
        assert.equal(item.publicActivationDependency, true);
    }
    assert.equal(policy.evaluateActivation({}).allowed, false); assert.equal(policy.evaluateActivation({}).missingCapabilities.length, 16);
    const evidence = Object.fromEntries(policy.capabilities.map(item => [item.capabilityId, { owner: item.requiredOwner, status: 'certified' }]));
    assert.equal(policy.evaluateActivation(evidence).reasonCode, 'POLICY_VERSION_REQUIRES_EXPLICIT_ACTIVATION');
});

test('route, mode, resource, provider, query, fragment and encoded bypasses fail closed', () => {
    const policy = load();
    for (const value of ['/play/beta/players', '/PLAY/BETA/PLAYERS', '/play//beta//players', '/play/beta/%70layers',
        '/play/beta/games?mode=players', '/play/beta/games#players', 'players-stack', 'js/play/players/player-presence.js',
        'fics', 'fics-presence-adapter']) assert.equal(policy.authorize({ type: value.includes('stack') || value.includes('.js') ? 'resource' : 'route', value }).allowed, false, value);
    assert.equal(policy.authorize({ type: 'provider', value: 'caissa-native' }).reasonCode, 'NATIVE_INFRASTRUCTURE_MISSING');
    assert.equal(policy.authorize({ type: 'mode', value: 'games' }).allowed, true);
});

test('identity domains, rating gates and future threats are distinct and incomplete', () => {
    const policy = load(); assert.equal(new Set(Object.values(policy.identityBoundaries)).size, 1);
    assert.deepEqual(Object.keys(policy.identityBoundaries), ['authenticationIdentity', 'publicChessProfile', 'displayName',
        'ratingIdentity', 'presence', 'privateAccountData']);
    assert.equal(policy.ratingGates.length, 9); assert.equal(policy.threats.length, 12);
    assert(policy.threats.includes('fics-fallback-reintroduction'));
});

test('generated entry and live registry omit Players resources, DOM and accessible mode ownership', () => {
    const html = read('play-v2.html'); const registry = read('js/play/performance/play-load-registry.js');
    const shell = read('js/play/simplified-play-shell.js');
    assert.match(html, /play-v2-native-players-policy\.js\?v=1\.0\.0/);
    assert.doesNotMatch(html, /data-play-mode=["']players|id=["']playersPanel|data-players-panel/i);
    assert.doesNotMatch(registry, /['"]players-stack['"]|js\/play\/players\/|players-panel\.js/i);
    assert.doesNotMatch(shell.match(/async #ensureDeferredPanel[\s\S]*?async #syncPanels/)[0], /players/i);
    assert.match(shell, /playersPanel: null/);
});

test('policy is passive and introduces no fictional runtime, data, transport, identity or persistence', () => {
    const source = read('js/play/play-v2-native-players-policy.js');
    assert.doesNotMatch(source, /fetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|new\s+Worker|localStorage|sessionStorage|indexedDB|document\.|cookie|addEventListener|setTimeout|randomUUID/i);
    assert.doesNotMatch(source, /username|email|password|credential|fixture|fake-user|sample-player/i);
});

test('Classic and Legacy FICS owners remain outside the policy change', () => {
    const build = read('scripts/build-play-v2.mjs'); const legacy = read('index.html');
    assert.match(legacy, /js\/fics-client\.js/); assert.match(legacy, /css\/fics-client\.css/);
    assert.match(build, /fics-client/); assert.doesNotMatch(read('js/play/play-v2-native-players-policy.js'), /CaissaFicsClient|FicsGateway|navigateToSection/);
});
