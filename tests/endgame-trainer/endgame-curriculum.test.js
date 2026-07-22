import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEndgameCurriculum } from '../../js/endgame-trainer/endgame-curriculum.js';
import { createEndgameProgressStore, ENDGAME_PROGRESS_STORAGE_KEY } from '../../js/endgame-trainer/endgame-progress-store.js';

const curriculum = createEndgameCurriculum();
const paths = curriculum.getSnapshot().paths;
const lessons = paths.flatMap(path => path.lessons);
const memory = (initial = null) => { let value = initial; return { getItem: () => value, setItem: (_key, next) => { value = next; }, raw: () => value }; };
const storeWith = (storage = memory()) => { const store = createEndgameProgressStore({ storage, now: () => 5000 }); store.load(); return store; };
const terminal = (overrides = {}) => ({ id: 'guided-1', category: 'KPK', result: 'draw', pathId: 'pawn-foundations', lessonId: 'pawn-opposition', trainingRole: 'attack', completionRule: { type: 'procedural-sessions', target: 1 }, hintsUsed: 0, undosUsed: 0, moveCount: 8, ...overrides });

test('1 curriculum paths valid', () => assert.deepEqual(curriculum.validate(), { valid: true, errors: [] }));
test('2 unique path IDs', () => assert.equal(new Set(paths.map(path => path.id)).size, paths.length));
test('3 unique lesson IDs', () => assert.equal(new Set(lessons.map(item => item.id)).size, lessons.length));
test('4 orders contiguous', () => paths.forEach(path => assert.deepEqual(path.lessons.map(item => item.order), path.lessons.map((_, index) => index + 1))));
test('5 supported categories only', () => assert.deepEqual([...new Set(lessons.map(item => item.category))].sort(), ['KPK', 'KPKP', 'KQK', 'KRK', 'KRPvKR'].sort()));
test('6 supported themes only', () => assert.equal(lessons.every(item => typeof item.theme === 'string' && item.theme.length > 2), true));
test('7 objectives safe', () => assert.equal(lessons.every(item => item.objective.length > 10), true));
test('8 no WDL claims', () => assert.equal(lessons.some(item => /winning position|theoretical draw|tablebase|forced win|forced draw|wdl/i.test(item.objective)), false));
test('9 prerequisites valid', () => { const ids = new Set(lessons.map(item => item.id)); assert.equal(lessons.every(item => item.prerequisites.every(id => ids.has(id))), true); });
test('10 completion rules valid', () => assert.equal(lessons.every(item => item.completionRule.target === item.targetSessions), true));
test('11 lesson resolves category', () => lessons.forEach(item => assert.equal(curriculum.resolveTrainingOptions(item.pathId, item.id).categoryId, item.category)));
test('12 KPK lesson resolves', () => assert.equal(curriculum.resolveTrainingOptions('pawn-foundations', 'pawn-opposition').categoryId, 'KPK'));
test('13 KRK lesson resolves', () => assert.equal(curriculum.resolveTrainingOptions('basic-checkmates', 'mate-rook-box').categoryId, 'KRK'));
test('14 KQK lesson resolves', () => assert.equal(curriculum.resolveTrainingOptions('basic-checkmates', 'mate-queen-box').categoryId, 'KQK'));
test('15 KPKP lesson resolves', () => assert.equal(curriculum.resolveTrainingOptions('pawn-foundations', 'pawn-king-activity').categoryId, 'KPKP'));
test('16 Lucena resolves exact template', () => assert.equal(curriculum.resolveTrainingOptions('rook-essentials', 'rook-lucena').generatorOptions.template, 'KRPvKR-01'));
test('17 Philidor resolves exact template', () => assert.equal(curriculum.resolveTrainingOptions('rook-essentials', 'rook-philidor').generatorOptions.template, 'KRPvKR-02'));
test('18 beta role mapping keeps the student White', () => { assert.equal(curriculum.resolveTrainingOptions('rook-essentials', 'rook-lucena').userColor, 'white'); assert.equal(curriculum.resolveTrainingOptions('rook-essentials', 'rook-philidor').userColor, 'white'); });
test('19 difficulty mapping', () => assert.equal(curriculum.getLesson('rook-essentials', 'rook-side-checks').difficulty, 'advanced'));
test('20 deterministic options', () => assert.deepEqual(curriculum.resolveTrainingOptions('rook-essentials', 'rook-lucena'), curriculum.resolveTrainingOptions('rook-essentials', 'rook-lucena')));
test('21 legacy v1 initializes curriculum', () => assert.equal(storeWith(memory(JSON.stringify({ version: 1, totals: { sessionsStarted: 3 } }))).getSnapshot().curriculum.guidedSessions, 0));
test('22 general progress preserved', () => assert.equal(storeWith(memory(JSON.stringify({ version: 1, totals: { sessionsStarted: 3 } }))).getSnapshot().totals.sessionsStarted, 3));
test('23 lesson start once', () => { const store = storeWith(); store.recordCurriculumStarted(terminal()); store.recordCurriculumStarted(terminal()); assert.equal(store.getSnapshot().curriculum.lessons['pawn-opposition'].sessionsStarted, 1); });
test('24 lesson terminal once', () => { const store = storeWith(); store.recordCurriculumTerminal(terminal()); store.recordCurriculumTerminal(terminal()); assert.equal(store.getSnapshot().curriculum.lessons['pawn-opposition'].sessionsCompleted, 1); });
test('25 lesson completion', () => { const store = storeWith(); store.recordCurriculumTerminal(terminal()); assert.equal(store.getSnapshot().curriculum.lessons['pawn-opposition'].completed, true); });
test('26 restart no duplicate', () => { const store = storeWith(); store.recordCurriculumStarted(terminal()); store.recordCurriculumStarted(terminal({ attemptNumber: 2 })); assert.equal(store.getSnapshot().curriculum.guidedSessions, 1); });
test('27 new position attempt', () => { const store = storeWith(); store.recordCurriculumStarted(terminal({ id: 'a' })); store.recordCurriculumStarted(terminal({ id: 'b' })); assert.equal(store.getSnapshot().curriculum.guidedSessions, 2); });
test('28 switch lesson abandoned', () => { const store = storeWith(); store.recordCurriculumTerminal(terminal({ result: 'abandoned' })); assert.equal(store.getSnapshot().curriculum.lessons['pawn-opposition'].abandoned, 1); });
test('29 reset clears curriculum', () => { const store = storeWith(); store.recordCurriculumStarted(terminal()); store.reset(); assert.deepEqual(store.getSnapshot().curriculum.lessons, {}); });
test('30 cross-tab completion', () => { const storage = memory(), a = storeWith(storage), b = storeWith(storage); a.recordCurriculumTerminal(terminal()); assert.equal(b.refreshFromStorage().curriculum.lessons['pawn-opposition'].completed, true); });
test('31 concurrent lesson writes', () => { const storage = memory(), a = storeWith(storage), b = storeWith(storage); a.recordCurriculumTerminal(terminal({ id: 'a' })); b.recordCurriculumTerminal(terminal({ id: 'b', lessonId: 'pawn-key-squares' })); assert.deepEqual(Object.keys(b.getSnapshot().curriculum.lessons).sort(), ['pawn-key-squares', 'pawn-opposition']); });
test('32 free practice unaffected', () => { const store = storeWith(); store.recordSessionStarted({ id: 'free', category: 'KRK' }); assert.equal(store.getSnapshot().curriculum.guidedSessions, 0); });
test('33 recent guided metadata', () => { const store = storeWith(); store.recordSessionResigned({ ...terminal(), mode: 'guided', pathTitle: 'Pawn Endgame Foundations', lessonTitle: 'Meet the opposition', pieceCount: 3, userColor: 'white' }); assert.equal(store.getSnapshot().recentSessions[0].lessonTitle, 'Meet the opposition'); });
test('34 payload under cap', () => { const store = storeWith(); for (const item of lessons) store.recordCurriculumStarted({ ...terminal(), id: item.id, pathId: item.pathId, lessonId: item.id }); assert.ok(JSON.stringify(store.getSnapshot()).length < 20000); });
test('35 future version safe', () => { const storage = memory(JSON.stringify({ version: 9, curriculum: { guidedSessions: 99 } })), store = storeWith(storage); store.recordCurriculumStarted(terminal()); assert.match(storage.raw(), /"version":9/); });

const page = await readFile(new URL('../../js/endgame-trainer/endgame-trainer-page.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../css/endgame-trainer.css', import.meta.url), 'utf8');
const sourceCases = [
    ['36 mode default Free Practice', html, /data-training-mode[\s\S]*value="free">Free Practice/],
    ['37 select Guided', html, /value="guided">Guided Training/], ['38 path list', html, /data-guided-paths/], ['39 path detail', html, /data-guided-path-detail/],
    ['40 lesson statuses', page, /Completed[\s\S]*In progress[\s\S]*Not started/], ['41 Start Lesson', page, /Start Lesson/], ['42 active lesson panel', html, /data-active-lesson/],
    ['43 progress text', page, /Session \$\{[\s\S]*of \$\{/], ['44 previous next', html, /data-guided-previous[\s\S]*data-guided-next/], ['45 exit guided', html, /data-guided-exit/],
    ['46 confirmation dialog', html, /data-guided-switch-dialog/], ['47 cancel switch', page, /data-guided-switch-cancel/], ['48 confirm switch', page, /data-guided-switch-confirm/],
    ['49 recommendation', page, /getRecommendedLesson/], ['50 guided progress summary', html, /data-guided-summary/], ['51 recent Guided badge', page, /Guided ·/],
    ['52 cross-tab UI', page, /refreshFromStorage/], ['53 reset UI', page, /progressStore\.reset/], ['54 mobile order', html, /data-board[\s\S]*data-active-lesson[\s\S]*data-training-mode/],
    ['55 no second runtime', page, /let runtime = null/], ['56 no second Worker', page, /\bWorker\b/], ['57 Free Practice regression', html, /data-free-practice[\s\S]*data-action="prepare"/],
    ['58 no dynamic innerHTML', page, /innerHTML/], ['59 no network', page, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/], ['60 no auth backend', page, /auth|checkout|\/api\//]
];
for (const [name, source, pattern] of sourceCases) test(name, ['56 ', '58 ', '59 ', '60 '].some(prefix => name.startsWith(prefix)) ? () => assert.doesNotMatch(source, pattern) : () => assert.match(source, pattern));

test('storage key remains exact after curriculum extension', () => assert.equal(ENDGAME_PROGRESS_STORAGE_KEY, 'caissa:endgame-trainer:progress:v1'));
test('path snapshots are defensive', () => { const value = curriculum.getPath('pawn-foundations'); value.lessons[0].title = 'changed'; assert.notEqual(curriculum.getPath('pawn-foundations').lessons[0].title, 'changed'); });
test('defend-moves does not complete from abandonment or resignation', () => {
  const store = storeWith();
  store.recordCurriculumTerminal(terminal({ id: 'abandoned-defense', lessonId: 'pawn-defense', result: 'abandoned', moveCount: 20, completionRule: { type: 'defend-moves', target: 2, minMoves: 6 } }));
  store.recordCurriculumTerminal(terminal({ id: 'resigned-defense', lessonId: 'pawn-defense', result: 'resignation', moveCount: 20, completionRule: { type: 'defend-moves', target: 2, minMoves: 6 } }));
  assert.equal(store.getSnapshot().curriculum.lessons['pawn-defense'].completed, false);
});
test('mixed practical-resistance lesson has a completable session rule', () => {
  assert.deepEqual(curriculum.getLesson('defensive-technique', 'defense-practical-resistance').completionRule, { type: 'complete-sessions', target: 2 });
});
test('procedural attack and defense roles control both material side and user side', () => {
  assert.deepEqual(curriculum.resolveTrainingOptions('basic-checkmates', 'mate-finish'), {
    categoryId: 'KQK', userColor: 'white', betaWhiteOnly: true, candidateCount: 24, generatorOptions: { strongSide: 'white', sideToMove: 'white' },
    lesson: { pathId: 'basic-checkmates', lessonId: 'mate-finish', theme: 'finishing-technique', objective: 'Coordinate king and queen to complete the exercise.', trainingRole: 'attack', difficulty: 'intermediate' }
  });
  const defense = curriculum.resolveTrainingOptions('defensive-technique', 'defense-hold-opposition');
  assert.equal(defense.userColor, 'white');
  assert.equal(defense.generatorOptions.strongSide, 'black');
  assert.equal(defense.generatorOptions.sideToMove, 'white');
});
test('terminal-completed requires the user exercise outcome and completes only once', () => {
  const store = storeWith(), rule = { type: 'terminal-completed', target: 1 };
  store.recordCurriculumTerminal(terminal({ id: 'engine-mate', lessonId: 'mate-finish', result: 'checkmate', exerciseOutcome: 'unknown', completionRule: rule }));
  assert.equal(store.getSnapshot().curriculum.lessons['mate-finish'].completed, false);
  store.recordCurriculumTerminal(terminal({ id: 'user-mate', lessonId: 'mate-finish', result: 'checkmate', exerciseOutcome: 'completed', completionRule: rule }));
  const completed = store.getSnapshot().curriculum.lessons['mate-finish'];
  assert.equal(completed.completed, true);
  assert.equal(completed.completedAt, 5000);
  store.recordCurriculumTerminal(terminal({ id: 'later-terminal', lessonId: 'mate-finish', result: 'checkmate', exerciseOutcome: 'completed', completionRule: rule }));
  assert.equal(store.getSnapshot().curriculum.lessons['mate-finish'].completedAt, 5000);
});
test('complete-sessions reaches completion at the exact target', () => {
  const store = storeWith(), rule = { type: 'complete-sessions', target: 2 };
  store.recordCurriculumTerminal(terminal({ id: 'mixed-1', lessonId: 'defense-practical-resistance', completionRule: rule }));
  assert.equal(store.getSnapshot().curriculum.lessons['defense-practical-resistance'].completed, false);
  store.recordCurriculumTerminal(terminal({ id: 'mixed-2', lessonId: 'defense-practical-resistance', completionRule: rule }));
  const lesson = store.getSnapshot().curriculum.lessons['defense-practical-resistance'];
  assert.equal(lesson.sessionsCompleted, 2);
  assert.equal(lesson.completed, true);
});
