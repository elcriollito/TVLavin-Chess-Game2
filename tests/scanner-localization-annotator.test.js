import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANNOTATION_SCHEMA,
  CORNER_KEYS,
  annotateSample,
  cornersFromGroundTruth,
  createAnnotationState,
  hydrateAnnotations,
  isSampleComplete,
  mapDisplayPoint,
  mergeAnnotationManifest,
  normalizePoint,
  reduceAnnotationState,
  serializeManifest,
  sha256Hex,
  validateQuadrilateral,
  verifyChecksum
} from '../tools/scanner-localization-annotator/annotator-core.js';

const SAMPLE = Object.freeze({
  sampleId: 'real-001',
  originalFile: 'originals/real-001.jpeg',
  originalSha256: 'ABCDEF',
  provenance: 'User-provided image for private CAISSA Scanner evaluation',
  permissionUseCategory: 'user-provided-internal-evaluation',
  boardPresent: true,
  referenceSystem: 'Chessvision',
  referenceOutcome: 'success',
  difficultyTags: ['printed-book'],
  split: null,
  groundTruthCornersNormalized: null,
  manuallyAuditedField: 'preserve-me'
});

const SOURCE_MANIFEST = Object.freeze({
  corpus: 'caissa-scanner-real-localization-corpus-v0.1',
  status: 'annotation-pending',
  samples: [SAMPLE]
});

const QUAD = Object.freeze([
  { x: 10, y: 15 },
  { x: 190, y: 20 },
  { x: 180, y: 180 },
  { x: 20, y: 190 }
]);

test('display clicks map back to original source coordinates without preview rounding', () => {
  const mapped = mapDisplayPoint({
    clientX: 310,
    clientY: 170,
    rect: { left: 10, top: 20, width: 600, height: 300 },
    imageWidth: 1200,
    imageHeight: 600
  });
  assert.deepEqual(mapped, { x: 600, y: 300 });
});

test('normalized coordinates use source dimensions with stable six-place precision', () => {
  assert.deepEqual(normalizePoint({ x: 100, y: 200 }, 333, 777), { x: 0.3003, y: 0.2574 });
});

test('positive save preserves click order as TL TR BR BL', () => {
  const annotated = annotateSample(SAMPLE, {
    status: 'board-present', points: QUAD, imageWidth: 200, imageHeight: 200
  });
  assert.deepEqual(Object.keys(annotated.groundTruth.playableBoardCorners), CORNER_KEYS);
  assert.deepEqual(cornersFromGroundTruth(annotated), QUAD);
  assert.equal(annotated.groundTruth.playableBoardCorners.topLeft.normalized.x, 0.05);
  assert.equal(annotated.annotation.cornerOrder, 'tl-tr-br-bl');
  assert.equal(annotated.manuallyAuditedField, 'preserve-me');
});

test('quadrilateral validation blocks duplicate, crossed, non-convex, and out-of-bounds clicks', () => {
  assert.equal(validateQuadrilateral(QUAD, 200, 200).valid, true);
  assert.ok(validateQuadrilateral([QUAD[0], QUAD[0], QUAD[2], QUAD[3]], 200, 200).reasons.includes('duplicate-corner'));
  assert.ok(validateQuadrilateral([QUAD[0], QUAD[2], QUAD[1], QUAD[3]], 200, 200).reasons.includes('self-intersection'));
  assert.ok(validateQuadrilateral([{ x: 10, y: 10 }, { x: 190, y: 10 }, { x: 80, y: 80 }, { x: 10, y: 190 }], 200, 200).reasons.includes('non-convex'));
  assert.ok(validateQuadrilateral([{ x: -1, y: 0 }, ...QUAD.slice(1)], 200, 200).reasons.includes('corner-out-of-bounds'));
});

test('checksum verification reports mismatches without mutating bytes', async () => {
  const bytes = new TextEncoder().encode('immutable-real-image-bytes');
  const before = await sha256Hex(bytes);
  const match = await verifyChecksum(bytes, before);
  const mismatch = await verifyChecksum(bytes, '0'.repeat(64));
  const after = await sha256Hex(bytes);
  assert.equal(match.ok, true);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.actual, before);
  assert.equal(after, before);
});

test('negative samples save without corners and remain verified', () => {
  const annotated = annotateSample(SAMPLE, {
    status: 'board-not-present', points: [], imageWidth: 200, imageHeight: 200
  });
  assert.equal(annotated.boardPresent, false);
  assert.equal(annotated.groundTruth.expectedLocalizationResult, 'board-not-found');
  assert.equal(isSampleComplete(annotated), true);
  assert.equal(cornersFromGroundTruth(annotated).length, 0);
});

test('partial and skip statuses never invent corners', () => {
  const partial = annotateSample(SAMPLE, {
    status: 'unsupported-partial-board', points: [], imageWidth: 200, imageHeight: 200
  });
  const skipped = annotateSample(SAMPLE, {
    status: 'skip-for-now', points: [], imageWidth: 200, imageHeight: 200
  });
  assert.equal(partial.groundTruth.expectedLocalizationResult, 'unsupported-partial-board');
  assert.equal(isSampleComplete(partial), true);
  assert.equal(skipped.annotation.annotationStatus, 'skip-for-now');
  assert.equal(isSampleComplete(skipped), false);
});

test('undo and reset state are deterministic and bounded to four points', () => {
  let state = createAnnotationState();
  for (const point of [...QUAD, { x: 50, y: 50 }]) state = reduceAnnotationState(state, { type: 'add', point });
  assert.equal(state.points.length, 4);
  state = reduceAnnotationState(state, { type: 'undo' });
  assert.equal(state.points.length, 3);
  state = reduceAnnotationState(state, { type: 'reset' });
  assert.deepEqual(state.points, []);
});

test('manifest merge preserves audited metadata, source order, and unset split', () => {
  const annotated = annotateSample(SAMPLE, {
    status: 'board-present', points: QUAD, imageWidth: 200, imageHeight: 200
  });
  const merged = mergeAnnotationManifest(SOURCE_MANIFEST, new Map([[SAMPLE.sampleId, annotated]]), 'F'.repeat(64));
  assert.equal(merged.schemaVersion, ANNOTATION_SCHEMA);
  assert.equal(merged.status, 'annotation-complete');
  assert.deepEqual(merged.progress, { completed: 1, total: 1 });
  assert.equal(merged.samples[0].manuallyAuditedField, 'preserve-me');
  assert.equal(merged.samples[0].split, null);
  assert.match(serializeManifest(merged), /"timestampPolicy": "omitted-for-determinism"/);
});

test('resume hydrates completed samples and rejects a different corpus', () => {
  const annotated = annotateSample(SAMPLE, {
    status: 'board-present', points: QUAD, imageWidth: 200, imageHeight: 200
  });
  const merged = mergeAnnotationManifest(SOURCE_MANIFEST, new Map([[SAMPLE.sampleId, annotated]]), 'A'.repeat(64));
  const resumed = hydrateAnnotations(SOURCE_MANIFEST, merged);
  assert.equal(resumed.size, 1);
  assert.equal(isSampleComplete(resumed.get(SAMPLE.sampleId)), true);
  assert.throws(() => hydrateAnnotations({ ...SOURCE_MANIFEST, corpus: 'other' }, merged), /annotation-corpus-mismatch/);
});

test('annotation output is separate and source manifest/image values remain immutable', async () => {
  const sourceBefore = serializeManifest(SOURCE_MANIFEST);
  const image = new TextEncoder().encode('source-image-remains-read-only');
  const imageHashBefore = await sha256Hex(image);
  const annotated = annotateSample(SAMPLE, {
    status: 'board-present', points: QUAD, imageWidth: 200, imageHeight: 200
  });
  mergeAnnotationManifest(SOURCE_MANIFEST, new Map([[SAMPLE.sampleId, annotated]]), 'B'.repeat(64));
  assert.equal(serializeManifest(SOURCE_MANIFEST), sourceBefore);
  assert.equal(await sha256Hex(image), imageHashBefore);
});
