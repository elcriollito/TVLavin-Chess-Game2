import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { createEndgameCurriculum } from '../../js/endgame-trainer/endgame-curriculum.js';
import { selectBestEndgameCandidate } from '../../js/endgame-trainer/endgame-candidate-selector.js';
import { createEndgameProgressStore } from '../../js/endgame-trainer/endgame-progress-store.js';
import { DEFAULT_STOCKFISH_WORKER_PATH } from '../../js/endgame-trainer/stockfish-worker-factory.js';
import { ET10C_FIXTURE, createAuthorizedEt10cHarness, createEt10cMemoryStorage } from './et10c-deterministic-curriculum-fixture.js';

const expectedLine = ['c6e6', 'b7b1', 'e6g6', 'b1d1', 'g6g5', 'd1d5', 'c5d5', 'h1h2', 'd5e5', 'h2h3', 'g5g2', 'h3g2'];
const lesson = createEndgameCurriculum().getLesson('rook-essentials', 'rook-active-defense');
const terminalEntry = (id, result) => ({ id, category: 'KRPvKR', pathId: lesson.pathId, lessonId: lesson.id, trainingRole: lesson.trainingRole,
    completionRule: lesson.completionRule, result, moveCount: 12, hintsUsed: 0, undosUsed: 0 });

test('ET.10C fixture is legal KRPvKR and its fixed branch is legal through terminal', () => {
    let rules = ChessRulesFacade.fromFen(ET10C_FIXTURE.fen);
    assert.equal(rules.pieces().length, 5);
    assert.deepEqual(rules.pieces().map(piece => piece.type).sort(), ['k', 'k', 'p', 'r', 'r']);
    for (const move of expectedLine) rules.move(move);
    assert.equal(rules.isGameOver(), true); assert.equal(rules.isInsufficientMaterial(), true);
});

test('ET.10C authorized harness completes defend-moves exactly once with real runtime and controller', async t => {
    const harness = createAuthorizedEt10cHarness(); t.after(() => harness.dispose());
    const result = await harness.run(), state = result.state, progress = result.progress, current = progress.curriculum.lessons[lesson.id];
    assert.equal(state.status, 'completed'); assert.equal(state.result.gameResult, 'insufficient-material'); assert.equal(state.moveHistory.length, 12);
    assert.deepEqual(state.moveHistory.map(item => item.move.lan), expectedLine);
    assert.equal(current.sessionsCompleted, 1); assert.equal(current.completed, true); assert.equal(current.completedAt, 1700000000000);
    assert.equal(progress.totals.sessionsCompleted - result.before.totals.sessionsCompleted, 1);
    assert.equal(progress.recentSessions.length - result.before.recentSessions.length, 1);
    harness.progressStore.recordCurriculumTerminal(terminalEntry(state.sessionId, 'draw'));
    harness.progressStore.recordSessionCompleted({ ...terminalEntry(state.sessionId, 'draw'), completed: true, pieceCount: 5, userColor: 'white' });
    const repeated = harness.progressStore.getSnapshot();
    assert.equal(repeated.curriculum.lessons[lesson.id].sessionsCompleted, 1); assert.equal(repeated.recentSessions.length, 1);
});

test('ET.10C fixture qualifies reproducibly in three isolated instances', async () => {
    const evidence = [];
    for (let run = 1; run <= 3; run++) {
        const harness = createAuthorizedEt10cHarness();
        try { const result = await harness.run(); evidence.push({ fen: result.state.initialFen, line: result.state.moveHistory.map(item => item.move.lan), result: result.state.result.gameResult, moveCount: result.state.moveHistory.length, completed: result.progress.curriculum.lessons[lesson.id].completed }); }
        finally { harness.dispose(); }
    }
    assert.equal(evidence.every(item => item.fen === ET10C_FIXTURE.fen && item.result === 'insufficient-material' && item.moveCount >= 6 && item.completed), true);
    assert.equal(new Set(evidence.map(item => JSON.stringify(item.line))).size, 1);
});

test('defend-moves rejection paths remain unchanged for resignation and abandonment', () => {
    const store = createEndgameProgressStore({ storage: createEt10cMemoryStorage(), now: () => 1 }); store.load();
    store.recordCurriculumTerminal(terminalEntry('resigned', 'resignation')); store.recordCurriculumTerminal(terminalEntry('abandoned', 'abandoned'));
    const state = store.getSnapshot().curriculum.lessons[lesson.id]; assert.equal(state.completed, false); assert.equal(state.sessionsCompleted, 0); assert.equal(state.resignations, 1); assert.equal(state.abandoned, 1);
});

test('fixture progress persists, refreshes cross-tab and remains idempotent after reload', async t => {
    const storage = createEt10cMemoryStorage(), harness = createAuthorizedEt10cHarness({ storage }); t.after(() => harness.dispose());
    await harness.run(); const second = createEndgameProgressStore({ storage, now: () => 1700000000001 }); second.load(); t.after(() => second.dispose());
    const refreshed = second.refreshFromStorage(); assert.equal(refreshed.curriculum.lessons[lesson.id].completed, true); assert.equal(refreshed.recentSessions.length, 1);
    const beforeSecondRefresh = JSON.stringify(second.getSnapshot()); second.refreshFromStorage();
    assert.equal(JSON.stringify(second.getSnapshot()), beforeSecondRefresh);
    assert.equal(second.getSnapshot().curriculum.lessons[lesson.id].sessionsCompleted, 1); assert.equal(second.getSnapshot().recentSessions.length, 1);
});

test('fixture leaves no stale, illegal or rollback state and disposes its isolated engine', async () => {
    const harness = createAuthorizedEt10cHarness(); const result = await harness.run();
    const fens = result.state.moveHistory.map(item => item.fen); assert.equal(new Set(fens).size, fens.length);
    assert.equal(result.state.error, null); assert.equal(result.state.moveHistory.every(item => item.move?.lan), true); assert.equal(harness.engine.searches.length, 6);
    harness.dispose(); assert.equal(harness.engine.disposeCalls, 1); assert.equal(harness.boardLog.destroyed, 1);
});

test('normal procedural selection does not recognize or return the ET.10C fixture', async () => {
    const result = selectBestEndgameCandidate({ categoryId: 'KRPvKR', seed: ET10C_FIXTURE.id, candidateCount: 12, generatorOptions: { template: 'active-defense' } });
    assert.equal(result.ok, true); assert.notEqual(result.selected.fen, ET10C_FIXTURE.fen); assert.equal(result.selected.metadata.fixtureId, undefined);
});

test('public product sources do not import, expose or activate the fixture', async () => {
    const directory = new URL('../../js/endgame-trainer/', import.meta.url), files = (await readdir(directory)).filter(name => name.endsWith('.js'));
    const sources = await Promise.all(files.map(name => readFile(new URL(name, directory), 'utf8'))); sources.push(await readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8'));
    const joined = sources.join('\n');
    assert.doesNotMatch(joined, /et10c-rook-active-defense-v1|et10c-deterministic-curriculum-fixture|fixtureId/);
    assert.doesNotMatch(joined, /[?&]qa=1|localStorage[^\n]*fixture|globalThis[^\n]*fixture/i);
});

test('Vercel upload explicitly excludes both ET.10C fixture files', async () => {
    const ignored = await readFile(new URL('../../.vercelignore', import.meta.url), 'utf8');
    assert.match(ignored, /^tests\/endgame-trainer\/et10c-deterministic-curriculum-fixture\.js$/m);
    assert.match(ignored, /^tests\/endgame-trainer\/et10c-deterministic-curriculum-fixture\.test\.js$/m);
});

test('existing lesson contract and Stockfish Worker path are unchanged', () => {
    assert.deepEqual(lesson.completionRule, { type: 'defend-moves', target: 2, minMoves: 6 });
    assert.deepEqual(lesson.candidatePolicy, { source: 'template', template: 'active-defense' });
    assert.equal(lesson.trainingRole, 'defense'); assert.equal(DEFAULT_STOCKFISH_WORKER_PATH, '../../engine/stockfish-working.js');
});

test('authorized harness exposes only the closed ET.10C fixture definition', () => {
    const harness = createAuthorizedEt10cHarness();
    try { assert.equal(harness.fixture.id, 'et10c-rook-active-defense-v1'); assert.equal(harness.fixture.fen, ET10C_FIXTURE.fen); assert.equal('setFen' in harness, false); }
    finally { harness.dispose(); }
});

test('qualified fixture exceeds the defend-moves six-move boundary', async t => {
    const harness = createAuthorizedEt10cHarness(); t.after(() => harness.dispose()); const result = await harness.run();
    assert.equal(result.state.moveHistory.length, ET10C_FIXTURE.expectedMoveCount); assert.ok(result.state.moveHistory.length >= lesson.completionRule.minMoves);
});

test('qualified terminal is neither resignation nor abandonment', async t => {
    const harness = createAuthorizedEt10cHarness(); t.after(() => harness.dispose()); const result = await harness.run();
    assert.equal(result.state.status, 'completed'); assert.doesNotMatch(result.state.result.gameResult, /resignation|abandoned/);
});

test('qualification increments overall and curriculum completion by one', async t => {
    const harness = createAuthorizedEt10cHarness(); t.after(() => harness.dispose()); const result = await harness.run();
    assert.equal(result.progress.totals.sessionsCompleted - result.before.totals.sessionsCompleted, 1);
    assert.equal(result.progress.curriculum.lessons[lesson.id].sessionsCompleted, 1);
});

test('qualification defines completedAt and one completed curriculum lesson', async t => {
    const harness = createAuthorizedEt10cHarness(); t.after(() => harness.dispose()); const result = await harness.run();
    assert.equal(result.progress.curriculum.lessons[lesson.id].completedAt, 1700000000000);
    assert.equal(harness.curriculum.getProgress(result.progress).lessonsCompleted - harness.curriculum.getProgress(result.before).lessonsCompleted, 1);
});

test('qualification records exactly one recent terminal', async t => {
    const harness = createAuthorizedEt10cHarness(); t.after(() => harness.dispose()); const result = await harness.run();
    assert.equal(result.progress.recentSessions.length - result.before.recentSessions.length, 1);
    assert.equal(new Set(result.progress.recentSessions.map(item => item.id)).size, result.progress.recentSessions.length);
});

test('deterministic adapter consumes exactly the declared closed response set', async t => {
    const harness = createAuthorizedEt10cHarness(); t.after(() => harness.dispose()); await harness.run();
    assert.deepEqual(harness.engine.searches.map(item => item.bestMove), ET10C_FIXTURE.engineMoves);
});
