import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

async function contract() {
    const context = vm.createContext({ globalThis: null, window: null, URL,
        location: { origin: 'https://caissa.test' } });
    context.globalThis = context; context.window = context;
    new vm.Script(await read('js/play/play-v2-fics-isolation.js')).runInContext(context);
    return context.CaissaPlayV2FicsIsolation;
}

test('PlayV2FicsIsolation@1.0.0 declares the immutable native ownership policy', async () => {
    const api = await contract();
    assert.equal(api.contractId, 'PlayV2FicsIsolation@1.0.0');
    assert.deepEqual({ ...api.policy }, {
        playProvider: 'caissa-native', ficsProvider: 'prohibited', ficsFallback: 'prohibited',
        ficsIdentity: 'prohibited', ficsPresence: 'prohibited', ficsRatings: 'prohibited',
        ficsChallenges: 'prohibited', ficsMatchmaking: 'prohibited', ficsGameServer: 'prohibited',
        ficsClocks: 'prohibited', ficsReconnect: 'prohibited', classicOwnership: 'separate',
        legacyFicsOwnership: 'separate', playersRuntime: 'blocked'
    });
    assert(Object.isFrozen(api)); assert(Object.isFrozen(api.policy));
});

test('resource and provider boundary denies FICS, Classic handoffs, Players, and external network', async () => {
    const api = await contract();
    for (const input of [
        { type: 'dynamic-group', value: 'players-stack' },
        { type: 'script', value: 'js/play/players/fics-presence-adapter.js?v=1.0.0' },
        { type: 'route', value: '/play/players?simplified=1' },
        { type: 'transition', value: 'fics' }, { type: 'transition', value: 'yahooClassic' },
        { type: 'provider', value: 'fics' }, { type: 'provider', value: 'caissa-classic' },
        { type: 'network', value: 'wss://fics-gateway.caissa-chess.org', baseOrigin: 'https://caissa.test' }
    ]) assert.equal(api.authorize(input).allowed, false, JSON.stringify(input));
    for (const input of [
        { type: 'dynamic-group', value: 'bots-stack' },
        { type: 'script', value: 'js/play/bots-panel.js?v=1.1.0' },
        { type: 'worker', value: 'engine/stockfish-working.js' },
        { type: 'route', value: '/play/games?simplified=1' },
        { type: 'transition', value: 'analyze' }, { type: 'provider', value: 'caissa-native' },
        { type: 'network', value: 'https://caissa.test/js/play/bots-panel.js', baseOrigin: 'https://caissa.test' }
    ]) assert.equal(api.authorize(input).allowed, true, JSON.stringify(input));
});

test('Play v2 reachable graph contains no FICS adapter, provider, route, or Players runtime', async () => {
    const files = ['js/play/play-route-controller.js','js/play/simplified-play-shell.js',
        'js/play/performance/play-load-registry.js','js/play/performance/play-lazy-loader.js',
        'js/play/games-panel.js','js/play/bots-panel.js','js/play/fair-play-policy.js'];
    const source = (await Promise.all(files.map(read))).join('\n');
    assert.doesNotMatch(source, /\bfics\b|fics-|players-stack|players-panel|open-classic|open-fics|connect-fics/i);
    assert.match(source, /players:\s*false/);
    const playEntry = await read('play-v2.html');
    assert.equal((playEntry.match(/play-v2-fics-isolation\.js/g) || []).length, 1);
    assert.match(playEntry, /data-caissa-play-v2-entry="qa-only"/);
    assert.doesNotMatch(playEntry, /<(?:script|link)[^>]+(?:js\/play\/players\/|(?:css|js)\/fics)/i);
    for (const page of ['index.html','yahoo-classic.html']) {
        const html = await read(page);
        assert.equal((html.match(/play-v2-fics-isolation\.js/g) || []).length, 0);
        assert.match(html, /css\/fics-client\.css/);
        assert.match(html, /js\/fics-style12\.js/);
        assert.match(html, /js\/fics-client\.js/);
    }
});

test('generator explicitly strips known legacy FICS resources while preserving the strict boundary guard', async () => {
    const known = [
        'fics-observability', 'fics-match-research', 'fics-research-actions', 'fics-computer-challenge'
    ];
    const [source, play, publicPlay, builder] = await Promise.all([
        read('index.html'), read('play-v2.html'), read('play-v2-public-beta.html'), read('scripts/build-play-v2.mjs')
    ]);
    for (const name of known) {
        assert.match(source, new RegExp(`js/${name}\\.js`), `${name} remains owned by the legacy source`);
        assert.doesNotMatch(play, new RegExp(`js/${name}\\.js`), `${name} excluded from internal Play`);
        assert.doesNotMatch(publicPlay, new RegExp(`js/${name}\\.js`), `${name} excluded from public Play`);
    }
    assert.match(builder, /fics-\(\?:observability\|match-research\|research-actions\|computer-challenge\)/);
    assert.match(builder, /PROHIBITED_PLAY_V2_RESOURCE/);
});

test('an unclassified FICS script still fails generation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'caissa-play-v2-boundary-'));
    try {
        await mkdir(join(directory, 'scripts'), { recursive: true });
        await mkdir(join(directory, 'api', '_lib'), { recursive: true });
        await writeFile(join(directory, 'scripts', 'build-play-v2.mjs'), await read('scripts/build-play-v2.mjs'));
        await writeFile(join(directory, 'play-v2-unavailable.html'), await read('play-v2-unavailable.html'));
        const source = (await read('index.html')).replace(
            '</body>', '<script src="js/fics-unclassified-boundary-probe.js"></script>\n</body>'
        );
        await writeFile(join(directory, 'index.html'), source);
        const result = spawnSync(process.execPath, [join(directory, 'scripts', 'build-play-v2.mjs')], {
            cwd: directory, encoding: 'utf8'
        });
        assert.notEqual(result.status, 0);
        assert.match(`${result.stdout}\n${result.stderr}`, /PROHIBITED_PLAY_V2_RESOURCE:[\s\S]*fics-unclassified-boundary-probe/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('official Play routing supersedes the retired simplified-query characterization', async () => {
    const [server, vercel, build] = await Promise.all([
        read('server.js'), read('vercel.json'), read('scripts/build-play-v2.mjs')
    ]);
    assert.match(server, /resolvePlayV2BetaEntry/);
    const config = JSON.parse(vercel);
    const qaRules = config.rewrites.filter(rule => rule.destination === '/play-v2.html');
    assert.deepEqual(qaRules, []);
    assert(config.rewrites.some(rule => rule.source === '/play' && rule.destination === '/play-v2-unavailable.html'));
    assert(config.rewrites.some(rule => rule.source === '/play/:mode' && rule.destination === '/play-v2-unavailable.html'));
    assert.match(build, /PROHIBITED_PLAY_V2_RESOURCE/);
});

test('protected legacy owners retain their FICS integration without importing the Play boundary', async () => {
    const legacy = await Promise.all(['js/fics-client.js','js/fics-style12.js','js/yahoo-classic-section.js'].map(read));
    assert(legacy[0].includes('FICS')); assert(legacy[1].includes('FICS'));
    assert(legacy[2].includes('fics') || legacy[2].includes('Fics'));
    for (const source of legacy) assert.doesNotMatch(source, /CaissaPlayV2FicsIsolation/);
});

test('isolation implementation adds no state, identity bridge, transport, or executable fixtures', async () => {
    const source = await read('js/play/play-v2-fics-isolation.js');
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|fetch\s*\(|WebSocket|sendBeacon|XMLHttpRequest|postMessage|PGN|token/i);
    assert.doesNotMatch(source, /\bnew\s+Worker\b|createElement|appendChild|navigateToSection|pushState|replaceState/);
});
