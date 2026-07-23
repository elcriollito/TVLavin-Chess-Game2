import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ruleOfTheSquare } from '../../knowledge/domains/endgames/pawn-foundations/rule-of-the-square/unit.js';
import { loadLibraryRelease, LibraryReleaseError } from '../../knowledge/consumer/library-reader.js';
import { canonicalJson } from '../../knowledge/release/canonical-json.js';
import { buildLibrarySnapshot } from '../../knowledge/snapshots/build-snapshot.js';
import { readSnapshotFiles, writeLibrarySnapshot } from '../../knowledge/snapshots/snapshot-files.js';
import { verifySnapshotFiles } from '../../knowledge/snapshots/verify-snapshot.js';

const json = value => `${canonicalJson(value, 2)}\n`;
const unit = () => structuredClone(ruleOfTheSquare);
const fixture = (id, slug, status = 'published') => {
    const value = unit();
    value.id = id; value.slug = slug; value.status = status;
    if (status === 'draft') {
        value.editorial.reviewStatus = 'draft';
        value.editorial.verificationState = 'unverified';
        value.localization.translationStatus['en-US'] = 'draft';
    }
    return value;
};
const copyFiles = snapshot => structuredClone(snapshot.files);
const mutateJson = (files, path, mutate) => {
    const value = JSON.parse(files[path]); mutate(value); files[path] = json(value); return value;
};
const codes = result => result.errors.map(value => value.code);
const temporary = async callback => {
    const directory = await mkdtemp(join(tmpdir(), 'caissa-release-'));
    try { return await callback(directory); } finally { await rm(directory, { recursive: true, force: true }); }
};

test('same content has the same ID; instruction changes it; editorial and publication metadata do not', () => {
    const first = buildLibrarySnapshot();
    assert.equal(buildLibrarySnapshot().releaseId, first.releaseId);
    const changed = unit(); changed.localization.content['en-US'].explanation += ' Changed instruction.';
    assert.notEqual(buildLibrarySnapshot([changed]).releaseId, first.releaseId);
    const editorial = unit(); editorial.editorial.updatedAt = '2026-07-23';
    assert.equal(buildLibrarySnapshot([editorial]).releaseId, first.releaseId);
    assert.equal(buildLibrarySnapshot(undefined, { publishedAt: '2026-07-23T12:00:00Z' }).releaseId, first.releaseId);
    assert.equal(buildLibrarySnapshot(undefined, { releaseLabel: 'another-human-label' }).releaseId, first.releaseId);
});

test('snapshot bytes are deterministic, ordered, complete, and exclude drafts/private editorial data', () => {
    const z = fixture('ku:endgames:z', 'z');
    const a = fixture('ku:endgames:a', 'a');
    const draft = fixture('ku:endgames:draft', 'draft', 'draft');
    const first = buildLibrarySnapshot([z, draft, a]);
    const second = buildLibrarySnapshot([a, z, draft]);
    assert.deepEqual(first.files, second.files);
    assert.deepEqual(first.release.files.units.map(value => value.id), [a.id, z.id]);
    assert.equal(Object.keys(first.files).filter(value => value.startsWith('units/')).length, 2);
    for (const record of first.release.files.units) {
        const payload = JSON.parse(first.files[record.file]);
        assert.equal(payload.releaseId, first.releaseId);
        assert.equal(payload.contentHash, record.contentHash);
        assert.equal('editorial' in payload.unit, false);
        assert.ok(payload.unit.localization.content['en-US'].explanation);
    }
});

test('invalid source leaves no partial release and identical writes are idempotent', async () => temporary(async directory => {
    const invalid = unit(); invalid.education.themes = ['missing'];
    assert.throws(() => buildLibrarySnapshot([invalid]), /snapshot-source-invalid/);
    assert.deepEqual(await readdir(directory), []);
    const snapshot = buildLibrarySnapshot();
    assert.deepEqual(await writeLibrarySnapshot({ releasesDirectory: directory, snapshot }), { releaseId: snapshot.releaseId, created: true });
    assert.deepEqual(await writeLibrarySnapshot({ releasesDirectory: directory, snapshot }), { releaseId: snapshot.releaseId, created: false });
}));

test('conflicting bytes cannot overwrite an immutable release', async () => temporary(async directory => {
    const first = buildLibrarySnapshot();
    await writeLibrarySnapshot({ releasesDirectory: directory, snapshot: first });
    const conflict = buildLibrarySnapshot(undefined, { publishedAt: '2026-07-23T12:00:00Z' });
    await assert.rejects(() => writeLibrarySnapshot({ releasesDirectory: directory, snapshot: conflict }), /immutable-release-conflict/);
}));

test('valid self-contained snapshot verifies without authored modules', () => {
    const snapshot = buildLibrarySnapshot();
    assert.equal(verifySnapshotFiles(snapshot.files, snapshot.releaseId).valid, true);
});

test('verifier rejects corrupted unit content and incorrect content hash', () => {
    const snapshot = buildLibrarySnapshot();
    const corrupted = copyFiles(snapshot);
    const record = snapshot.release.files.units[0];
    mutateJson(corrupted, record.file, value => { value.unit.localization.content['en-US'].explanation += ' corruption'; });
    assert.ok(codes(verifySnapshotFiles(corrupted, snapshot.releaseId)).includes('unit-content-hash-mismatch'));
    const wrongHash = copyFiles(snapshot);
    mutateJson(wrongHash, record.file, value => { value.contentHash = '0'.repeat(64); });
    assert.ok(codes(verifySnapshotFiles(wrongHash, snapshot.releaseId)).includes('unit-index-mismatch'));
});

test('verifier rejects fingerprint, missing unit, unexpected unit and broken graph target', () => {
    const snapshot = buildLibrarySnapshot();
    const fingerprint = copyFiles(snapshot);
    mutateJson(fingerprint, 'release.json', value => { value.repositoryFingerprint = '0'.repeat(64); });
    assert.ok(codes(verifySnapshotFiles(fingerprint, snapshot.releaseId)).includes('repository-fingerprint-mismatch'));
    const missing = copyFiles(snapshot); delete missing[snapshot.release.files.units[0].file];
    assert.ok(codes(verifySnapshotFiles(missing, snapshot.releaseId)).includes('missing-file'));
    const unexpected = copyFiles(snapshot); unexpected['units/unexpected.json'] = '{}\n';
    assert.ok(codes(verifySnapshotFiles(unexpected, snapshot.releaseId)).includes('unexpected-file'));
    const broken = copyFiles(snapshot);
    mutateJson(broken, 'graph.json', value => { value.forward[ruleOfTheSquare.id] = { related: ['ku:missing'] }; });
    assert.ok(codes(verifySnapshotFiles(broken, snapshot.releaseId)).includes('broken-graph-target'));
});

test('verifier rejects incompatible schema, malformed ID, taxonomy mismatch and malformed payload', () => {
    const snapshot = buildLibrarySnapshot();
    const schema = copyFiles(snapshot);
    mutateJson(schema, 'release.json', value => { value.snapshotSchemaVersion = '9.0.0'; });
    assert.ok(codes(verifySnapshotFiles(schema, snapshot.releaseId)).includes('unsupported-snapshot-schema'));
    assert.ok(codes(verifySnapshotFiles(snapshot.files, '../escape')).includes('invalid-release-id'));
    const taxonomy = copyFiles(snapshot);
    mutateJson(taxonomy, 'taxonomy.json', value => { value.taxonomyVersion = '9.0.0'; });
    assert.ok(codes(verifySnapshotFiles(taxonomy, snapshot.releaseId)).includes('taxonomy-hash-mismatch'));
    const malformed = copyFiles(snapshot);
    const path = snapshot.release.files.units[0].file; malformed[path] = '{"unit":';
    assert.ok(codes(verifySnapshotFiles(malformed, snapshot.releaseId)).includes('malformed-json'));
});

test('consumer loads by immutable ID and exposes metadata, summaries, ID and slug access', async () => temporary(async directory => {
    const snapshot = buildLibrarySnapshot();
    await writeLibrarySnapshot({ releasesDirectory: directory, snapshot });
    const reader = await loadLibraryRelease({ releasesDirectory: directory, releaseId: snapshot.releaseId });
    assert.equal(reader.getReleaseMetadata().releaseId, snapshot.releaseId);
    assert.equal(reader.getReleaseFingerprint(), snapshot.release.repositoryFingerprint);
    assert.equal(reader.listUnitSummaries().length, 1);
    assert.equal(reader.getUnitById(ruleOfTheSquare.id).slug, ruleOfTheSquare.slug);
    assert.equal(reader.getUnitByScopedSlug('endgames/rule-of-the-square').id, ruleOfTheSquare.id);
    assert.equal(reader.getUnitById('missing'), null);
    assert.equal(reader.hasUnit('missing'), false);
}));

test('consumer filters deterministically by domain and every supported facet', async () => temporary(async directory => {
    const snapshot = buildLibrarySnapshot(); await writeLibrarySnapshot({ releasesDirectory: directory, snapshot });
    const reader = await loadLibraryRelease({ releasesDirectory: directory, releaseId: snapshot.releaseId });
    assert.equal(reader.listUnitsByDomain('endgames').length, 1);
    for (const filter of [
        { domain: 'endgames' }, { locale: 'en-US' }, { difficulty: 'foundation' },
        { learnerLevel: 'foundation-rules-aware' }, { knowledgeType: 'decision-rule' },
        { endgameFamily: 'pawn-endgames' }, { theme: 'pawn-races' }, { skill: 'calculation' }
    ]) assert.equal(reader.filterUnits(filter).length, 1);
    assert.equal(reader.filterUnits({ theme: 'missing' }).length, 0);
    assert.deepEqual(reader.listUnitSummaries().map(value => value.id), [ruleOfTheSquare.id]);
}));

test('consumer graph and taxonomy APIs are safe for empty and authored fixture edges', async () => temporary(async directory => {
    const base = fixture('ku:endgames:base', 'base');
    const next = fixture('ku:endgames:next', 'next');
    next.education.prerequisites = [base.id];
    next.relationships = [{ type: 'related', targetId: base.id, reason: 'fixture' }];
    const snapshot = buildLibrarySnapshot([next, base]); await writeLibrarySnapshot({ releasesDirectory: directory, snapshot });
    const reader = await loadLibraryRelease({ releasesDirectory: directory, releaseId: snapshot.releaseId });
    assert.deepEqual(reader.getOutgoing(base.id), []);
    assert.deepEqual(reader.getIncoming(base.id), [
        { type: 'prerequisite', targetId: next.id }, { type: 'related', targetId: next.id }
    ]);
    assert.deepEqual(reader.getDirectPrerequisites(next.id), [base.id]);
    assert.deepEqual(reader.getDirectDependents(base.id), [next.id]);
    assert.equal(reader.getTaxonomyEntry('themes', 'pawn-races').status, 'active');
    assert.ok(reader.listTaxonomyValues('themes').length >= 2);
    assert.equal(reader.supportsReleaseSchema('1.0.0'), true);
    assert.equal(reader.supportsKnowledgeSchema('1.0.0'), true);
}));

test('consumer returns immutable independent values and refuses unverifiable releases', async () => temporary(async directory => {
    const snapshot = buildLibrarySnapshot(); await writeLibrarySnapshot({ releasesDirectory: directory, snapshot });
    const reader = await loadLibraryRelease({ releasesDirectory: directory, releaseId: snapshot.releaseId });
    const first = reader.getUnitById(ruleOfTheSquare.id);
    assert.equal(Object.isFrozen(first), true);
    assert.throws(() => { first.slug = 'changed'; }, TypeError);
    assert.equal(reader.getUnitById(ruleOfTheSquare.id).slug, ruleOfTheSquare.slug);
    const path = join(directory, snapshot.releaseId, snapshot.release.files.units[0].file);
    await writeFile(path, '{}\n', 'utf8');
    await assert.rejects(() => loadLibraryRelease({ releasesDirectory: directory, releaseId: snapshot.releaseId }), LibraryReleaseError);
}));

test('path traversal IDs are rejected and reader metadata exposes no filesystem paths', async () => {
    await assert.rejects(() => loadLibraryRelease({ releasesDirectory: 'ignored', releaseId: '../escape' }), /invalid-release-id/);
    await temporary(async directory => {
        const snapshot = buildLibrarySnapshot(); await writeLibrarySnapshot({ releasesDirectory: directory, snapshot });
        const reader = await loadLibraryRelease({ releasesDirectory: directory, releaseId: snapshot.releaseId });
        assert.equal(JSON.stringify(reader.getReleaseMetadata()).includes(directory), false);
    });
});
