import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ruleOfTheSquare } from '../../knowledge/domains/endgames/pawn-foundations/rule-of-the-square/unit.js';
import { buildGraphIndexes, buildKnowledgeRelease, contentHash, serializeKnowledgeRelease } from '../../knowledge/release/build-release.js';
import { checkReleaseArtifacts, RELEASE_ARTIFACTS, staleReleaseArtifacts } from '../../knowledge/release/release-artifacts.js';

const unit = () => structuredClone(ruleOfTheSquare);
const fixture = (id, slug, status = 'published') => {
    const value = unit();
    value.id = id;
    value.slug = slug;
    value.status = status;
    if (status === 'draft') {
        value.editorial.reviewStatus = 'draft';
        value.editorial.verificationState = 'unverified';
        value.localization.translationStatus['en-US'] = 'draft';
    }
    return value;
};

test('release output is byte-for-byte deterministic with stable unit ordering and fingerprint', () => {
    const a = fixture('ku:endgames:z', 'z');
    const b = fixture('ku:endgames:a', 'a');
    const first = serializeKnowledgeRelease([a, b]);
    const second = serializeKnowledgeRelease([b, a]);
    assert.deepEqual(first, second);
    assert.equal(JSON.parse(first.manifest).repositoryFingerprint, JSON.parse(second.manifest).repositoryFingerprint);
    assert.deepEqual(JSON.parse(first.manifest).units.map(value => value.id), ['ku:endgames:a', 'ku:endgames:z']);
});

test('content hash changes for instruction but not object key insertion order or editorial dates', () => {
    const original = unit();
    const changed = unit();
    changed.localization.content['en-US'].explanation += ' Additional original instruction.';
    assert.notEqual(contentHash(original), contentHash(changed));
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    assert.equal(contentHash(original), contentHash(reordered));
    const editorialDate = unit();
    editorialDate.editorial.updatedAt = '2026-07-23';
    assert.equal(contentHash(original), contentHash(editorialDate));
});

test('manifest counts production units and locales while excluding drafts', () => {
    const published = unit();
    const draft = fixture('ku:endgames:draft', 'draft', 'draft');
    const { manifest } = buildKnowledgeRelease([draft, published]);
    assert.equal(manifest.counts.totalProductionUnits, 1);
    assert.deepEqual(manifest.counts.byDomain, { endgames: 1 });
    assert.deepEqual(manifest.counts.byStatus, { published: 1 });
    assert.deepEqual(manifest.counts.byLocaleAvailability, { 'en-US': 1 });
});

test('manifest remains lightweight and excludes full instructional content', () => {
    const output = serializeKnowledgeRelease().manifest;
    assert.doesNotMatch(output, /decisionProcess|coachingPrompts|principalIdeas/);
    assert.equal(JSON.parse(output).units[0].contentHash, contentHash(ruleOfTheSquare));
});

test('graph indexes contain authored forward, reverse and prerequisite edges only', () => {
    const prerequisite = fixture('ku:endgames:prerequisite', 'prerequisite');
    const learner = fixture('ku:endgames:learner', 'learner');
    learner.education.prerequisites = [prerequisite.id];
    learner.relationships = [{ type: 'contrast', targetId: prerequisite.id, reason: 'fixture' }];
    const graph = buildGraphIndexes([learner, prerequisite]);
    assert.deepEqual(graph.forward[learner.id], { contrast: [prerequisite.id], prerequisite: [prerequisite.id] });
    assert.deepEqual(graph.reverse[prerequisite.id], { contrast: [learner.id], prerequisite: [learner.id] });
    assert.deepEqual(graph.prerequisites[prerequisite.id].dependents, [learner.id]);
    assert.deepEqual(graph.forward[prerequisite.id], {});
});

test('graph ordering is stable and draft-only relationships are excluded from releases', () => {
    const published = unit();
    const draft = fixture('ku:endgames:draft-related', 'draft-related', 'draft');
    draft.relationships = [{ type: 'related', targetId: published.id, reason: 'draft only' }];
    const first = serializeKnowledgeRelease([draft, published]).graph;
    const second = serializeKnowledgeRelease([published, draft]).graph;
    assert.equal(first, second);
    assert.equal(first.includes(draft.id), false);
});

test('generation artifacts and check mode agree', async () => {
    const result = await checkReleaseArtifacts();
    assert.equal(result.valid, true);
    assert.equal(await readFile(RELEASE_ARTIFACTS.manifest, 'utf8'), serializeKnowledgeRelease().manifest);
    assert.equal(await readFile(RELEASE_ARTIFACTS.graph, 'utf8'), serializeKnowledgeRelease().graph);
});

test('stale artifact detection reports only differing artifacts', () => {
    const expected = serializeKnowledgeRelease();
    assert.deepEqual(staleReleaseArtifacts(expected, expected), []);
    assert.deepEqual(staleReleaseArtifacts({ ...expected, graph: '{}\n' }, expected), ['graph']);
});
