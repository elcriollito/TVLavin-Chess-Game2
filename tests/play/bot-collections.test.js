import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const botFiles = [
    'bot-strength-honesty.js', 'bot-profile.js', 'bot-presets.js', 'bot-personality-policy.js',
    'bot-strength-layer.js', 'bot-registry.js', 'bot-session.js', 'bot-collections.js',
    'bot-seasonal-manifest.js', 'bot-collection-registry.js', 'bot-collection-loader.js'
];
const sources = botFiles.map(name => fs.readFileSync(
    new URL(`../../js/play/bots/${name}`, import.meta.url), 'utf8'));

function load() {
    const window = { Chess: class {} };
    const context = { window, globalThis: window, WeakSet, Set, Map, Object, JSON, Uint32Array, Date };
    for (const source of sources) vm.runInNewContext(source, context);
    return window;
}

const plain = value => JSON.parse(JSON.stringify(value));
const seasonalBot = Object.freeze({
    id: 'gambit-ghost', name: 'Gambit Ghost', categoryId: 'intermediate', targetStrength: 1200,
    availability: 'planned', engineProfileId: null, strengthProfileId: null, personalityProfileId: null,
    artwork: Object.freeze({ type: 'chess-piece', variant: 'halloween' })
});
const seasonalCollection = Object.freeze({
    schemaVersion: '1.0.0', id: 'halloween-2026', title: 'Halloween Bots', kind: 'seasonal',
    enabled: true, priority: 200,
    schedule: Object.freeze({ startAt: '2026-10-15T00:00:00Z', endAt: '2026-11-03T00:00:00Z' }),
    theme: Object.freeze({ id: 'halloween', label: 'Halloween' }), bots: Object.freeze([seasonalBot])
});

test('publishes the agreed chess-piece category ladder', () => {
    const w = load();
    assert.equal(w.CaissaBotCollections.schemaVersion, '1.0.0');
    assert.ok(Object.isFrozen(w.CaissaBotCollections));
    assert.deepEqual(plain(w.CaissaBotCollections.categories.map(({ id, piece, symbol, min, max }) =>
        ({ id, piece, symbol, min, max }))), [
        { id: 'new-to-chess', piece: 'pawn', symbol: '♟', min: 100, max: 249 },
        { id: 'beginner', piece: 'bishop', symbol: '♝', min: 250, max: 999 },
        { id: 'intermediate', piece: 'knight', symbol: '♞', min: 1000, max: 1499 },
        { id: 'advanced', piece: 'rook', symbol: '♜', min: 1500, max: 1999 },
        { id: 'master', piece: 'queen', symbol: '♛', min: 2000, max: 2199 },
        { id: 'candidate-master', piece: 'king', symbol: '♚', min: 2200, max: 2299 },
        { id: 'fide-master', piece: 'king', symbol: '♚', min: 2300, max: 2399 },
        { id: 'international-master', piece: 'king', symbol: '♚', min: 2400, max: 2499 },
        { id: 'grandmaster', piece: 'king', symbol: '♚', min: 2500, max: 3200 },
        { id: 'king-bots', piece: 'king', symbol: '♚', min: null, max: null }
    ]);
});

test('classic roster is permanent, truthful, and tightens to 100 then 50 point steps', () => {
    const w = load();
    const classic = w.CaissaBotCollections.classic;
    assert.equal(w.CaissaBotCollections.validate(classic).valid, true);
    assert.equal(w.CaissaBotCollections.resolveState(classic, Date.parse('2099-01-01T00:00:00Z')), 'active');
    assert.equal(classic.bots.length, 44);
    assert.equal(classic.bots.filter(bot => bot.availability === 'qa-only').length, 44);
    assert.equal(classic.bots.filter(bot => bot.availability === 'planned').length, 0);
    assert.ok(classic.bots.every(bot => bot.engineProfileId === null
        && w.CaissaBotStrengthLayer.has(bot.strengthProfileId)));
    assert.ok(classic.bots.every(bot => !('elo' in bot) && !('rating' in bot) && !('calibrated' in bot)));
    for (const category of w.CaissaBotCollections.categories.filter(item => item.min !== null)) {
        const strengths = classic.bots.filter(bot => bot.categoryId === category.id)
            .map(bot => bot.targetStrength).sort((a, b) => a - b);
        for (let index = 1; index < strengths.length; index += 1) {
            const step = strengths[index] - strengths[index - 1];
            if (category.id === 'advanced') assert.equal(step, 100);
            else if (['master', 'candidate-master', 'fide-master', 'international-master', 'grandmaster'].includes(category.id))
                assert.equal(step, 50);
            else assert.ok([50, 100, 150].includes(step));
        }
    }
    assert.deepEqual(plain(classic.bots.filter(bot => bot.categoryId === 'candidate-master')
        .map(bot => [bot.name, bot.targetStrength])), [['Manuel', 2200], ['Pepe', 2250]]);
});

test('seasonal state resolves scheduled, active, expired, and disabled without hardcoded campaigns', () => {
    const w = load();
    assert.equal(w.CaissaBotCollections.validate(seasonalCollection).valid, true);
    assert.equal(w.CaissaBotCollections.resolveState(seasonalCollection, Date.parse('2026-10-01T00:00:00Z')), 'scheduled');
    assert.equal(w.CaissaBotCollections.resolveState(seasonalCollection, Date.parse('2026-10-31T00:00:00Z')), 'active');
    assert.equal(w.CaissaBotCollections.resolveState(seasonalCollection, Date.parse('2026-11-03T00:00:00Z')), 'expired');
    assert.equal(w.CaissaBotCollections.resolveState({ ...seasonalCollection, enabled: false }, Date.parse('2026-10-31T00:00:00Z')), 'disabled');
});

test('registry supports simultaneous active campaigns and deterministic priority', () => {
    const w = load();
    assert.equal(w.CaissaBotCollectionRegistry.register(seasonalCollection).ok, true);
    const special = { ...seasonalCollection, id: 'capablanca-week', title: 'Capablanca Week',
        kind: 'special-event', priority: 150, theme: { id: 'capablanca', label: 'Capablanca' } };
    assert.equal(w.CaissaBotCollectionRegistry.register(special).ok, true);
    const active = w.CaissaBotCollectionRegistry.listActive({ at: Date.parse('2026-10-31T00:00:00Z') });
    assert.deepEqual(plain(active.map(item => item.collection.id)), ['halloween-2026', 'capablanca-week', 'classic']);
    assert.equal(w.CaissaBotCollectionRegistry.register(seasonalCollection).reasonCode, 'DUPLICATE_ID');
    assert.doesNotThrow(() => w.CaissaBotCollectionRegistry.listActive(null));
});

test('presentation selection preserves Classic identity over its modelled strength profile', () => {
    const w = load();
    assert.equal(w.CaissaBotSession.selectPresentation('pip').ok, true);
    assert.equal(w.CaissaBotSession.beginGame({ seed: 'classic-pip-test' }).ok, true);
    const snapshot = w.CaissaBotSession.getSnapshot();
    assert.equal(snapshot.activeBotId, 'pip');
    assert.deepEqual(plain(snapshot.activePresentation), {
        id: 'pip', botId: 'pip', name: 'Pip', collectionId: 'classic', collectionTitle: 'Classic Bots',
        categoryId: 'new-to-chess', targetStrength: 100,
        piece: 'pawn', symbol: '♟'
    });
    assert.equal(snapshot.activeStrengthProfile.targetStrength, 100);
    assert.deepEqual(plain(snapshot.search), {
        depth: 1, candidateCount: 5, personalityPolicyId: 'strength-100', seed: 'classic-pip-test'
    });
    assert.equal(w.CaissaBotSession.selectPresentation('nia').ok, true);
});

test('validation rejects unsafe, contradictory, duplicate, and non-executable data', () => {
    const w = load();
    assert.equal(w.CaissaBotCollections.validate(JSON.parse('{"__proto__":{"polluted":true}}')).valid, false);
    assert.equal({}.polluted, undefined);
    assert.equal(w.CaissaBotCollections.validate({ ...seasonalCollection,
        schedule: { startAt: seasonalCollection.schedule.endAt, endAt: seasonalCollection.schedule.startAt } }).valid, false);
    assert.equal(w.CaissaBotCollections.validate({ ...seasonalCollection, bots: [seasonalBot, seasonalBot] }).valid, false);
    assert.equal(w.CaissaBotCollections.validateBot({ ...seasonalBot, categoryId: 'beginner' }).valid, false);
    assert.equal(w.CaissaBotCollections.validateBot({ ...seasonalBot, availability: 'available', engineProfileId: 'missing' }).valid, false);
});

test('generic manifests register qualified seasonal bot references only during active dates', () => {
    const w = load();
    assert.equal(w.CaissaBotCollectionLoader.inspect().initialReasonCode, 'MANIFEST_INSTALLED');
    assert.equal(w.CaissaBotCollectionLoader.install({ schemaVersion: '1.0.0', collections: [seasonalCollection] }).ok, true);
    assert.equal(w.CaissaBotCollectionRegistry.resolveBot('halloween-2026:gambit-ghost', {
        at: Date.parse('2026-10-01T00:00:00Z') }), null);
    const active = w.CaissaBotCollectionRegistry.resolveBot('halloween-2026:gambit-ghost', {
        at: Date.parse('2026-10-31T00:00:00Z') });
    assert.equal(active.reference, 'halloween-2026:gambit-ghost');
    assert.equal(active.collection.id, 'halloween-2026');
    assert.equal(active.bot.id, 'gambit-ghost');
    assert.equal(w.CaissaBotCollectionRegistry.resolveBot('halloween-2026:gambit-ghost', {
        at: Date.parse('2026-11-03T00:00:00Z') }), null);
});

test('collection modules remain declarative and load before the bots UI', () => {
    const source = sources.slice(-5).join('\n');
    assert.doesNotMatch(source, /new\s+Worker|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|Math\.random/);
    assert.doesNotMatch(sources[8], /halloween|winter|valentine|christmas/i);
    const registry = fs.readFileSync(new URL('../../js/play/performance/play-load-registry.js', import.meta.url), 'utf8');
    for (const file of ['bot-strength-layer.js', 'bot-collections.js', 'bot-seasonal-manifest.js',
        'bot-collection-registry.js', 'bot-collection-loader.js']) {
        assert.equal(registry.split(file).length - 1, 1);
        assert.ok(registry.indexOf(file) < registry.indexOf('bots-panel.js'));
    }
});
