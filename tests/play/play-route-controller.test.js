import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/play-route-controller.js', import.meta.url), 'utf8');

function load(href = 'https://caissa.test/') {
    let url = new URL(href);
    const listeners = new Map();
    const calls = [];
    const location = {};
    for (const key of ['origin', 'pathname', 'search', 'hash']) {
        Object.defineProperty(location, key, { get: () => url[key] });
    }
    Object.defineProperty(location, 'href', { get: () => url.href });
    const history = {
        pushState(state, _, next) { calls.push(['push', state, next]); url = new URL(next, url); },
        replaceState(state, _, next) { calls.push(['replace', state, next]); url = new URL(next, url); }
    };
    const window = {
        location, history,
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); }
    };
    vm.runInNewContext(source, { window, globalThis: window, URL, URLSearchParams });
    return { api: window.CaissaPlayRouteController, calls, listeners, location };
}

test('publishes a frozen, versioned contract and availability vocabulary', () => {
    const { api } = load();
    assert.equal(api.schemaVersion, '1.1.0');
    assert.ok(Object.isFrozen(api));
    assert.ok(Object.isFrozen(api.modes));
    assert.deepEqual({ ...api.availability }, { games: true, bots: 'qa-only', coach: false, players: false });
});

test('parses canonical Play paths without matching partial site paths', () => {
    const { api } = load();
    for (const path of ['/play', '/play/', '/PLAY', '/play/games', '/play/games/']) {
        const route = api.parse(path);
        assert.equal(route.section, 'play');
        assert.equal(route.mode, 'games');
        assert.ok(Object.isFrozen(route));
        assert.ok(Object.isFrozen(route.query));
    }
    assert.equal(api.parse('/playground').section, 'yahooClassic');
});

test('normalizes inactive and unknown modes to truthful Games behavior', () => {
    const { api } = load();
    for (const mode of ['bots', 'coach', 'players']) {
        const route = api.parse(`/play/${mode}`);
        assert.equal(route.mode, 'games');
        assert.equal(route.requestedMode, mode);
        assert.equal(route.status, 'inactive-mode');
        assert.equal(route.canonicalPath, '/play/games');
    }
    const unknown = api.parse('/play/not-real');
    assert.equal(unknown.status, 'unknown-mode');
    assert.equal(unknown.canonicalPath, '/play/games');
});

test('Bots resolves only with the explicit simplified QA flag', () => {
    const { api } = load();
    const qa = api.parse('/play/bots?simplified=1');
    assert.equal(qa.mode, 'bots');
    assert.equal(qa.status, 'resolved');
    assert.equal(qa.metadata.requestedModeAvailable, true);
    assert.equal(api.parse('/play/bots').mode, 'games');
    assert.equal(api.isModeAvailable('bots'), false);
    assert.equal(api.isModeAvailable('bots', { qa: true }), true);
});

test('adapts legacy Play queries and preserves bounded safe setup data', () => {
    const { api } = load();
    const route = api.parse('/?section=play&fen=8%2F8%2F8%2F8%2F8%2F8%2F8%2FK6k+w+-+-+0+1&opponent=computer&empty=&__proto__=x');
    assert.equal(route.status, 'legacy-adapted');
    assert.equal(route.query.opponent, 'computer');
    assert.equal(route.query.fen, undefined);
    assert.doesNotMatch(JSON.stringify(route), /8%?\/8|K6k/);
    assert.match(api.serialize(route), /^\/play\?/);
    assert.match(api.serialize(route), /fen=/);
    assert.doesNotMatch(api.serialize(route), /section=|__proto__|empty=/);
});

test('preserves opaque Analyze handoff recognition without consuming it', () => {
    const { api } = load();
    const route = api.parse('/?section=analyze&handoff=opaque-token');
    assert.equal(route.section, 'analyze');
    assert.equal(route.handoffToken, 'opaque-token');
    assert.equal(route.reasonCode, 'ANALYZE_HANDOFF_PRESERVED');
});

test('uses replace for cold legacy loads, push for navigation, no-op for same URL, and no push on popstate', () => {
    const fixture = load('https://caissa.test/?section=play&fen=safe');
    const initial = fixture.api.init({ currentSection: 'play', navigateToSection() {} });
    assert.equal(initial.legacy, true);
    assert.equal(fixture.calls[0][0], 'replace');
    assert.match(fixture.location.pathname, /^\/play$/);
    fixture.api.navigate('academy');
    assert.equal(fixture.calls.at(-1)[0], 'push');
    fixture.api.navigate('academy');
    assert.equal(fixture.calls.length, 2);
    fixture.listeners.get('popstate')({});
    assert.equal(fixture.calls.length, 2);
});

test('rejects malformed, traversal, javascript-like, oversized, and dangerous input safely', () => {
    const { api } = load();
    assert.equal(api.parse('http://%').status, 'malformed');
    for (const input of ['/play/../admin', '/play/javascript:alert(1)', '/play/%E0%A4%A']) {
        const route = api.parse(input);
        assert.ok(['unknown-mode', 'resolved'].includes(route.status));
        assert.notEqual(route.canonicalPath, input);
    }
    const huge = api.parse(`/?section=play&fen=${'x'.repeat(5000)}`);
    assert.equal(huge.query.fen, undefined);
    assert.equal(Object.getPrototypeOf(huge.query), null);
});

test('diagnostics are bounded, resettable, and disposal removes the sole listener', () => {
    const { api, listeners } = load();
    api.init();
    for (let i = 0; i < 20; i += 1) api.parse('/play');
    assert.equal(api.inspect().parses, 21);
    api.resetDiagnostics();
    assert.equal(api.inspect().parses, 0);
    api.dispose();
    assert.equal(listeners.has('popstate'), false);
});

test('production module contains no runtime ownership or persistence primitives', () => {
    for (const forbidden of [
        /\bnew\s+Worker\b/, /ClockService/, /\bApp\.(?:game|board)\s*=/,
        /localStorage|sessionStorage/, /requestAnimationFrame|setInterval|setTimeout/,
        /createElement|innerHTML/, /engine\.postMessage|FairPlayPolicy/
    ]) assert.doesNotMatch(source, forbidden);
});

test('local and production hosts narrowly cold-load Play routes with root-based assets', () => {
    const server = fs.readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
    const index = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(server, /pathname === '\/play' \|\| pathname\.startsWith\('\/play\/'\)/);
    assert.deepEqual(vercel.rewrites.filter(({ source }) => source.startsWith('/play')), [
        { source: '/play', destination: '/index.html' },
        { source: '/play/:mode', destination: '/index.html' }
    ]);
    assert.match(index, /<base href="\/">/);
});
