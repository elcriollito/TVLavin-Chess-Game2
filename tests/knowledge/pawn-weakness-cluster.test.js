import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOWLEDGE_UNIT_REGISTRY } from '../../knowledge/indexes/manifest.js';
import { buildLibrarySnapshot } from '../../knowledge/snapshots/build-snapshot.js';
import { createLibraryReader } from '../../knowledge/consumer/library-reader.js';
import { verifySnapshotFiles } from '../../knowledge/snapshots/verify-snapshot.js';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';

const PREFIX = 'ku:endgames:pawn-weaknesses:';
const cluster = KNOWLEDGE_UNIT_REGISTRY.filter(unit => unit.id.startsWith(PREFIX));
const bySlug = slug => KNOWLEDGE_UNIT_REGISTRY.find(unit => unit.slug === slug);

test('weakness cluster contains four distinct Model A units and eight positions', () => {
    assert.deepEqual(cluster.map(unit => unit.slug), ['pawn-majority', 'fix-pawn-weakness', 'isolated-pawn', 'backward-pawn']);
    assert.equal(cluster.flatMap(unit => unit.positions).length, 8);
    assert.equal(new Set(cluster.flatMap(unit => unit.positions).map(position => position.id)).size, 8);
});

test('each new unit has complete instruction, measurable mastery, and six deterministic hint stages', () => {
    for (const unit of cluster) {
        const instruction = unit.localization.content['en-US'];
        for (const field of ['keyIdeas', 'misconceptions', 'practicalRules', 'decisionProcess', 'reflectionPrompts']) assert.ok(instruction[field].length >= 2);
        assert.equal(instruction.coachingPrompts.length, 6);
        assert.deepEqual(unit.integrations.coaching.hintOrder, ['observation', 'classification', 'candidate-identification', 'calculation-direction', 'decision-process', 'reflection']);
        assert.ok(unit.education.masteryCriteria.length >= 2);
        for (const type of ['demonstrations', 'guidedPractice', 'exercises', 'checksForUnderstanding', 'assessments']) assert.ok(unit.learningObjects[type].length);
    }
});

test('new positions are materially distinct, concept-bearing, and legally reproducible', () => {
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

test('graph keeps isolated and backward definitions separate with minimal prerequisites', () => {
    assert.deepEqual(bySlug('pawn-majority').education.prerequisites, ['ku:endgames:pawn-foundations:rule-of-the-square']);
    assert.deepEqual(bySlug('fix-pawn-weakness').education.prerequisites, ['ku:endgames:pawn-foundations:activate-the-king']);
    for (const slug of ['isolated-pawn', 'backward-pawn']) assert.deepEqual(bySlug(slug).education.prerequisites, [`${PREFIX}fix-pawn-weakness`]);
    assert.ok(bySlug('isolated-pawn').relationships.some(edge => edge.type === 'contrast' && edge.targetId === `${PREFIX}backward-pawn`));
    assert.ok(bySlug('backward-pawn').relationships.some(edge => edge.type === 'contrast' && edge.targetId === `${PREFIX}isolated-pawn`));
    assert.ok(bySlug('pawn-majority').relationships.some(edge => edge.targetId.includes('pawn-transformations')));
    assert.ok(bySlug('fix-pawn-weakness').relationships.some(edge => edge.targetId.includes('pawn-foundations')));
});

test('consumer exposes thirteen units, weakness facets, and authored reverse edges', () => {
    const snapshot = buildLibrarySnapshot();
    const verified = verifySnapshotFiles(snapshot.files, snapshot.releaseId);
    assert.equal(verified.valid, true);
    const reader = createLibraryReader(verified.data);
    assert.equal(reader.listUnitsByDomain('endgames').length, 13);
    assert.equal(reader.filterUnits({ theme: 'isolated-pawn' }).length, 1);
    assert.equal(reader.filterUnits({ theme: 'backward-pawn' }).length, 1);
    for (const unit of KNOWLEDGE_UNIT_REGISTRY) {
        assert.equal(reader.getUnitById(unit.id).id, unit.id);
        assert.equal(reader.getUnitByScopedSlug(`endgames/${unit.slug}`).id, unit.id);
    }
    assert.ok(reader.getIncoming(bySlug('fix-pawn-weakness').id).some(edge => edge.type === 'recommendation'));
});
