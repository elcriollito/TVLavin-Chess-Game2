import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOWLEDGE_UNIT_REGISTRY } from '../../knowledge/indexes/manifest.js';
import { AUTHORING_TAXONOMY, createDraftKnowledgeUnitScaffold } from '../../knowledge/authoring/create-draft-scaffold.js';
import { buildEditorialReport } from '../../knowledge/authoring/editorial-report.js';
import { createLibraryReader, loadLibraryRelease } from '../../knowledge/consumer/library-reader.js';
import { LIBRARY_RELEASES_DIRECTORY } from '../../knowledge/snapshots/snapshot-files.js';
import { buildLibrarySnapshot } from '../../knowledge/snapshots/build-snapshot.js';
import { verifySnapshotFiles } from '../../knowledge/snapshots/verify-snapshot.js';
import { validateKnowledgeRepository } from '../../knowledge/validation/validate-knowledge.js';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';

const units = () => structuredClone(KNOWLEDGE_UNIT_REGISTRY);
const codes = values => validateKnowledgeRepository(values).errors.map(value => value.code);
const bySlug = slug => units().find(value => value.slug === slug);
const OLD_RELEASE_ID = 'rel-41b28d1102cbde379326d8ee3d0b5dbfab165935ba832144c73a3d2dfe51d9f6';
const FIVE_UNIT_RELEASE_ID = 'rel-d480cfe72b738610f5cd8df4e4d3d2a4ff99d7561b40232106a523c4797afe47';
const NINE_UNIT_RELEASE_ID = 'rel-ec21750708df2b7871fadffb406f57e64afbce6921fb972d44569d32d9c6898d';

test('draft scaffold is explicit, prose-free, taxonomy-discoverable, and excluded from releases', () => {
    const scaffold = createDraftKnowledgeUnitScaffold({ id: 'ku:endgames:draft:test', slug: 'draft-test' });
    assert.equal(scaffold.status, 'draft');
    assert.equal(scaffold.localization.content['en-US'].explanation, '');
    assert.deepEqual(scaffold.education.learningObjectives, []);
    assert.ok(AUTHORING_TAXONOMY.themes.includes('opposition'));
    assert.ok(AUTHORING_TAXONOMY.positionRoles.includes('clean-demonstration'));
    const completeDraft = structuredClone(units()[1]);
    completeDraft.id = 'ku:endgames:pawn-foundations:complete-draft';
    completeDraft.slug = 'complete-draft';
    completeDraft.status = 'draft';
    completeDraft.relationships = [];
    completeDraft.education.prerequisites = [];
    assert.equal(buildLibrarySnapshot([...units(), completeDraft]).release.unitCount, 13);
});

test('objective editorial validation rejects missing instruction and duplicate authored IDs', () => {
    const objective = units(); objective[0].education.learningObjectives = [];
    assert.ok(codes(objective).includes('required-education'));
    const mastery = units(); mastery[0].education.masteryCriteria = [];
    assert.ok(codes(mastery).includes('required-education'));
    const misconception = units(); misconception[0].localization.content['en-US'].misconceptions = [];
    assert.ok(codes(misconception).includes('required-instructional-content'));
    const coaching = units(); coaching[0].localization.content['en-US'].coachingPrompts = [];
    assert.ok(codes(coaching).includes('required-instructional-content'));
    const positions = units(); positions[1].positions[1].id = positions[1].positions[0].id;
    assert.ok(codes(positions).includes('invalid-position'));
    const objects = units(); objects[1].learningObjects.exercises[0].id = objects[1].learningObjects.demonstrations[0].id;
    assert.ok(codes(objects).includes('duplicate-learning-object-id'));
});

test('objective editorial validation rejects relationship, prerequisite, originality and provenance defects', () => {
    const relationship = units(); relationship.find(value => value.relationships.length).relationships[0].reason = '';
    assert.ok(codes(relationship).includes('empty-relationship-reason'));
    const prerequisite = units(); prerequisite.find(value => value.slug === 'activate-the-king').status = 'draft';
    assert.ok(codes(prerequisite).includes('published-prerequisite-not-published'));
    const originality = units(); originality[0].editorial.originalityDeclaration = '';
    assert.ok(codes(originality).includes('invalid-editorial-metadata'));
    const provenance = units(); provenance[0].editorial.provenance.notes = '';
    assert.ok(codes(provenance).includes('invalid-editorial-metadata'));
});

test('the authored library is exactly thirteen valid, stable, uniquely scoped published units', () => {
    const result = validateKnowledgeRepository(KNOWLEDGE_UNIT_REGISTRY);
    assert.equal(result.valid, true);
    assert.equal(KNOWLEDGE_UNIT_REGISTRY.length, 13);
    assert.equal(KNOWLEDGE_UNIT_REGISTRY.every(value => value.status === 'published'), true);
    assert.equal(new Set(KNOWLEDGE_UNIT_REGISTRY.map(value => `${value.domain}:${value.slug}`)).size, 13);
    assert.deepEqual(KNOWLEDGE_UNIT_REGISTRY.map(value => value.slug), [
        'rule-of-the-square', 'activate-the-king', 'direct-opposition', 'key-squares', 'convert-with-king-support',
        'reserve-tempo', 'protected-passed-pawn', 'outside-passed-pawn', 'pawn-breakthrough',
        'pawn-majority', 'fix-pawn-weakness', 'isolated-pawn', 'backward-pawn'
    ]);
    assert.deepEqual(buildEditorialReport().counts, { units: 13, published: 13, positions: 25, relationships: 71 });
});

test('cluster prerequisites are acyclic and match the intended pedagogical dependencies', () => {
    assert.deepEqual(bySlug('activate-the-king').education.prerequisites, []);
    assert.deepEqual(bySlug('direct-opposition').education.prerequisites, ['ku:endgames:pawn-foundations:activate-the-king']);
    assert.deepEqual(bySlug('key-squares').education.prerequisites, [
        'ku:endgames:pawn-foundations:activate-the-king', 'ku:endgames:pawn-foundations:direct-opposition'
    ]);
    assert.deepEqual(bySlug('convert-with-king-support').education.prerequisites, [
        'ku:endgames:pawn-foundations:activate-the-king', 'ku:endgames:pawn-foundations:key-squares'
    ]);
    assert.equal(codes(units()).includes('prerequisite-cycle'), false);
});

test('cluster graph has valid targets, reverse edges, remediation and recommendation paths', () => {
    const snapshot = buildLibrarySnapshot();
    assert.equal(snapshot.release.unitCount, 13);
    const verification = verifySnapshotFiles(snapshot.files, snapshot.releaseId);
    assert.equal(verification.valid, true);
    const reader = createLibraryReader(verification.data);
    const activation = bySlug('activate-the-king').id;
    const opposition = bySlug('direct-opposition').id;
    assert.ok(reader.getIncoming(activation).some(value => value.type === 'remediation'));
    assert.ok(reader.getOutgoing(opposition).some(value => value.type === 'recommendation'));
    assert.ok(reader.getDirectDependents(activation).includes(opposition));
    assert.equal(KNOWLEDGE_UNIT_REGISTRY.flatMap(value => value.relationships).every(edge =>
        KNOWLEDGE_UNIT_REGISTRY.some(value => value.id === edge.targetId)), true);
});

test('every new unit has purposeful positions, complete learning objects, and legal sequences', () => {
    for (const value of KNOWLEDGE_UNIT_REGISTRY.filter(value => value.slug !== 'rule-of-the-square')) {
        assert.equal(value.positions.length, 2);
        assert.ok(value.positions.some(position => position.role === 'clean-demonstration'));
        assert.ok(value.positions.some(position => ['transfer', 'contrast'].includes(position.role)));
        for (const position of value.positions) {
            assert.equal(ChessRulesFacade.validateFen(position.fen).valid, true);
            assert.equal(ChessRulesFacade.fromFen(position.fen).sideToMove(), position.sideToMove);
            assert.ok(position.expectedConcepts.length > 0);
            for (const idea of position.principalIdeas ?? []) {
                const game = ChessRulesFacade.fromFen(position.fen);
                for (const move of idea.moves) assert.ok(game.move(move));
            }
        }
        for (const type of ['demonstrations', 'guidedPractice', 'exercises', 'checksForUnderstanding', 'assessments']) {
            assert.ok(value.learningObjects[type].length > 0, `${value.id}:${type}`);
        }
        assert.ok(value.education.masteryCriteria.every(criterion => /\b(?:four|three|five|4|3|5)\b/i.test(criterion)));
        assert.ok(value.localization.content['en-US'].coachingPrompts.length >= 5);
    }
});

test('all thirteen units are consumable through ID, slug, facets, and the new release while history remains unchanged', async () => {
    const current = buildLibrarySnapshot();
    const reader = await loadLibraryRelease({ releasesDirectory: LIBRARY_RELEASES_DIRECTORY, releaseId: current.releaseId });
    assert.equal(reader.listUnitsByDomain('endgames').length, 13);
    for (const value of KNOWLEDGE_UNIT_REGISTRY) {
        assert.equal(reader.getUnitById(value.id).id, value.id);
        assert.equal(reader.getUnitByScopedSlug(`${value.domain}/${value.slug}`).id, value.id);
    }
    assert.ok(reader.filterUnits({ theme: 'opposition' }).some(value => value.slug === 'direct-opposition'));
    assert.ok(reader.filterUnits({ skill: 'planning' }).length >= 2);
    const historical = await loadLibraryRelease({ releasesDirectory: LIBRARY_RELEASES_DIRECTORY, releaseId: OLD_RELEASE_ID });
    assert.equal(historical.listUnitSummaries().length, 1);
    assert.equal(historical.getUnitById(KNOWLEDGE_UNIT_REGISTRY[0].id).contentVersion, '1.0.0');
    const fiveUnit = await loadLibraryRelease({ releasesDirectory: LIBRARY_RELEASES_DIRECTORY, releaseId: FIVE_UNIT_RELEASE_ID });
    assert.equal(fiveUnit.listUnitSummaries().length, 5);
    const nineUnit = await loadLibraryRelease({ releasesDirectory: LIBRARY_RELEASES_DIRECTORY, releaseId: NINE_UNIT_RELEASE_ID });
    assert.equal(nineUnit.listUnitSummaries().length, 9);
});
