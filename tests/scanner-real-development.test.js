import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import test from 'node:test';
import { build } from '../tools/scanner-real-development/build-manifest.mjs';
import { ANNOTATION_SCHEMA, CORPUS_VERSION, auditInventory, deriveIndexes, fingerprint, hash,
  possibleNearDuplicate, summary, validateAnnotation, validateManifest, validateSplitIsolation }
  from '../tools/scanner-real-development/core.mjs';
import { createDevelopmentStore } from '../tools/scanner-real-development/store.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const emptyProtected = () => ({ sources: [], protectedIds: new Set(), protectedFinalHashes: new Set() });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const fp = (hex) => ({ fullDhash64: hex, centerDhash64: hex });
const synthetic = (id, sourceSha256, fingerprintValue = fp('0000000000000000')) => ({
  sampleId: id, sourceFilename: `${id}.png`, extension: '.png', sourceBytes: 100,
  sourceWidth: 512, sourceHeight: 512, sourceSha256, fingerprint: fingerprintValue });
const recordFor = (sample, status = 'unreviewed') => ({ sampleId: sample.sampleId,
  sourceSha256: sample.sourceSha256, sourceRole: 'development-only', finalBenchmarkUseAllowed: false,
  status, corners: [], cornerRevision: null, orientation: null, labels: Array(64).fill('empty'),
  placementFen: '8/8/8/8/8/8/8/8', verification: { cornersVerifiedBy: null, piecesVerifiedBy: null,
    all64Reviewed: false, nearDuplicateReviewedDistinctBy: null, reviewReason: '' },
  metadata: { platform: 'unknown', platformSubtype: 'unknown', captureType: 'unknown',
    sourceCategory: 'unknown', rightsStatus: 'user-provided-internal-research', developmentUseAllowed: true,
    redistributionAllowed: false, sourceGroup: null, sessionGroup: null, split: 'unassigned',
    subtypeTags: [], notes: '' } });

test('41-source audit is deterministic, external-only, and separated from all protected hashes', async () => {
  const first = await build();
  const second = await build();
  assert.equal(first.manifestSha256, second.manifestSha256);
  assert.equal(first.report.sourceCount, 41);
  assert.equal(first.report.exactUniqueImages, 41);
  assert.equal(first.report.exactProtectedDuplicates, 0);
  assert.equal(first.report.nearDuplicateReviewCandidates, 3);
  assert.equal(first.report.admittedDevelopmentSamples, 38);
  assert.equal(first.report.protectedFinalSourceCount, 31);
  assert.equal(first.report.protectedUniqueSourceCount, 46);
  assert.equal(first.report.unsupportedFiles.length, 0);
  assert.equal(first.manifest.samples[0].sampleId, 'dev-real-v0.1-001');
  assert.equal(first.manifest.samples.at(-1).sampleId, 'dev-real-v0.1-041');
  assert(first.manifest.samples.every((item) => item.sourceRole === 'development-only'
    && item.developmentUseAllowed && !item.redistributionAllowed && item.split === 'unassigned'));
  assert.equal(hash(await readFile(first.manifestPath)), first.manifestSha256);
  assert.equal(JSON.stringify(first.manifest).includes('data:image'), false);
});

test('exact protected and local duplicates are excluded; perceptual candidates require review', () => {
  const protectedCatalog = { sources: [{ sampleId: 'protected-final-1', sourceSha256: 'A'.repeat(64),
    fingerprint: fp('0000000000000000') }], protectedIds: new Set(['protected-final-1']),
  protectedFinalHashes: new Set(['A'.repeat(64)]) };
  const inventory = { unsupported: [], samples: [
    synthetic('dev-real-v0.1-001', 'A'.repeat(64)),
    synthetic('dev-real-v0.1-002', 'B'.repeat(64)),
    synthetic('dev-real-v0.1-003', 'B'.repeat(64)),
    synthetic('dev-real-v0.1-004', 'C'.repeat(64), fp('FFFFFFFFFFFFFFFF'))
  ] };
  const manifest = auditInventory(inventory, protectedCatalog);
  assert.equal(manifest.samples[0].governanceStatus, 'excluded-exact-duplicate');
  assert.equal(manifest.samples[0].protectedSourceId, 'protected-final-1');
  assert.equal(manifest.samples[1].governanceStatus, 'review-required');
  assert.equal(manifest.samples[2].governanceStatus, 'excluded-exact-duplicate');
  assert.equal(manifest.samples[3].governanceStatus, 'admitted');
  assert.equal(summary(manifest).nearDuplicateReviewCandidates, 1);
  assert.throws(() => validateManifest({ ...manifest, samples: manifest.samples.map((item, index) =>
    index === 0 ? { ...item, governanceStatus: 'admitted' } : item) }, protectedCatalog),
  /protected-exact-duplicate-not-excluded/);
  assert.throws(() => validateManifest({ ...manifest, samples: manifest.samples.map((item, index) =>
    index === 3 ? { ...item, sampleId: 'protected-final-1' } : item) }, protectedCatalog));
  assert.throws(() => validateManifest({ ...manifest, sourceRole: 'protected-final-benchmark' }, protectedCatalog),
    /development-role-required/);
});

test('fingerprint flags bounded transformations as review, never as verified identity', async () => {
  const pixels = Buffer.alloc(256 * 256 * 3);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const offset = (y * 256 + x) * 3;
    const value = ((x * 17 + y * 31 + (x ^ y) * 11) % 160) + 45;
    pixels[offset] = value; pixels[offset + 1] = value - 12; pixels[offset + 2] = value + 8;
  }
  const original = await sharp(pixels, { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
  const compressed = await sharp(original).jpeg({ quality: 88 }).toBuffer();
  const resized = await sharp(original).resize(512, 512).png().toBuffer();
  const reference = await fingerprint(original);
  assert.equal(possibleNearDuplicate(reference, await fingerprint(compressed)), true);
  assert.equal(possibleNearDuplicate(reference, await fingerprint(resized)), true);
});

test('annotation verification, split isolation and empty/occupied/king indexes fail closed', () => {
  const inventory = { unsupported: [], samples: [synthetic('dev-real-v0.1-001', 'A'.repeat(64), fp('0'.repeat(16))),
    synthetic('dev-real-v0.1-002', 'B'.repeat(64), fp('0'.repeat(16)))] };
  const manifest = auditInventory(inventory, emptyProtected());
  const first = recordFor(manifest.samples[0], 'human-verified');
  first.corners = [[0, 0], [512, 0], [512, 512], [0, 512]];
  first.cornerRevision = hash(Buffer.from(JSON.stringify(first.corners)));
  first.orientation = 'white-at-bottom';
  first.labels[4] = 'k'; first.labels[60] = 'K';
  first.placementFen = '4k3/8/8/8/8/8/8/4K3';
  first.metadata.split = 'train-development';
  first.metadata.subtypeTags = ['plain-digital'];
  first.verification = { cornersVerifiedBy: 'Alexander', piecesVerifiedBy: 'Alexander', all64Reviewed: true,
    nearDuplicateReviewedDistinctBy: 'Alexander', reviewReason: 'A distinct source frame was reviewed.' };
  validateAnnotation(first, manifest.samples[0]);
  const indexes = deriveIndexes(manifest, { samples: [first] });
  assert.equal(indexes.empty.length, 62);
  assert.equal(indexes.occupied.length, 2);
  assert.equal(indexes.kingContrast.length, 64);
  assert.equal(indexes.occupied.find((item) => item.pieceClass === 'k').square, 'e8');
  const second = recordFor(manifest.samples[1], 'unreviewed');
  second.metadata.split = 'validation';
  assert.throws(() => validateSplitIsolation(manifest, { samples: [first, second] }), /near-duplicate-split-leakage/);
  first.verification.nearDuplicateReviewedDistinctBy = null;
  assert.throws(() => validateAnnotation(first, manifest.samples[0]), /near-duplicate-review-required/);
  first.status = 'pieces-draft';
  assert.equal(deriveIndexes(manifest, { samples: [first] }).empty.length, 0);
  first.status = 'human-verified';
  first.metadata.rightsStatus = 'evaluation-only'; first.metadata.developmentUseAllowed = false;
  first.metadata.split = 'unassigned';
  assert.equal(deriveIndexes(manifest, { samples: [first] }).empty.length, 0);
  first.metadata.split = 'train-development';
  assert.throws(() => validateAnnotation(first, manifest.samples[0]), /non-development-source-cannot-be-split/);
});

test('atomic external autosave survives reload, protects verified truth, and leaves source bytes intact', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'caissa-real-dev-store-'));
  try {
    const sourceRoot = join(folder, 'sources');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(sourceRoot);
    const name = 'fixture.png';
    const bytes = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#c0c0c0' } })
      .png().toBuffer();
    await writeFile(join(sourceRoot, name), bytes);
    const sample = synthetic('dev-real-v0.1-001', sha(bytes), fp('0'.repeat(16)));
    sample.sourceFilename = name; sample.sourceBytes = bytes.length;
    const manifest = auditInventory({ unsupported: [], samples: [sample] }, emptyProtected());
    const outputPath = join(folder, 'annotations', 'real-development-v0.1.annotations.json');
    const options = { manifest, manifestSha256: 'C'.repeat(64), protectedCatalog: emptyProtected(),
      sourceRoot, outputPath, repoRoot };
    const store = createDevelopmentStore(options);
    const record = recordFor(manifest.samples[0], 'corners-draft');
    record.corners = [[0, 0], [512, 0]];
    const saved = await store.saveRecord(record, null);
    assert.equal(saved.record.status, 'corners-draft');
    assert.equal((await createDevelopmentStore(options).readState()).annotations.samples[0].corners.length, 2);
    const verified = structuredClone(record);
    verified.status = 'corners-verified'; verified.corners = [[0, 0], [512, 0], [512, 512], [0, 512]];
    verified.cornerRevision = hash(Buffer.from(JSON.stringify(verified.corners)));
    verified.verification.cornersVerifiedBy = 'Alexander';
    const cornerSaved = await store.saveRecord(verified, saved.revision);
    const pieces = structuredClone(verified);
    pieces.status = 'human-verified'; pieces.orientation = 'white-at-bottom';
    pieces.verification.piecesVerifiedBy = 'Alexander'; pieces.verification.all64Reviewed = true;
    const final = await store.saveRecord(pieces, cornerSaved.revision);
    assert.equal(final.record.status, 'human-verified');
    await assert.rejects(store.saveRecord({ ...pieces, status: 'pieces-draft' }, final.revision),
      /human-verified-truth-protected/);
    assert.equal(sha(await readFile(join(sourceRoot, name))), sample.sourceSha256);
    assert.equal(JSON.parse(await readFile(outputPath)).schemaVersion, ANNOTATION_SCHEMA);
    assert.equal(manifest.corpusVersion, CORPUS_VERSION);
  } finally {
    assert(resolve(folder).startsWith(resolve(tmpdir())));
    await rm(folder, { recursive: true, force: true });
  }
});
