import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCoachingContext, classifyStudentMove, createMoveCoaching, createProgressiveHint, createSuccessCoaching, MOVE_CLASSIFICATIONS } from '../../js/endgame-trainer/endgame-coach.js';
import { setIdempotentText } from '../../js/endgame-trainer/endgame-feedback-renderer.js';

const opposition = { ok: true, categoryId: 'KPK', pieceCount: 3, oppositionPattern: 'direct', kingDistance: 2, pawnAdvanceDistance: { white: [3], black: [], minimum: 3 } };
const context = (patch = {}) => ({ theme: 'opposition', lessonId: 'pawn-opposition', objective: 'Keep the opposition.', studentColor: 'white', sideToMove: 'white', positionBefore: 'fen-a', positionAfter: 'fen-b', studentMove: 'e2e3', bestMove: 'e2e3', resultBefore: 'unknown', resultAfter: 'unknown', positionFeatures: structuredClone(opposition), moveFeatures: {}, ...patch });

test('coaching context is normalized, cloned and deeply frozen', () => { const input = context(); const value = normalizeCoachingContext(input); input.positionFeatures.oppositionPattern = 'none'; assert.equal(value.positionFeatures.oppositionPattern, 'direct'); assert.equal(Object.isFrozen(value.positionFeatures), true); });
test('all required classifications are frozen into the public contract', () => assert.deepEqual(MOVE_CLASSIFICATIONS, ['BEST', 'GOOD', 'INACCURACY', 'MISTAKE', 'BLUNDER', 'ONLY_MOVE', 'SUCCESS']));
test('Win to Win is GOOD when the move is an acceptable alternative', () => assert.equal(classifyStudentMove(context({ studentMove: 'e2e4', resultBefore: 'win', resultAfter: 'win' })), 'GOOD'));
test('Win to Draw is a MISTAKE', () => assert.equal(classifyStudentMove(context({ resultBefore: 'win', resultAfter: 'draw' })), 'MISTAKE'));
test('Win to Loss is a BLUNDER', () => assert.equal(classifyStudentMove(context({ resultBefore: 'win', resultAfter: 'loss' })), 'BLUNDER'));
test('Draw to Draw is GOOD', () => assert.equal(classifyStudentMove(context({ studentMove: 'e2e4', resultBefore: 'draw', resultAfter: 'draw' })), 'GOOD'));
test('Draw to Loss is a BLUNDER', () => assert.equal(classifyStudentMove(context({ resultBefore: 'draw', resultAfter: 'loss' })), 'BLUNDER'));
test('verified unique solution is ONLY_MOVE', () => assert.equal(classifyStudentMove(context({ onlyMoveVerified: true })), 'ONLY_MOVE'));
test('already-lost centipawn noise is never labeled BLUNDER', () => assert.equal(classifyStudentMove(context({ studentMove: 'e2e4', resultBefore: 'loss', resultAfter: 'loss', evaluationBefore: { type: 'cp', value: -400 }, evaluationAfter: { type: 'cp', value: -900 } })), 'INACCURACY'));
test('verified opposition success explains opposition', () => { const value = createMoveCoaching(context()); assert.equal(value.themeVerified, true); assert.match(value.message, /opposition/i); });
test('verified opposition correction explains the lost concept', () => { const value = createMoveCoaching(context({ studentMove: 'e2e4', bestMove: 'e2e3', moveFeatures: { preservesTechnique: false } })); assert.equal(value.classification, 'INACCURACY'); assert.match(value.message, /gives up the opposition/i); });
test('critical result change overrides generic centipawn language', () => { const value = createMoveCoaching(context({ resultBefore: 'win', resultAfter: 'draw' })); assert.match(value.message, /winning to drawn/i); assert.doesNotMatch(value.message, /centipawn|\+\d/); });
test('unsupported geometry falls back without a false theme claim', () => { const value = createMoveCoaching(context({ positionFeatures: { oppositionPattern: 'none' } })); assert.equal(value.themeVerified, false); assert.doesNotMatch(value.message, /preserved the opposition/i); });
test('hints progress principle, focus, direction, then move', () => { const values = [1, 2, 3, 4].map(level => createProgressiveHint(context(), level)); assert.match(values[0].message, /^Principle:/); assert.match(values[1].message, /^Focus:/); assert.match(values[2].message, /^Direction:/); assert.equal(values[3].suggestedMove, 'e2e3'); });
test('success summary includes lesson and principle', () => { const value = createSuccessCoaching(context()); assert.equal(value.classification, 'SUCCESS'); assert.match(value.message, /^Solved: Opposition/); assert.match(value.message, /Principle:/); });
test('same context produces deterministic byte-identical coaching', () => assert.deepEqual(createMoveCoaching(context()), createMoveCoaching(context())));
test('identical feedback causes no duplicate DOM write', () => { let writes = 0, stored = ''; const node = { get textContent() { return stored; }, set textContent(value) { writes += 1; stored = value; } }; assert.equal(setIdempotentText(node, 'Good move.'), true); assert.equal(setIdempotentText(node, 'Good move.'), false); assert.equal(writes, 1); });
