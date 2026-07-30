import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const files = [
    'js/mentor/guided-replay-prompts.js',
    'js/mentor/guided-replay-contracts.js',
    'js/mentor/mentor-guided-replay.js'
];
const sources = files.map(file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
    const window = { Chess };
    const context = { window, globalThis: window, Object, WeakSet, Set, Map, Date, Math, JSON };
    sources.forEach(source => vm.runInNewContext(source, context));
    return window;
}
const source = moves => ({ moves: { history: moves }, position: { initialFen: null } });
function input(options = {}) {
    const runId = options.runId || 'run:replay';
    const requestId = 'request:replay';
    const moments = options.moments ?? [{
        schemaVersion: '1.0.0', candidateId: 'candidate:1', ply: 1, category: 'opening',
        signals: { consecutiveMove: true, evaluationBefore: 20, evaluationAfter: -80 },
        reasonCodes: ['EVALUATION_SWING']
    }];
    return {
        request: { requestId, mentor: { id: 'academyMentorCaissa' },
            review: { explanationStyle: options.style || 'balanced' } },
        analysisResult: { schemaVersion: '1.1.0', resultId: `analysis-result:${runId}`,
            runId, requestId, status: options.partial ? 'partial' : 'complete',
            positions: options.positions || [{
                ply: 0, evaluation: { cp: 20, mate: null, perspective: 'white' },
                bestMove: { uci: 'e2e4' }, principalVariation: ['e2e4', 'e7e5']
            }] },
        selection: { schemaVersion: '1.0.0', selectionId: 'selection:replay',
            runId, requestId, selectedCount: moments.length, selectedMoments: moments },
        source: options.source || source(['e4'])
    };
}

test('publishes immutable versioned statuses, prompt types and answer policies', () => {
    const w = load();
    assert.equal(w.CaissaMentorGuidedReplay.schemaVersion, '1.1.0');
    assert.deepEqual(plain(w.CaissaGuidedReplayPrompts.promptTypes),
        ['play-move', 'choose-move', 'reflect']);
    assert.ok(w.CaissaMentorGuidedReplay.statuses.includes('awaiting-attempt'));
    assert.ok(w.CaissaMentorGuidedReplay.answerPolicies.includes('hidden-until-attempt'));
    assert.ok(Object.isFrozen(w.CaissaMentorGuidedReplay.statuses));
});

test('prepare correlates prerequisites and resolves exact pre-move position without mutation', () => {
    const w = load(); const original = input();
    const before = JSON.stringify(original);
    const prepared = w.CaissaMentorGuidedReplay.create({ now: () => 10 }).prepare(original);
    assert.equal(prepared.ok, true);
    assert.equal(prepared.value.totalSteps, 1);
    assert.equal(prepared.value.currentStep.position.fenBefore, new Chess().fen());
    assert.equal(prepared.value.currentStep.sideToMove, 'white');
    assert.equal(JSON.stringify(original), before);
    const mismatch = input(); mismatch.selection.requestId = 'other';
    assert.equal(w.CaissaMentorGuidedReplay.create().prepare(mismatch).reasonCode,
        'INVALID_REPLAY_INPUT');
});

test('answer is absent from every public snapshot before a legal attempt and reveal', () => {
    const w = load(); const replay = w.CaissaMentorGuidedReplay.create({ now: () => 10 });
    const prepared = replay.prepare(input()).value; replay.start(prepared.sessionId);
    for (const publicValue of [replay.getSession(prepared.sessionId),
        replay.getStep(prepared.sessionId), replay.getSnapshot(prepared.sessionId), replay.inspect()]) {
        assert.doesNotMatch(JSON.stringify(publicValue), /e2e4/);
    }
    assert.equal(replay.reveal(prepared.sessionId).reasonCode, 'REVEAL_NOT_AVAILABLE');
});

test('illegal and malformed moves do not advance or create attempts', () => {
    const w = load(); const replay = w.CaissaMentorGuidedReplay.create();
    const prepared = replay.prepare(input()).value; replay.start(prepared.sessionId);
    assert.equal(replay.submitMove(prepared.sessionId, 'e2e5').reasonCode, 'ILLEGAL_MOVE');
    assert.equal(replay.submitMove(prepared.sessionId, 'javascript:').reasonCode, 'MALFORMED_MOVE');
    const snapshot = replay.getSnapshot(prepared.sessionId);
    assert.equal(snapshot.status, 'awaiting-attempt'); assert.equal(snapshot.attempts.length, 0);
});

test('reference match produces technical feedback and reveals only after attempt', () => {
    const w = load(); const replay = w.CaissaMentorGuidedReplay.create({ now: () => 20 });
    const prepared = replay.prepare(input()).value; replay.start(prepared.sessionId);
    const attempted = replay.submitMove(prepared.sessionId, 'e2e4');
    assert.equal(attempted.ok, true);
    assert.equal(attempted.value.currentStep.feedback.comparison, 'submitted');
    assert.equal(attempted.value.attempts[0].comparison, 'submitted');
    assert.equal(attempted.value.currentStep.answer.referenceMove, null);
    const revealed = replay.reveal(prepared.sessionId);
    assert.equal(revealed.value.currentStep.answer.referenceMove, 'e2e4');
    assert.equal(revealed.value.currentStep.feedback.comparison, 'reference-match');
    assert.deepEqual(plain(revealed.value.currentStep.answer.principalVariation), ['e2e4', 'e7e5']);
    assert.equal(replay.reveal(prepared.sessionId).reasonCode, 'ALREADY_REVEALED');
});

test('legal alternate move is accepted without grading', () => {
    const w = load(); const replay = w.CaissaMentorGuidedReplay.create();
    const prepared = replay.prepare(input()).value; replay.start(prepared.sessionId);
    replay.submitMove(prepared.sessionId, 'd2d4');
    const alternate = replay.reveal(prepared.sessionId);
    assert.equal(alternate.value.currentStep.feedback.comparison, 'legal-alternative');
    assert.equal(alternate.value.currentStep.feedback.technicalOutcome, 'changed');
    assert.doesNotMatch(JSON.stringify(alternate), /blunder|mistake|inaccuracy|grade/i);
});

test('navigation, completion, restart and cancellation use explicit transitions', () => {
    const w = load(); const replay = w.CaissaMentorGuidedReplay.create();
    const value = input({
        source: source(['e4', 'e5', 'Nf3']),
        positions: [
            { ply: 0, evaluation: { cp: 0, perspective: 'white' },
                bestMove: { uci: 'e2e4' }, principalVariation: ['e2e4'] },
            { ply: 2, evaluation: { cp: 10, perspective: 'white' },
                bestMove: { uci: 'g1f3' }, principalVariation: ['g1f3'] }
        ],
        moments: [
            { candidateId: 'c1', ply: 1, category: 'opening',
                signals: { consecutiveMove: true }, reasonCodes: [] },
            { candidateId: 'c2', ply: 3, category: 'decision',
                signals: { consecutiveMove: true }, reasonCodes: [] }
        ]
    });
    const prepared = replay.prepare(value).value; replay.start(prepared.sessionId);
    replay.submitMove(prepared.sessionId, 'e2e4');
    assert.equal(replay.next(prepared.sessionId).value.currentStepIndex, 1);
    assert.equal(replay.previous(prepared.sessionId).value.currentStepIndex, 0);
    replay.next(prepared.sessionId); replay.submitMove(prepared.sessionId, 'g1f3');
    assert.equal(replay.next(prepared.sessionId).status, 'completed');
    const restarted = replay.restart(prepared.sessionId);
    assert.equal(restarted.status, 'awaiting-attempt'); assert.equal(restarted.value.attempts.length, 0);
    assert.equal(replay.cancel(prepared.sessionId).status, 'canceled');
});

test('promotion and underpromotion use chess.js legality from custom FEN', () => {
    const w = load(); const replay = w.CaissaMentorGuidedReplay.create();
    const value = input({
        source: { initialFen: '8/P7/8/8/8/8/7k/5K2 w - - 0 1', moves: ['a8=Q'] },
        positions: [{ ply: 0, evaluation: { cp: 500, perspective: 'white' },
            bestMove: { uci: 'a7a8q' }, principalVariation: ['a7a8q'] }],
        moments: [{ candidateId: 'promotion', ply: 1, category: 'endgame',
            signals: { consecutiveMove: true }, reasonCodes: ['MATERIAL_CHANGE'] }]
    });
    const prepared = replay.prepare(value).value; replay.start(prepared.sessionId);
    assert.equal(replay.submitMove(prepared.sessionId, 'a7a8n').ok, true);
    assert.equal(replay.getSnapshot(prepared.sessionId).attempts[0].comparison, 'submitted');
    assert.equal(replay.reveal(prepared.sessionId).value.attempts[0].comparison, 'legal-alternative');
});

test('castling and en passant attempts use exact custom-FEN legality', () => {
    for (const fixture of [
        { fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', san: 'O-O',
            uci: 'e1g1', category: 'transition' },
        { fen: '8/8/8/3pP3/8/8/8/4K2k w - d6 0 1', san: 'exd6',
            uci: 'e5d6', category: 'tactical' }
    ]) {
        const w = load(); const replay = w.CaissaMentorGuidedReplay.create();
        const value = input({
            source: { initialFen: fixture.fen, moves: [fixture.san] },
            positions: [{ ply: 0, evaluation: { cp: 0, perspective: 'white' },
                bestMove: { uci: fixture.uci }, principalVariation: [fixture.uci] }],
            moments: [{ candidateId: fixture.uci, ply: 1, category: fixture.category,
                signals: { consecutiveMove: true }, reasonCodes: [] }]
        });
        const prepared = replay.prepare(value).value; replay.start(prepared.sessionId);
        assert.equal(replay.submitMove(prepared.sessionId, fixture.uci).ok, true, fixture.uci);
    }
});

test('mate transitions produce a technical outcome band without grading', () => {
    const w = load(); const replay = w.CaissaMentorGuidedReplay.create();
    const value = input();
    value.selection.selectedMoments[0].signals.mateBefore = null;
    value.selection.selectedMoments[0].signals.mateAfter = 2;
    const prepared = replay.prepare(value).value; replay.start(prepared.sessionId);
    const attempted = replay.submitMove(prepared.sessionId, 'e2e4');
    assert.equal(attempted.value.currentStep.feedback.technicalOutcome, 'mate-transition');
});

test('non-consecutive, zero-moment, partial and expired sessions are honest', () => {
    const w = load();
    const reflectInput = input();
    reflectInput.selection.selectedMoments[0].signals.consecutiveMove = false;
    const reflect = w.CaissaMentorGuidedReplay.create();
    const reflected = reflect.prepare(reflectInput).value; reflect.start(reflected.sessionId);
    assert.equal(reflect.getStep(reflected.sessionId).prompt.promptType, 'reflect');
    assert.equal(reflect.submitChoice(reflected.sessionId, 'acknowledge').ok, true);
    const empty = input({ moments: [] }); empty.selection.selectedCount = 0;
    const emptyReplay = w.CaissaMentorGuidedReplay.create();
    const emptyPrepared = emptyReplay.prepare(empty).value;
    assert.equal(emptyReplay.start(emptyPrepared.sessionId).status, 'completed');
    const partial = w.CaissaMentorGuidedReplay.create();
    assert.equal(partial.prepare(input({ partial: true })).ok, true);
    let time = 0; const expiring = w.CaissaMentorGuidedReplay.create({
        now: () => time, sessionTtlMs: 1000
    });
    const expired = expiring.prepare(input()).value; time = 1001;
    assert.equal(expiring.start(expired.sessionId).reasonCode, 'SESSION_EXPIRED');
});

test('registry and diagnostics stay bounded and disposal is terminal', () => {
    const w = load(); const replay = w.CaissaMentorGuidedReplay.create();
    for (let index = 0; index < 12; index += 1) replay.prepare(input({ runId: `run:${index}` }));
    assert.equal(replay.inspect().sessionCount, 8);
    assert.equal(replay.inspect().engineRequests, 0);
    assert.equal(replay.inspect().storageWrites, 0);
    assert.equal(replay.dispose().status, 'disposed');
    assert.equal(replay.prepare(input()).reasonCode, 'DISPOSED');
});

test('fixed templates support every category and style without answer interpolation', () => {
    const w = load();
    for (const category of ['opening', 'tactical', 'strategic', 'transition',
        'endgame', 'decision', 'terminal']) {
        for (const style of ['concise', 'balanced', 'detailed', 'socratic']) {
            const prompt = w.CaissaGuidedReplayPrompts.resolve(category, { style });
            assert.ok(prompt.text.length < 120);
            assert.doesNotMatch(prompt.text, /e2e4|evaluation|weakness|best move/i);
        }
    }
});

test('required replay fixtures define technical expectations without Mentor prose', () => {
    const initial = new Chess().fen();
    const afterE4 = (() => { const game = new Chess(); game.move('e4'); return game.fen(); })();
    const fixtures = [
        ['opening decision', 'opening', initial, ['e2e4', 'd2d4'], 'e2e4', 'reference-match', 'play-move', 'after-attempt'],
        ['tactical queen loss', 'tactical', initial, ['e2e4', 'd2d4'], 'e2e4', 'legal-alternative', 'play-move', 'after-attempt'],
        ['missed mate', 'tactical', initial, ['e2e4'], 'e2e4', 'reference-match', 'play-move', 'after-attempt'],
        ['Black-side critical move', 'decision', afterE4, ['e7e5', 'c7c5'], 'e7e5', 'reference-match', 'play-move', 'after-attempt'],
        ['strategic shift', 'strategic', initial, ['d2d4', 'g1f3'], 'd2d4', 'reference-match', 'play-move', 'after-attempt'],
        ['transition to endgame', 'transition', initial, ['e2e4'], 'e2e4', 'reference-match', 'play-move', 'after-attempt'],
        ['terminal checkmate', 'terminal', initial, ['e2e4'], 'e2e4', 'reference-match', 'play-move', 'after-attempt']
    ].map(([name, category, fenBefore, expectedLegalMoves, referenceMove,
        expectedComparison, promptType, revealBehavior]) => ({
        name, selectedMoment: { candidateId: `fixture:${name}`, category, ply: 1 },
        preMovePosition: fenBefore, expectedLegalMoves, referenceMove,
        expectedComparison, promptType, revealBehavior
    }));
    const w = load();
    for (const fixture of fixtures) {
        assert.ok(fixture.selectedMoment);
        assert.doesNotThrow(() => new Chess(fixture.preMovePosition));
        const game = new Chess(fixture.preMovePosition);
        const legal = new Set(game.moves({ verbose: true }).map(move =>
            `${move.from}${move.to}${move.promotion || ''}`));
        fixture.expectedLegalMoves.forEach(move => assert.ok(legal.has(move), `${fixture.name}:${move}`));
        assert.ok(legal.has(fixture.referenceMove), fixture.name);
        assert.equal(w.CaissaGuidedReplayPrompts.resolve(
            fixture.selectedMoment.category).promptType, fixture.promptType);
        assert.equal(fixture.revealBehavior, 'after-attempt');
        assert.doesNotMatch(JSON.stringify(fixture), /mentorText|knowledgeUnit|recommendation/i);
    }
});

test('static replay boundary has no engine, Worker, DOM, storage, Knowledge, Memory or Mastery', () => {
    const text = sources.join('\n');
    assert.doesNotMatch(text, /EngineAdapter|EngineRegistry|new\s+Worker|document\.|innerHTML|fetch\s*\(/);
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB|KnowledgeUnit|TrainingMemory|Mastery/);
    assert.doesNotMatch(text, /blunder|mistake|inaccuracy|recommendation/i);
});

test('UI boundary registers once, owns no engine/storage, and never places the answer in attributes', () => {
    const view = fs.readFileSync(new URL('../../js/mentor/guided-replay-view.js', import.meta.url), 'utf8');
    const css = fs.readFileSync(new URL('../../css/mentor-guided-replay.css', import.meta.url), 'utf8');
    assert.doesNotMatch(view, /EngineAdapter|EngineRegistry|new\s+Worker|localStorage|sessionStorage|indexedDB/);
    assert.doesNotMatch(view, /dataset\.(?:answer|reference)|setAttribute\([^,]*(?:answer|reference)/i);
    assert.match(css, /@media \(max-width: 760px\)/);
    const registry = fs.readFileSync(new URL('../../js/play/performance/play-load-registry.js', import.meta.url), 'utf8');
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        for (const asset of ['guided-replay-prompts.js', 'guided-replay-contracts.js',
            'mentor-guided-replay.js', 'guided-replay-view.js', 'mentor-guided-replay.css']) {
            assert.doesNotMatch(html, new RegExp(`<(?:script|link)[^>]+${asset.replace('.', '\\.')}`));
            assert.match(registry, new RegExp(asset.replace('.', '\\.')));
        }
    }
});
