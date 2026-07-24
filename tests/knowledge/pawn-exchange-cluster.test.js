import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOWLEDGE_UNIT_REGISTRY } from '../../knowledge/indexes/manifest.js';
import { buildLibrarySnapshot } from '../../knowledge/snapshots/build-snapshot.js';
import { createLibraryReader } from '../../knowledge/consumer/library-reader.js';
import { verifySnapshotFiles } from '../../knowledge/snapshots/verify-snapshot.js';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';

const PREFIX = 'ku:endgames:pawn-exchanges:';
const cluster = KNOWLEDGE_UNIT_REGISTRY.filter(unit => unit.id.startsWith(PREFIX));
const bySlug = slug => KNOWLEDGE_UNIT_REGISTRY.find(unit => unit.slug === slug);

test('exchange cluster contains four bounded units and eight distinct positions', () => {
    assert.deepEqual(cluster.map(unit => unit.slug), ['pawn-tension', 'exchange-into-passer', 'second-distant-target', 'favorable-king-ending']);
    assert.equal(cluster.flatMap(unit => unit.positions).length, 8);
    assert.equal(new Set(cluster.flatMap(unit => unit.positions).map(position => position.id)).size, 8);
});

test('new units provide complete instruction, mastery, learning objects, and six hint stages', () => {
    for (const unit of cluster) {
        const content = unit.localization.content['en-US'];
        for (const field of ['keyIdeas', 'misconceptions', 'practicalRules', 'decisionProcess', 'reflectionPrompts']) assert.ok(content[field].length >= 2);
        assert.equal(content.coachingPrompts.length, 6);
        assert.equal(unit.education.masteryCriteria.length, 2);
        for (const type of ['demonstrations', 'guidedPractice', 'exercises', 'checksForUnderstanding', 'assessments']) assert.ok(unit.learningObjects[type].length);
    }
});

test('positions have legal FEN, matching turns, legal lines, concepts, and material contrasts', () => {
    for (const unit of cluster) {
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

test('graph distinguishes tension, majority transformation, divided defense, and simplification', () => {
    assert.deepEqual(bySlug('pawn-tension').education.prerequisites, []);
    assert.deepEqual(bySlug('exchange-into-passer').education.prerequisites, ['ku:endgames:pawn-weaknesses:pawn-majority']);
    assert.deepEqual(bySlug('second-distant-target').education.prerequisites, ['ku:endgames:pawn-transformations:outside-passed-pawn']);
    assert.deepEqual(bySlug('favorable-king-ending').education.prerequisites, ['ku:endgames:pawn-foundations:activate-the-king', 'ku:endgames:pawn-foundations:direct-opposition']);
    assert.ok(bySlug('pawn-tension').relationships.some(edge => edge.targetId.endsWith('reserve-tempo')));
    assert.ok(bySlug('exchange-into-passer').relationships.some(edge => edge.type === 'remediation' && edge.targetId.endsWith('rule-of-the-square')));
    assert.ok(bySlug('favorable-king-ending').relationships.filter(edge => edge.type === 'remediation').length >= 3);
});

test('consumer exposes seventeen units, exchange facets, and authored reverse edges', () => {
    const snapshot = buildLibrarySnapshot();
    const verified = verifySnapshotFiles(snapshot.files, snapshot.releaseId);
    assert.equal(verified.valid, true);
    const reader = createLibraryReader(verified.data);
    assert.equal(reader.listUnitsByDomain('endgames').length, 17);
    assert.ok(reader.filterUnits({ theme: 'exchange-decision' }).length >= 3);
    for (const unit of KNOWLEDGE_UNIT_REGISTRY) {
        assert.equal(reader.getUnitById(unit.id).id, unit.id);
        assert.equal(reader.getUnitByScopedSlug(`endgames/${unit.slug}`).id, unit.id);
    }
    assert.ok(reader.getIncoming(bySlug('pawn-tension').id).some(edge => edge.type === 'recommendation'));
});
