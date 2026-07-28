import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { Chess } from 'chess.js';
import { endgameCoachFixtures } from './coach/endgame/endgame-coach-fixtures.js';

const files = [
    'js/play/bots/bot-profile.js', 'js/play/bots/bot-presets.js', 'js/play/bots/bot-registry.js',
    'js/play/coach/coach-profile.js', 'js/play/coach/coach-intervention-policy.js',
    'js/play/coach/coach-messages.js', 'js/play/coach/coach-intervention-candidate.js',
    'js/play/coach/endgame-phase-classifier.js', 'js/play/coach/endgame-knowledge-map.js',
    'js/play/coach/endgame-detectors.js', 'js/play/coach/endgame-publication-gate.js',
    'js/play/coach/coach-registry.js', 'js/play/coach/coach-session.js',
    'js/play/coach/coach-observation-service.js'
];
const sources = files.map(file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
function load() {
    const window = { Chess };
    const context = { window, globalThis: window, WeakSet, Set, Map, Object, JSON, structuredClone };
    sources.forEach(source => vm.runInNewContext(source, context));
    return window;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('phase classifier is immutable, material-based, conservative, and handles supported phases', () => {
    const w = load(); const classify = (fen, ply = 30) => w.CaissaEndgamePhaseClassifier.classify({ fen, ply });
    assert.equal(classify('bad').phase, 'unknown');
    assert.equal(classify('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 0).phase, 'opening');
    assert.equal(classify('r1bqk2r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 7 5', 30).phase, 'middlegame');
    assert.equal(classify('4k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K3 w Qk - 0 20').phase, 'transition');
    assert.equal(classify('4k3/7p/8/8/8/8/P7/4K1N1 w - - 0 25').phase, 'simplified-endgame');
    const pawn = classify('7k/7p/8/8/8/8/P7/K7 w - - 0 1');
    assert.equal(pawn.phase, 'pawn-ending'); assert.equal(pawn.confidence, 'high');
    assert.equal(Object.isFrozen(pawn.material), true);
});

test('king activity, opposition, passer support, and pawn-square detectors emit factual candidates', () => {
    const w = load();
    for (const fixture of endgameCoachFixtures.positive) {
        const result = w.CaissaEndgameDetectors.evaluate({ fen: fixture.fen, ply: 30,
            playerColor: fixture.playerColor || 'white', move: fixture.move });
        assert.ok(result.candidates.some(item => item.triggerCode === fixture.expected), fixture.id);
        const selected = result.candidates.find(item => item.triggerCode === fixture.expected);
        assert.ok(selected.evidence.endgameFacts.phase.material);
        assert.match(selected.evidence.conceptId, /^ku:endgames:/);
        assert.equal(Object.isFrozen(selected), true);
    }
});

test('opposition recognizes vertical and horizontal geometry but suppresses unsafe contexts', () => {
    const w = load();
    for (const fixture of endgameCoachFixtures.positive.filter(item => item.id.includes('opposition'))) {
        const result = w.CaissaEndgameDetectors.evaluate({ fen: fixture.fen, playerColor: 'white' });
        const fact = result.candidates.find(item => item.triggerCode === 'endgame-opposition');
        assert.equal(fact.evidence.endgameFacts.opposition.direct, true);
    }
    for (const id of ['false-opposition-gap', 'extra-rook-interference']) {
        const fixture = endgameCoachFixtures.quiet.find(item => item.id === id);
        const result = w.CaissaEndgameDetectors.evaluate({ fen: fixture.fen, playerColor: 'white' });
        assert.equal(result.candidates.some(item => item.triggerCode === 'endgame-opposition'), false);
    }
});

test('passed-pawn classification rejects opposing adjacent pawns and blockers', () => {
    const w = load();
    for (const id of ['false-passer', 'blocked-passer']) {
        const fixture = endgameCoachFixtures.quiet.find(item => item.id === id);
        const result = w.CaissaEndgameDetectors.evaluate({ fen: fixture.fen, playerColor: 'white' });
        assert.equal(result.candidates.some(item => item.triggerCode === 'endgame-support-passer'), false, id);
    }
});

test('passer subtypes are factual and protected or connected passers do not use the unsupported-passer lesson', () => {
    const w = load();
    for (const id of ['connected-passers-specific', 'protected-passer-specific']) {
        const fixture = endgameCoachFixtures.quiet.find(item => item.id === id);
        const result = w.CaissaEndgameDetectors.evaluate({ fen: fixture.fen, playerColor: 'white' });
        assert.equal(result.candidates.some(item => item.triggerCode === 'endgame-support-passer'), false, id);
        assert.ok(result.facts.passed.some(item => ['connected', 'protected'].includes(item.subtype)), id);
    }
});

test('pawn-square fact accounts for side to move and suppresses piece interference', () => {
    const w = load(); const fixture = endgameCoachFixtures.positive.find(item => item.id === 'pawn-square');
    const result = w.CaissaEndgameDetectors.evaluate({ fen: fixture.fen, playerColor: 'white' });
    const fact = result.candidates.find(item => item.triggerCode === 'endgame-pawn-square');
    assert.equal(typeof fact.evidence.endgameFacts.pawnSquare.defenderInside, 'boolean');
    const interference = endgameCoachFixtures.quiet.find(item => item.id === 'extra-rook-interference');
    assert.equal(w.CaissaEndgameDetectors.evaluate({ fen: interference.fen,
        playerColor: 'white' }).candidates.some(item => item.triggerCode === 'endgame-pawn-square'), false);
});

test('pawn-square geometry records legal first-move acceleration and suppresses multi-pawn races', () => {
    const w = load();
    const doubleStep = endgameCoachFixtures.positive.find(item => item.id === 'pawn-square-double-step');
    const result = w.CaissaEndgameDetectors.evaluate({ fen: doubleStep.fen, playerColor: 'white' });
    const squareFact = result.candidates.find(item => item.triggerCode === 'endgame-pawn-square')
        .evidence.endgameFacts.pawnSquare;
    assert.equal(squareFact.legalDoubleStep, true);
    assert.equal(squareFact.pawnSteps, squareFact.rawSteps - 1);
    const race = endgameCoachFixtures.quiet.find(item => item.id === 'both-pawns-racing');
    const quiet = w.CaissaEndgameDetectors.evaluate({ fen: race.fen, playerColor: 'white' });
    assert.equal(quiet.candidates.some(item => item.triggerCode === 'endgame-pawn-square'), false);
    assert.ok(quiet.suppressions.some(item => item.detector === 'pawn-square'
        && item.reasonCode === 'TACTICAL_INTERFERENCE'));
});

test('specific endgame concepts suppress generic king activity with bounded reason codes', () => {
    const w = load();
    const fixture = endgameCoachFixtures.positive.find(item => item.id === 'vertical-opposition');
    const result = w.CaissaEndgameDetectors.evaluate({ fen: fixture.fen, playerColor: 'white' });
    assert.equal(result.candidates.some(item => item.triggerCode === 'endgame-opposition'), true);
    assert.equal(result.candidates.some(item => item.triggerCode === 'endgame-activate-king'), false);
    assert.ok(result.suppressions.some(item => item.detector === 'king-activity'
        && item.reasonCode === 'SUPPRESSED_BY_HIGHER_PRIORITY'));
    assert.ok(result.suppressions.length <= 8);
});

test('six deterministic multi-position session contracts remain bounded and exact-move free', () => {
    const w = load();
    assert.equal(endgameCoachFixtures.sessions.length, 6);
    let totalMessages = 0;
    for (const session of endgameCoachFixtures.sessions) {
        assert.ok(session.initialFen);
        assert.ok(session.observations.length >= 2);
        let messages = 0;
        session.observations.forEach((observation, index) => {
            const result = w.CaissaEndgameDetectors.evaluate({ fen: observation.fen,
                playerColor: 'white', ply: 30 + index, tacticalFacts: observation.tacticalFacts });
            assert.ok(result.candidates.length <= 3);
            if (observation.expectedAbsent)
                assert.equal(result.candidates.some(item => item.triggerCode === observation.expectedAbsent), false);
            if (observation.expected && result.candidates.some(item => item.triggerCode === observation.expected))
                messages += 1;
        });
        assert.ok(messages <= 4);
        totalMessages += messages;
    }
    assert.ok(totalMessages > 0);
    assert.doesNotMatch(JSON.stringify(endgameCoachFixtures.sessions), /\b(best move|pv|centipawn)\b/i);
});

test('Knowledge mappings are exact, public, pinned, and validate against released manifest IDs', () => {
    const w = load(); const manifest = JSON.parse(fs.readFileSync(
        new URL('../../knowledge/generated/release-manifest.json', import.meta.url), 'utf8'));
    const ids = new Set(manifest.units.map(unit => unit.id));
    assert.equal(w.CaissaEndgameKnowledgeMap.list().length, 4);
    for (const mapping of w.CaissaEndgameKnowledgeMap.list()) {
        assert.equal(ids.has(mapping.unitId), true);
        assert.equal(w.CaissaEndgameKnowledgeMap.validate(mapping).valid, true);
        assert.match(mapping.publicUrl, /^\/endgame-library\?unit=endgames%2F/);
        assert.doesNotMatch(JSON.stringify(mapping), /private|authoring|evidence/);
    }
    assert.equal(w.CaissaEndgameKnowledgeMap.get('../private'), null);
});

test('publication gate passes all capabilities and a failed detector blocks publication', () => {
    const w = load(); assert.equal(w.CaissaEndgamePublicationGate.snapshot.canPublish, true);
    assert.equal(w.CaissaEndgamePublicationGate.evaluate({ detectors: false }).canPublish, false);
    assert.deepEqual(plain(w.CaissaCoachRegistry.list().map(item => item.id)),
        ['caissa-foundations', 'caissa-tactical-awareness', 'caissa-endgame-guide']);
});

test('Endgame Coach assistance, priority, cooldown, and maximum remain bounded', () => {
    const w = load(); const profile = w.CaissaCoachRegistry.get('caissa-endgame-guide');
    const fixture = endgameCoachFixtures.positive.find(item => item.id === 'pawn-square');
    const observe = level => w.CaissaCoachObservationService.observe({ actor: 'user', fen: fixture.fen,
        ply: 30, playerColor: 'white', profile, move: fixture.move,
        session: { learnerLevel: 'intermediate', assistanceLevel: level, interventionCount: 0,
            lastInterventionPly: null, cooldowns: {} } });
    assert.equal(observe('silent').eligible, false);
    assert.equal(observe('light').trigger, 'endgame-pawn-square');
    assert.equal(observe('guided').message.explanation, null);
    assert.ok(observe('teaching').message.explanation);
    const blocked = w.CaissaCoachObservationService.observe({ ...observeInput(profile, fixture),
        session: { ...observeInput(profile, fixture).session, cooldowns: { 'pawn-race': 29 } } });
    assert.equal(blocked.reasonCode, 'COOLDOWN');
    const limited = w.CaissaCoachObservationService.observe({ ...observeInput(profile, fixture),
        session: { ...observeInput(profile, fixture).session, interventionCount: 4 } });
    assert.equal(limited.reasonCode, 'LIMIT_REACHED');
});

function observeInput(profile, fixture) {
    return { actor: 'user', fen: fixture.fen, ply: 30, playerColor: 'white', profile, move: fixture.move,
        session: { learnerLevel: 'intermediate', assistanceLevel: 'guided', interventionCount: 0,
            lastInterventionPly: null, cooldowns: {} } };
}

test('false-positive suite stays silent for the named lesson and detector runtime is bounded', () => {
    const w = load(); const timings = [];
    for (const fixture of endgameCoachFixtures.quiet) {
        const start = performance.now();
        const result = w.CaissaEndgameDetectors.evaluate({ fen: fixture.fen, ply: 30, playerColor: 'white' });
        timings.push(performance.now() - start);
        if (fixture.id === 'king-already-active')
            assert.equal(result.candidates.some(item => item.triggerCode === 'endgame-activate-king'), false);
        if (fixture.id === 'middlegame-heavy') assert.equal(result.supported, false);
    }
    assert.ok(Math.max(...timings) < 100);
    process.stdout.write(`ENDGAME_COACH_METRICS ${JSON.stringify({ suite: endgameCoachFixtures.id,
        positive: endgameCoachFixtures.positive.length, falsePositive: endgameCoachFixtures.quiet.length,
        averageRuntimeMs: Number((timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(3)),
        maximumRuntimeMs: Number(Math.max(...timings).toFixed(3)) })}\n`);
});

test('static endgame runtime has no worker, network, tablebase, storage, engine, clock, or dynamic UI ownership', () => {
    const text = sources.slice(6, 11).join('\n');
    assert.doesNotMatch(text, /new\s+Worker|fetch\s*\(|XMLHttpRequest|WebSocket|tablebase|localStorage|sessionStorage|setInterval|requestAnimationFrame|getBestMove|startAnalysis|innerHTML|Mentor|TrainingMemory|Mastery/);
});
