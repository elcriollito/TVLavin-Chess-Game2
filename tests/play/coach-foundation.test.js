import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const botFiles = ['bot-profile.js', 'bot-presets.js', 'bot-registry.js', 'bot-session.js']
    .map(name => `js/play/bots/${name}`);
const coachFiles = [
    'coach-profile.js', 'coach-intervention-policy.js', 'coach-messages.js', 'coach-intervention-candidate.js',
    'endgame-phase-classifier.js', 'endgame-knowledge-map.js', 'endgame-detectors.js',
    'endgame-publication-gate.js', 'coach-registry.js', 'coach-session.js', 'coach-observation-service.js'
].map(name => `js/play/coach/${name}`);
const sources = [...botFiles, ...coachFiles].map(name =>
    fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
    const window = { Chess };
    const context = { window, globalThis: window, WeakSet, Set, Map, Object, JSON, structuredClone };
    sources.forEach(source => vm.runInNewContext(source, context));
    return window;
}

test('Coach contracts are versioned, frozen, JSON-safe, and catalog supported profiles', () => {
    const w = load();
    for (const key of ['CaissaCoachProfile', 'CaissaCoachInterventionPolicy', 'CaissaCoachRegistry',
        'CaissaCoachSession', 'CaissaCoachMessages', 'CaissaCoachObservationService']) {
        assert.match(w[key].schemaVersion, /^1\.[0-2]\.0$/);
        assert.equal(Object.isFrozen(w[key]), true);
    }
    const profiles = w.CaissaCoachRegistry.list();
    assert.deepEqual(plain(profiles.map(item => item.id)),
        ['caissa-foundations', 'caissa-tactical-awareness', 'caissa-endgame-guide']);
    assert.ok(profiles.every(item => item.availability.qaOnly && Object.isFrozen(item)));
    assert.equal(profiles.filter(item => item.id.includes('endgame')).length, 1);
});

test('profile validation rejects hostile, unsupported, duplicate, and executable profiles', () => {
    const w = load(); const base = plain(w.CaissaCoachRegistry.getDefault());
    assert.equal(w.CaissaCoachProfile.validate({ ...base, teachingFocus: 'magic' }).valid, false);
    assert.equal(w.CaissaCoachProfile.validate(JSON.parse('{"__proto__":{"polluted":true}}')).valid, false);
    assert.equal(w.CaissaCoachProfile.validate({ ...base, callback() {} }).valid, false);
    assert.equal(w.CaissaCoachRegistry.register(w.CaissaCoachRegistry.getDefault()).reasonCode, 'DUPLICATE_ID');
    assert.equal({}.polluted, undefined);
});

test('policies bound interventions and prohibit move revelation and clock pause', () => {
    const w = load();
    assert.deepEqual(plain(w.CaissaCoachInterventionPolicy.assistanceLevels), ['silent', 'light', 'guided', 'teaching']);
    for (const policy of w.CaissaCoachInterventionPolicy.list()) {
        assert.equal(policy.revealBestMove, false);
        assert.equal(policy.pauseClock, false);
        assert.ok(policy.maximumInterventions <= 4);
        assert.ok(policy.cooldownPlies >= 3);
    }
});

test('session separates pending and active, preserves rematch selection, and resets without persistence', () => {
    const w = load();
    w.CaissaCoachSession.select({ coachId: 'caissa-foundations', assistanceLevel: 'guided', playerColor: 'white' });
    w.CaissaCoachSession.beginGame();
    assert.equal(w.CaissaCoachSession.getSnapshot().active.coachId, 'caissa-foundations');
    assert.deepEqual(plain(w.CaissaCoachSession.getSearchOptions()), { depth: 5 });
    w.CaissaCoachSession.select({ coachId: 'caissa-tactical-awareness', assistanceLevel: 'light' });
    assert.equal(w.CaissaCoachSession.getSnapshot().active.coachId, 'caissa-foundations');
    w.CaissaCoachSession.beginGame();
    assert.equal(w.CaissaCoachSession.getSnapshot().active.coachId, 'caissa-tactical-awareness');
    assert.equal(w.CaissaCoachSession.getSnapshot().active.interventionCount, 0);
    w.CaissaCoachSession.reset();
    assert.equal(w.CaissaCoachSession.getSnapshot().active, null);
});

test('observation is deterministic, post-move-only, bounded, and silent outside Coach', () => {
    const w = load(); const profile = w.CaissaCoachRegistry.get('caissa-foundations');
    const session = { assistanceLevel: 'guided', learnerLevel: 'beginner', interventionCount: 0, lastInterventionPly: null };
    const input = { actor: 'user', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        ply: 8, playerColor: 'white', profile, session };
    const first = w.CaissaCoachObservationService.observe(input);
    assert.deepEqual(plain(first), plain(w.CaissaCoachObservationService.observe(input)));
    assert.equal(first.eligible, true);
    assert.ok(['development-reminder', 'king-safety'].includes(first.trigger));
    assert.equal(w.CaissaCoachObservationService.observe({ ...input, actor: 'engine' }).eligible, false);
    assert.equal(w.CaissaCoachObservationService.observe({ ...input, session: { ...session, assistanceLevel: 'silent' } }).eligible, false);
    assert.doesNotMatch(first.message.message, /\b[a-h][1-8]\b|best move|principal variation/i);
});

test('educational fixtures cover hanging-piece, tactical, king-safety, and neutral outcomes', () => {
    const w = load();
    const tactical = w.CaissaCoachRegistry.get('caissa-tactical-awareness');
    const foundations = w.CaissaCoachRegistry.get('caissa-foundations');
    const session = { assistanceLevel: 'guided', learnerLevel: 'novice', interventionCount: 0, lastInterventionPly: null };
    const hanging = w.CaissaCoachObservationService.observe({
        actor: 'user', fen: '4k3/8/8/3r4/3Q4/8/8/4K3 b - - 0 1', ply: 9,
        playerColor: 'white', profile: tactical, session, move: { from: 'd2', to: 'd4' }
    });
    assert.equal(hanging.trigger, 'immediate-danger');
    assert.ok(hanging.candidates.some(candidate => candidate.triggerCode === 'hanging-piece'));
    const kingSafety = w.CaissaCoachObservationService.observe({
        actor: 'user', fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 7 5',
        ply: 9, playerColor: 'white', profile: foundations, session, move: { from: 'g1', to: 'f3' }
    });
    assert.equal(kingSafety.trigger, 'king-safety');
    const neutral = w.CaissaCoachObservationService.observe({
        actor: 'user', fen: '8/8/8/3k4/8/4K3/8/8 b - - 0 20', ply: 39,
        playerColor: 'white', profile: foundations, session, move: { from: 'e2', to: 'e3' }
    });
    assert.equal(neutral.eligible, false);
});

test('messages are fixed safe templates with no move, PV, HTML, or remote content', () => {
    const w = load(); const serialized = JSON.stringify(w.CaissaCoachMessages.templates);
    assert.doesNotMatch(serialized, /https?:|<script|best move|principal variation|\b[a-h][1-8]\b/i);
    for (const trigger of Object.keys(w.CaissaCoachMessages.templates)) {
        const message = w.CaissaCoachMessages.create(trigger, 'novice');
        assert.equal(message.revealsMove, false);
        assert.equal(message.includesPv, false);
    }
});

test('static Coach runtime owns no worker, storage, polling, clocks, engine request, Mentor, or board mutation', () => {
    const source = sources.slice(botFiles.length).join('\n');
    assert.doesNotMatch(source, /new\s+Worker|localStorage|sessionStorage|setInterval|requestAnimationFrame|MentorAI|TrainingMemory|Mastery|App\.game|App\.board|getBestMove|startAnalysis/);
});
