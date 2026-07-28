import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = [
    'bot-profile.js', 'bot-presets.js', 'bot-registry.js', 'bot-session.js'
].map(name => fs.readFileSync(new URL(`../../js/play/bots/${name}`, import.meta.url), 'utf8'));

function load() {
    const window = {};
    for (const source of files) vm.runInNewContext(source, { window, globalThis: window, WeakSet, Set, Map, Object, JSON });
    return window;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('publishes frozen versioned bot contracts and a four-profile catalog', () => {
    const w = load();
    for (const key of ['CaissaBotProfile', 'CaissaBotPresets', 'CaissaBotRegistry', 'CaissaBotSession']) {
        assert.equal(w[key].schemaVersion, '1.0.0');
        assert.ok(Object.isFrozen(w[key]));
    }
    const catalog = w.CaissaBotRegistry.list({ enabled: true });
    assert.equal(catalog.length, 4);
    assert.ok(catalog.every(Object.isFrozen));
    assert.deepEqual(plain(catalog.map(item => item.id)), [
        'caissa-seed', 'caissa-trail', 'caissa-grove', 'caissa-summit'
    ]);
});

test('profile validation rejects malformed, incompatible, and dangerous input', () => {
    const w = load();
    assert.equal(w.CaissaBotProfile.validate(null).valid, false);
    assert.equal(w.CaissaBotProfile.validate({ schemaVersion: '2.0.0' }).valid, false);
    assert.equal(w.CaissaBotProfile.validate(JSON.parse('{"__proto__":{"polluted":true}}')).valid, false);
    assert.equal({}.polluted, undefined);
    assert.equal(w.CaissaBotRegistry.register(w.CaissaBotRegistry.getDefault()).reasonCode, 'DUPLICATE_ID');
});

test('catalog uses truthful calibration labels and no formal Elo fields', () => {
    const w = load();
    for (const profile of w.CaissaBotRegistry.list()) {
        assert.ok(['estimated', 'internally-tested'].includes(profile.calibrationStatus));
        assert.equal('rating' in profile, false);
        assert.equal('elo' in profile, false);
        assert.ok(profile.description.length > 20);
    }
});

test('every bot maps to a distinct validated engine preset', () => {
    const w = load();
    const profiles = w.CaissaBotRegistry.list();
    const presetIds = profiles.map(profile => profile.enginePresetId);
    const depths = profiles.map(profile => w.CaissaBotPresets.get(profile.enginePresetId).search.depth);
    assert.equal(new Set(presetIds).size, profiles.length);
    assert.equal(new Set(depths).size, profiles.length);
    assert.deepEqual(plain(depths), [2, 5, 9, 14]);
    assert.ok(profiles.every(profile =>
        w.CaissaBotPresets.validate(w.CaissaBotPresets.get(profile.enginePresetId)).valid));
});

test('presets are declarative, bounded, one-worker, and disable unsupported personality mechanisms', () => {
    const w = load();
    for (const preset of w.CaissaBotPresets.list()) {
        assert.equal(preset.constraints.oneWorker, true);
        assert.equal(preset.constraints.attributedRequestRequired, true);
        assert.equal(preset.candidateSelection.enabled, false);
        assert.equal(preset.controlledError.enabled, false);
        assert.equal(preset.opening.enabled, false);
        assert.equal(Object.values(preset).some(value => typeof value === 'function'), false);
    }
});

test('pending selection cannot mutate the active game and rematch retains the bot', () => {
    const w = load();
    w.CaissaBotSession.select('caissa-trail');
    const first = w.CaissaBotSession.beginGame();
    assert.equal(first.ok, true);
    assert.equal(w.CaissaBotSession.getSnapshot().activeBotId, 'caissa-trail');
    w.CaissaBotSession.select('caissa-summit');
    assert.equal(w.CaissaBotSession.getSnapshot().activeBotId, 'caissa-trail');
    assert.deepEqual(plain(w.CaissaBotSession.getSearchOptions()), { depth: 5 });
    w.CaissaBotSession.beginGame();
    assert.equal(w.CaissaBotSession.getSnapshot().activeBotId, 'caissa-summit');
});

test('Games reset restores the original Full Power configuration', () => {
    const w = load();
    w.CaissaBotSession.select('caissa-grove');
    w.CaissaBotSession.beginGame();
    assert.deepEqual(plain(w.CaissaBotSession.getSearchOptions()), { depth: 9 });
    assert.equal(w.CaissaBotSession.resetToFullPower().ok, true);
    assert.equal(w.CaissaBotSession.getSearchOptions(), null);
    assert.deepEqual(plain(w.CaissaBotPresets.fullPower), { depth: null, moveTimeMs: 2000 });
});

test('static boundary excludes workers, App writes, remote profiles, matchmaking, coaching, and uncontrolled random', () => {
    const source = files.join('\n');
    assert.doesNotMatch(source, /new\s+Worker|App\.(?:game|board)\s*=|fetch\s*\(|XMLHttpRequest|WebSocket/);
    assert.doesNotMatch(source, /Math\.random|matchmaking|coach(?:ing)?|mentor/i);
    assert.doesNotMatch(source, /calibrationStatus:\s*['"]calibrated|rated \d|plays exactly like/i);
});

test('both SPA pages register bot dependencies once and before the shell', () => {
    for (const name of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
        for (const file of ['bot-profile.js', 'bot-presets.js', 'bot-registry.js', 'bot-session.js', 'bots-panel.js']) {
            assert.equal(html.split(file).length - 1, 1);
            assert.ok(html.indexOf(file) < html.indexOf('simplified-play-shell.js'));
        }
    }
});
