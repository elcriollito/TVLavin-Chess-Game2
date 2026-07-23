import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOWLEDGE_UNIT_REGISTRY } from '../../knowledge/indexes/manifest.js';
import { buildLibrarySnapshot } from '../../knowledge/snapshots/build-snapshot.js';
import { createLibraryReader } from '../../knowledge/consumer/library-reader.js';
import { verifySnapshotFiles } from '../../knowledge/snapshots/verify-snapshot.js';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';

const PREFIX = 'ku:endgames:pawn-transformations:';
const cluster = KNOWLEDGE_UNIT_REGISTRY.filter(unit => unit.id.startsWith(PREFIX));
const bySlug = slug => KNOWLEDGE_UNIT_REGISTRY.find(unit => unit.slug === slug);

test('pawn transformation cluster contains exactly the four bounded concepts', () => {
    assert.deepEqual(cluster.map(unit => unit.slug), [
        'reserve-tempo', 'protected-passed-pawn', 'outside-passed-pawn', 'pawn-breakthrough'
    ]);
    assert.equal(cluster.flatMap(unit => unit.positions).length, 8);
    assert.equal(new Set(cluster.flatMap(unit => unit.positions).map(position => position.id)).size, 8);
});

test('new units provide complete instruction, observable mastery, and six stable hint stages', () => {
    for (const unit of cluster) {
        const instruction = unit.localization.content['en-US'];
        for (const field of ['keyIdeas', 'practicalRules', 'decisionProcess', 'misconceptions', 'reflectionPrompts']) {
            assert.ok(instruction[field].length >= 2, `${unit.slug}:${field}`);
        }
        assert.equal(instruction.coachingPrompts.length, 6);
        assert.deepEqual(unit.integrations.coaching.hintOrder, [
            'observation', 'structural-recognition', 'candidate-identification',
            'calculation-direction', 'decision-process', 'reflection'
        ]);
        assert.ok(unit.education.masteryCriteria.length >= 2);
        assert.ok(unit.education.masteryCriteria.every(value => /\b(?:three|four|five)\b/i.test(value)));
        for (const type of ['demonstrations', 'guidedPractice', 'exercises', 'checksForUnderstanding', 'assessments']) {
            assert.ok(unit.learningObjects[type].length >= 1, `${unit.slug}:${type}`);
        }
    }
});

test('instructional positions are legal, concept-bearing, and materially distinct', () => {
    for (const unit of cluster) {
        assert.equal(unit.positions.length, 2);
        assert.notEqual(unit.positions[0].fen, unit.positions[1].fen);
        assert.notEqual(unit.positions[0].role, unit.positions[1].role);
        for (const position of unit.positions) {
            assert.ok(position.expectedConcepts.length);
            assert.equal(ChessRulesFacade.validateFen(position.fen).valid, true);
            assert.equal(ChessRulesFacade.fromFen(position.fen).sideToMove(), position.sideToMove);
            for (const idea of position.principalIdeas ?? []) {
                const game = ChessRulesFacade.fromFen(position.fen);
                for (const move of idea.moves) assert.ok(game.move(move));
            }
        }
    }
});

test('graph distinguishes siblings, dependencies, forward recommendations, and remediation', () => {
    assert.deepEqual(bySlug('reserve-tempo').education.prerequisites, [
        'ku:endgames:pawn-foundations:direct-opposition'
    ]);
    assert.deepEqual(bySlug('protected-passed-pawn').education.prerequisites, [
        'ku:endgames:pawn-foundations:activate-the-king'
    ]);
    assert.deepEqual(bySlug('outside-passed-pawn').education.prerequisites, [
        'ku:endgames:pawn-foundations:rule-of-the-square'
    ]);
    assert.deepEqual(bySlug('pawn-breakthrough').education.prerequisites, [
        `${PREFIX}protected-passed-pawn`, `${PREFIX}outside-passed-pawn`
    ]);
    assert.ok(bySlug('protected-passed-pawn').relationships.some(edge =>
        edge.type === 'contrast' && edge.targetId === `${PREFIX}outside-passed-pawn`));
    assert.ok(bySlug('outside-passed-pawn').relationships.some(edge =>
        edge.type === 'remediation' && edge.targetId === 'ku:endgames:pawn-foundations:rule-of-the-square'));
    assert.ok(bySlug('direct-opposition').relationships.some(edge =>
        edge.type === 'recommendation' && edge.targetId === `${PREFIX}reserve-tempo`));
});

test('consumer exposes all nine units and transformation facets in both graph directions', () => {
    const snapshot = buildLibrarySnapshot();
    const verified = verifySnapshotFiles(snapshot.files, snapshot.releaseId);
    assert.equal(verified.valid, true);
    const reader = createLibraryReader(verified.data);
    assert.equal(reader.listUnitsByDomain('endgames').length, 9);
    assert.ok(reader.filterUnits({ theme: 'passed-pawns' }).length >= 3);
    assert.ok(reader.filterUnits({ skill: 'calculation' }).length >= 4);
    for (const unit of KNOWLEDGE_UNIT_REGISTRY) {
        assert.equal(reader.getUnitById(unit.id).id, unit.id);
        assert.equal(reader.getUnitByScopedSlug(`endgames/${unit.slug}`).id, unit.id);
    }
    const breakthrough = bySlug('pawn-breakthrough').id;
    assert.equal(reader.getDirectPrerequisites(breakthrough).length, 2);
    assert.ok(reader.getIncoming(breakthrough).some(edge => edge.type === 'recommendation'));
});
