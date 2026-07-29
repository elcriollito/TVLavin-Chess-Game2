import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = [
    'js/mentor/critical-moment-contracts.js',
    'js/mentor/critical-moment-signals.js',
    'js/mentor/critical-moment-scoring.js',
    'js/mentor/critical-moment-selector.js'
];
const sources = files.map(file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
    const window = {};
    const context = { window, globalThis: window, Object, WeakSet, Set, Map, Date, Math, JSON };
    sources.forEach(source => vm.runInNewContext(source, context));
    return window;
}
const evaluation = (cp = 0, mate = null) => ({ type: mate === null ? 'cp' : 'mate',
    cp: mate === null ? cp : null, mate, perspective: 'white' });
function position(ply, cp, options = {}) {
    const mover = options.mover || (ply % 2 ? 'white' : 'black');
    return {
        schemaVersion: '1.0.0', runId: 'run:test', positionId: `position:${ply}`, ply,
        status: 'completed', evaluation: evaluation(cp, options.mate ?? null),
        bestMove: { uci: options.bestMove || 'e2e4' }, principalVariation: [],
        playedMove: ply ? { uci: options.playedMove || 'd2d4', san: options.san || 'd4' } : null,
        mover: ply ? mover : null, sideToMove: mover === 'white' ? 'black' : 'white',
        phase: options.phase || 'middlegame',
        material: { white: 39, black: 39, whiteMinusBlack: options.material ?? 0,
            nonPawn: options.nonPawn ?? 62, queens: options.queens ?? 2 },
        terminal: options.terminal === true
    };
}
function envelope(positions, options = {}) {
    return {
        schemaVersion: '1.0.0', resultId: 'analysis-result:run:test', runId: 'run:test',
        requestId: 'request:test', status: options.status || 'complete',
        summary: { positionsRequested: positions.length, positionsCompleted: positions.length,
            partial: options.status === 'partial', hasErrors: false },
        positions, capabilities: { criticalMoments: false }
    };
}
const request = limit => ({ requestId: 'request:test', review: { criticalMomentLimit: limit } });

test('publishes immutable versioned contracts, categories, limits and bounded diagnostics', () => {
    const w = load();
    assert.equal(w.CaissaCriticalMoments.schemaVersion, '1.0.0');
    assert.deepEqual(plain(w.CaissaCriticalMoments.categories),
        ['opening', 'tactical', 'strategic', 'transition', 'endgame', 'decision', 'terminal']);
    assert.deepEqual(plain(w.CaissaCriticalMomentContracts.limits), [1, 3, 5]);
    assert.ok(Object.isFrozen(w.CaissaCriticalMoments.categories));
    assert.equal(w.CaissaCriticalMoments.inspect().maxSelections, 8);
});

test('validates completed and partial technical envelopes and rejects failed or malformed results', () => {
    const w = load(); const valid = envelope([position(0, 0), position(1, -150)]);
    assert.equal(w.CaissaCriticalMoments.validateAnalysisResult(valid).ok, true);
    assert.equal(w.CaissaCriticalMoments.validateAnalysisResult(
        envelope(valid.positions, { status: 'partial' })).ok, true);
    assert.equal(w.CaissaCriticalMoments.validateAnalysisResult(
        { ...valid, status: 'failed' }).reasonCode, 'INVALID_ANALYSIS_RESULT');
    assert.equal(w.CaissaCriticalMoments.validateAnalysisResult(
        { ...valid, positions: [...valid.positions].reverse() }).reasonCode, 'INVALID_ANALYSIS_RESULT');
});

test('evaluation delta is mover-relative for White and Black without board-orientation dependence', () => {
    const w = load();
    const white = w.CaissaCriticalMomentSignals.extract(position(0, 100),
        position(1, -100, { mover: 'white' }));
    assert.equal(white.evaluationDeltaCp, -200);
    assert.equal(white.moverRelativeChangeCp, -200);
    assert.equal(white.playerLossCp, 200);
    const black = w.CaissaCriticalMomentSignals.extract(position(1, -100),
        position(2, 150, { mover: 'black' }));
    assert.equal(black.evaluationDeltaCp, 250);
    assert.equal(black.moverRelativeChangeCp, -250);
    assert.equal(black.playerLossCp, 250);
});

test('mate introduced, escaped and changed-side signals remain separate from centipawns', () => {
    const w = load();
    assert.equal(w.CaissaCriticalMomentSignals.extract(position(0, 0),
        position(1, null, { mate: 3 })).mateIntroduced, true);
    assert.equal(w.CaissaCriticalMomentSignals.extract(position(0, null, { mate: 3 }),
        position(1, 0)).mateEscaped, true);
    assert.equal(w.CaissaCriticalMomentSignals.extract(position(0, null, { mate: 3 }),
        position(1, null, { mate: -2 })).mateChangedSide, true);
});

test('best-move mismatch alone is not filler but becomes evidence alongside consequence', () => {
    const w = load(); const quiet = envelope([
        position(0, 0, { bestMove: 'e2e4' }),
        position(1, -20, { playedMove: 'd2d4' })
    ]);
    const candidates = w.CaissaCriticalMoments.generateCandidates(quiet).value;
    assert.equal(candidates[0].signals.bestMoveMismatch, true);
    assert.equal(candidates[0].eligible, false);
    assert.equal(w.CaissaCriticalMoments.select(quiet, request(3)).value.selectedCount, 0);
});

test('categories use evidence for opening, tactical, strategic, transition, endgame and terminal', () => {
    const w = load();
    const cases = [
        ['opening', position(0, 0, { phase: 'opening' }), position(1, -80, { phase: 'opening' })],
        ['tactical', position(0, 100), position(1, -150)],
        ['strategic', position(0, 0), position(1, 80, { playedMove: 'e2e4', bestMove: 'e2e4' })],
        ['decision', position(0, 0), position(1, 60)],
        ['transition', position(0, 0, { phase: 'opening' }), position(1, 10, { phase: 'middlegame' })],
        ['endgame', position(0, 0, { phase: 'endgame' }), position(1, -80, { phase: 'endgame' })],
        ['terminal', position(0, 0), position(1, 0, { terminal: true })]
    ];
    for (const [expected, before, after] of cases) {
        const candidate = w.CaissaCriticalMoments.generateCandidates(envelope([before, after])).value[0];
        assert.equal(candidate.category, expected);
    }
});

test('material change and phase transition are measurable scoring components', () => {
    const w = load();
    const result = envelope([position(0, 0, { phase: 'middlegame', material: 0 }),
        position(1, 20, { phase: 'endgame', material: -5 })]);
    const candidate = w.CaissaCriticalMoments.generateCandidates(result).value[0];
    assert.equal(candidate.signals.materialDelta, -5);
    assert.equal(candidate.signals.phaseTransition, true);
    assert.ok(candidate.importance.components.material > 0);
    assert.ok(candidate.importance.components.phaseTransition > 0);
});

test('scoring is bounded, transparent, deterministic and uses stable tie breaking', () => {
    const w = load(); const result = envelope([
        position(0, 0), position(1, -200), position(2, 200, { mover: 'black' }),
        position(5, -200, { mover: 'white' })
    ]);
    const first = w.CaissaCriticalMoments.generateCandidates(result);
    const second = w.CaissaCriticalMoments.generateCandidates(result);
    assert.deepEqual(plain(first.value), plain(second.value));
    first.value.forEach(candidate => {
        assert.ok(candidate.importance.normalizedScore >= 0);
        assert.ok(candidate.importance.normalizedScore <= 100);
        assert.ok(candidate.confidence >= 0 && candidate.confidence <= 1);
    });
    assert.deepEqual(plain(w.CaissaCriticalMoments.rankCandidates(first.value).value),
        plain(w.CaissaCriticalMoments.rankCandidates(second.value).value));
});

test('adjacent tactical, recapture and mate sequences deduplicate while distant moments remain', () => {
    const w = load(); const result = envelope([
        position(0, 0), position(1, -250), position(2, 100, { mover: 'black' }),
        position(3, -300), position(7, 200, { mover: 'white' })
    ]);
    const generated = w.CaissaCriticalMoments.generateCandidates(result).value;
    const deduped = w.CaissaCriticalMoments.deduplicate(generated).value;
    assert.ok(deduped.suppressed.length >= 1);
    assert.ok(deduped.candidates.some(candidate => candidate.ply === 7));
    assert.ok(deduped.candidates.length < generated.filter(candidate => candidate.eligible).length);
});

test('terminal event does not duplicate a nearby tactical or mate sequence', () => {
    const w = load(); const result = envelope([
        position(0, 0), position(1, -300),
        position(2, null, { mover: 'black', mate: 1 }),
        position(3, null, { mover: 'white', mate: 1, terminal: true })
    ]);
    const selected = w.CaissaCriticalMoments.select(result, request(5)).value;
    assert.equal(selected.selectedCount, 1);
});

test('limits 1, 3 and 5 are exact upper bounds and selected output returns to chronology', () => {
    for (const limit of [1, 3, 5]) {
        const w = load(); const positions = [position(0, 0)];
        for (let ply = 1; ply <= 12; ply += 3)
            positions.push(position(ply, ply % 2 ? -200 - ply * 10 : 200 + ply * 10,
                { mover: ply % 2 ? 'white' : 'black' }));
        const selected = w.CaissaCriticalMoments.select(envelope(positions), request(limit)).value;
        assert.ok(selected.selectedCount <= limit);
        assert.deepEqual(plain(selected.selectedMoments.map(moment => moment.ply)),
            plain([...selected.selectedMoments].sort((a, b) => a.ply - b.ply).map(moment => moment.ply)));
    }
});

test('weak evidence returns fewer than requested and supports zero valid moments', () => {
    const w = load(); const result = envelope([
        position(0, 0), position(1, 10), position(2, -5, { mover: 'black' })
    ]);
    const selection = w.CaissaCriticalMoments.select(result, request(5)).value;
    assert.equal(selection.selectedCount, 0);
    assert.equal(selection.totalCandidates, 2);
});

test('request/result correlation and unsupported limits fail closed', () => {
    const w = load(); const result = envelope([position(0, 0), position(1, -200)]);
    assert.equal(w.CaissaCriticalMoments.select(result, {
        requestId: 'request:other', review: { criticalMomentLimit: 3 }
    }).reasonCode, 'REQUEST_RESULT_MISMATCH');
    assert.equal(w.CaissaCriticalMoments.select(result, {
        requestId: 'request:test', review: { criticalMomentLimit: 2 }
    }).reasonCode, 'INVALID_CRITICAL_MOMENT_LIMIT');
});

test('partial result is honestly marked incomplete and insufficient positions return no moments', () => {
    const w = load();
    const partial = w.CaissaCriticalMoments.select(envelope(
        [position(0, 0), position(1, -200)], { status: 'partial' }), request(3)).value;
    assert.equal(partial.incomplete, true);
    const insufficient = w.CaissaCriticalMoments.select(
        envelope([position(0, 0)], { status: 'partial' }), request(3)).value;
    assert.equal(insufficient.selectedCount, 0);
    assert.equal(insufficient.incomplete, true);
});

test('selection and snapshots are immutable, detached, technical and capability-limited', () => {
    const w = load(); const selector = w.CaissaCriticalMoments.createSelector({ now: () => 42 });
    const selected = selector.select(envelope([position(0, 0), position(1, -200)]), request(3)).value;
    assert.ok(Object.isFrozen(selected));
    assert.ok(Object.isFrozen(selected.selectedMoments));
    assert.equal(selected.createdAt, 42);
    assert.deepEqual(plain(selected.capabilities), {
        mentorExplanation: false, guidedReplay: false, knowledgeMapping: false, recommendations: false
    });
    assert.doesNotMatch(JSON.stringify(selected), /strength|weakness|knowledgeUnit|mentorText|moveGrade/i);
    const snapshot = selector.getSnapshot(selected.selectionId);
    assert.notEqual(snapshot, selected);
    assert.deepEqual(plain(snapshot), plain(selected));
});

test('required deterministic technical fixtures declare and satisfy selection expectations', () => {
    const fixtures = [
        ['quiet opening with no moment', [position(0, 0, { phase: 'opening' }),
            position(1, 20, { phase: 'opening' })], [0, 0], null, [], 3],
        ['opening tactical error', [position(0, 50, { phase: 'opening' }),
            position(1, -180, { phase: 'opening' })], [1, 1], 'tactical', [1], 3],
        ['queen loss', [position(0, 100, { material: 0 }),
            position(1, -500, { material: -9 })], [1, 1], 'tactical', [1], 3],
        ['exchange sacrifice with compensation', [position(0, 20, { material: 0 }),
            position(1, 80, { material: -2, playedMove: 'e2e4' })], [0, 1], null, [], 3],
        ['missed mate', [position(0, null, { mate: 3 }),
            position(1, 0)], [1, 1], 'tactical', [1], 3],
        ['escaped mate', [position(0, null, { mate: -2 }),
            position(1, 0)], [1, 1], 'tactical', [1], 3],
        ['strategic evaluation shift without material loss', [position(0, 0),
            position(1, 80, { playedMove: 'e2e4', bestMove: 'e2e4' })], [1, 1], 'strategic', [1], 3],
        ['queen exchange leading to endgame', [position(0, 20, { phase: 'middlegame', material: 0 }),
            position(1, 10, { phase: 'endgame', material: 0 })], [1, 1], 'transition', [1], 3],
        ['promotion race', [position(0, 0, { phase: 'endgame' }),
            position(1, null, { phase: 'endgame', mate: 4 })], [1, 1], 'tactical', [1], 3],
        ['checkmate sequence', [position(0, null, { mate: 1 }),
            position(1, null, { mate: 1, terminal: true })], [1, 1], 'terminal', [1], 3],
        ['resignation after decisive swing', [position(0, 50),
            position(1, -350, { terminal: true })], [1, 1], 'terminal', [1], 3],
        ['draw by repetition', [position(0, 0),
            position(1, 0, { terminal: true })], [1, 1], 'terminal', [1], 3],
        ['short game with one moment', [position(0, 0), position(1, -200)], [1, 1], 'tactical', [1], 1],
        ['partial analysis', [position(0, 0), position(1, -200)], [1, 1], 'tactical', [1], 3, 'partial'],
        ['Black-side error', [position(0, -100),
            position(1, 200, { mover: 'black' })], [1, 1], 'tactical', [1], 3],
        ['custom initial FEN', [position(0, 0, { phase: 'endgame' }),
            position(1, 80, { phase: 'endgame' })], [1, 1], 'endgame', [1], 3]
    ];
    for (const [name, positions, range, topCategory, selectedPlies, limit, status = 'complete'] of fixtures) {
        const w = load(); const result = envelope(positions, { status });
        if (name === 'custom initial FEN') result.source = { initialPositionRef: 'custom-position:fixture' };
        const selected = w.CaissaCriticalMoments.select(result, request(limit)).value;
        assert.ok(selected.selectedCount >= range[0] && selected.selectedCount <= range[1], name);
        assert.deepEqual(plain(selected.selectedMoments.map(moment => moment.ply)), selectedPlies, name);
        if (topCategory) assert.equal(selected.selectedMoments[0]?.category, topCategory, name);
        assert.ok(selected.suppressedCount >= positions.length - 1 - selected.selectedCount, name);
        assert.equal(selected.requestedLimit, limit, name);
    }
    const w = load();
    const long = envelope([position(0, 0), position(1, -200), position(2, 100, { mover: 'black' }),
        position(3, -250), position(4, 150, { mover: 'black' }),
        position(5, -300, { terminal: true })]);
    const selected = w.CaissaCriticalMoments.select(long, request(5)).value;
    assert.deepEqual(plain(selected.selectedMoments.map(moment => moment.ply)), [2, 5],
        'long game with many adjacent candidates');
    assert.ok(selected.suppressedCount >= 3);
});

test('static selector boundary has no engine, Worker, DOM, storage, Academy, Memory or Mastery ownership', () => {
    const text = sources.join('\n');
    assert.doesNotMatch(text, /EngineAdapter|EngineRegistry|new\s+Worker|document\.|innerHTML|fetch\s*\(/);
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB|TrainingMemory|Mastery|CaissaAcademy/);
    assert.doesNotMatch(text, /blunder|mistake|inaccuracy|recommendationText/i);
    assert.equal(load().CaissaCriticalMoments.inspect().engineRequests, 0);
});
