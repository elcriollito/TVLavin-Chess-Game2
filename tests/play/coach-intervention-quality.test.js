import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { Chess } from 'chess.js';
import { fixtureSuite } from './coach/coach-intervention-fixtures.js';

const files = [
    'js/play/bots/bot-profile.js', 'js/play/bots/bot-presets.js', 'js/play/bots/bot-registry.js',
    'js/play/coach/coach-profile.js', 'js/play/coach/coach-intervention-policy.js',
    'js/play/coach/coach-registry.js', 'js/play/coach/coach-session.js', 'js/play/coach/coach-messages.js',
    'js/play/coach/coach-intervention-candidate.js', 'js/play/coach/coach-observation-service.js'
];
const source = files.map(file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
function load() {
    const window = { Chess };
    const context = { window, globalThis: window, WeakSet, Set, Map, Object, JSON, structuredClone };
    source.forEach(code => vm.runInNewContext(code, context));
    return window;
}
const session = (level = 'guided') => ({ assistanceLevel: level, learnerLevel: 'novice',
    interventionCount: 0, lastInterventionPly: null, interventionHistory: [], cooldowns: {} });
function observe(w, fixture, level = 'guided', coach = 'caissa-tactical-awareness') {
    return w.CaissaCoachObservationService.observe({ actor: 'user', fen: fixture.fen, ply: fixture.ply,
        playerColor: 'white', profile: w.CaissaCoachRegistry.get(coach), session: session(level), move: fixture.move });
}

test('candidate contract is immutable, bounded, JSON-safe, and rejects malformed evidence', () => {
    const w = load();
    const result = w.CaissaCoachInterventionCandidate.create({ triggerCode: 'test-trigger', category: 'tactical',
        phase: 'opening', confidence: 'high', severity: 'warning', priority: 1, evidence: { fact: true },
        messageTemplateId: 'test-trigger', eligibleAssistanceLevels: ['light'], cooldownGroup: 'tactical',
        suppressible: false });
    assert.equal(result.ok, true); assert.equal(Object.isFrozen(result.value.evidence), true);
    assert.doesNotThrow(() => JSON.stringify(result.value));
    assert.equal(w.CaissaCoachInterventionCandidate.create({ ...result.value, confidence: 'certain' }).ok, false);
    assert.equal(w.CaissaCoachInterventionCandidate.create({ ...result.value, evidence: { callback() {} } }).ok, false);
    assert.equal(w.CaissaCoachInterventionCandidate.create({ ...result.value,
        evidence: JSON.parse('{"__proto__":{"polluted":true}}') }).ok, false);
});

test('fixture suite suppresses defended-piece and quiet/endgame false positives', () => {
    const w = load();
    for (const fixture of fixtureSuite.fixtures) {
        const coach = ['development', 'king-safety', 'positive'].includes(fixture.category)
            || fixture.id.includes('development') || fixture.id.includes('opening')
            ? 'caissa-foundations' : 'caissa-tactical-awareness';
        const result = observe(w, fixture, fixture.category === 'positive' ? 'teaching' : 'guided', coach);
        if (fixture.expected) assert.equal(result.trigger, fixture.expected, fixture.id);
        else if (fixture.forbiddenCandidate)
            assert.equal(result.candidates.some(item => item.triggerCode === fixture.forbiddenCandidate), false, fixture.id);
        else assert.equal(result.eligible, false, fixture.id);
    }
});

test('assistance levels differ behaviorally for the same medium-confidence fact', () => {
    const w = load(); const fixture = fixtureSuite.fixtures.find(item => item.id === 'defended-attacked-piece');
    assert.equal(observe(w, fixture, 'silent').eligible, false);
    assert.equal(observe(w, fixture, 'light').eligible, false);
    assert.equal(observe(w, fixture, 'guided').trigger, 'tactical-awareness');
    const teaching = observe(w, fixture, 'teaching');
    assert.equal(teaching.trigger, 'tactical-awareness');
    assert.ok(teaching.message.explanation);
});

test('cooldown is grouped, high-priority danger bypasses unrelated global cooldown, and limit blocks', () => {
    const w = load(); const fixture = fixtureSuite.fixtures[0];
    const profile = w.CaissaCoachRegistry.get('caissa-tactical-awareness');
    const base = { actor: 'user', fen: fixture.fen, ply: 21, playerColor: 'white', profile,
        move: fixture.move, session: { ...session(), lastInterventionPly: 20, cooldowns: { development: 20 } } };
    assert.equal(w.CaissaCoachObservationService.observe(base).trigger, 'hanging-piece');
    assert.equal(w.CaissaCoachObservationService.observe({ ...base,
        session: { ...base.session, cooldowns: { tactical: 20 } } }).reasonCode, 'COOLDOWN');
    assert.equal(w.CaissaCoachObservationService.observe({ ...base,
        session: { ...base.session, interventionCount: 4 } }).reasonCode, 'LIMIT_REACHED');
});

test('session history is bounded, immutable, reset on rematch, and produces factual summary', () => {
    const w = load(); w.CaissaCoachSession.select({ coachId: 'caissa-tactical-awareness',
        assistanceLevel: 'teaching', playerColor: 'white' }); w.CaissaCoachSession.beginGame();
    for (let i = 0; i < 10; i += 1) w.CaissaCoachSession.recordIntervention({ ply: i + 1,
        triggerCode: 'tactical-awareness', category: 'tactical', confidence: 'medium',
        severity: 'notice', cooldownGroup: 'tactical', messageTemplateId: 'tactical-awareness',
        evidence: { conceptId: 'local:tactical-scan' } });
    assert.equal(w.CaissaCoachSession.getInterventionHistory().length, 8);
    assert.equal(w.CaissaCoachSession.getSummary().frequentCategory, 'tactical');
    assert.equal(Object.isFrozen(w.CaissaCoachSession.getInterventionHistory()), true);
    w.CaissaCoachSession.beginGame();
    assert.equal(w.CaissaCoachSession.getInterventionHistory().length, 0);
});

test('trusted templates are bounded, level-aware, and contain no prohibited analysis content', () => {
    const w = load(); const serialized = JSON.stringify(w.CaissaCoachMessages.templates);
    assert.equal(w.CaissaCoachMessages.templateVersion, 'coach-message-templates@1.1.0');
    assert.doesNotMatch(serialized, /centipawn|principal variation|\bPV\b|\b[a-h][1-8]\b|https?:|<\w+/i);
    for (const id of Object.keys(w.CaissaCoachMessages.templates)) {
        for (const level of ['beginner', 'novice']) {
            const guided = w.CaissaCoachMessages.create(id, level, 'guided');
            const teaching = w.CaissaCoachMessages.create(id, level, 'teaching');
            assert.ok(guided.message.length <= 220); assert.equal(guided.explanation, null);
            assert.ok(teaching.explanation.length <= 180);
        }
    }
});

test('fixture runtime is bounded and deterministic', () => {
    const w = load(); const timings = [];
    for (const fixture of fixtureSuite.fixtures) {
        const start = performance.now();
        const first = observe(w, fixture);
        timings.push(performance.now() - start);
        assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(observe(w, fixture))));
    }
    assert.ok(Math.max(...timings) < 100);
    process.stdout.write(`COACH_QUALITY_METRICS ${JSON.stringify({ suite: fixtureSuite.id,
        fixtures: fixtureSuite.fixtures.length, averageRuntimeMs: Number((timings.reduce((a, b) => a + b, 0)
            / timings.length).toFixed(3)), maximumRuntimeMs: Number(Math.max(...timings).toFixed(3)) })}\n`);
});
