import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { LABELS, CANONICAL_SQUARES, SQUARE_ORDER, assignImageSquare, canonicalToImageLabels,
  chessWarnings, coverageReport, createPieceRecord, emptyManifest, labelsToPlacementFen, placementFenToLabels,
  reorientLabelsPreservingImage, serializeManifest, squareForImageIndex, validateLabels, validateManifest,
  validatePieceRecord, toVisualBenchmarkTruth } from '../tools/scanner-piece-label-annotator/piece-label-core.js';
import { createPieceStore } from '../tools/scanner-piece-label-annotator/store.js';
import { loadPieceCatalog, rectifiedBoardPng, verifySourceImage } from '../tools/scanner-piece-label-annotator/catalog.js';
import { truthLabels } from '../scanner/recognition/benchmark/historical-classifier-evaluation.js';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const blank = () => Array(64).fill('empty');
const sample = (sourceSha256 = 'A'.repeat(64)) => ({ sampleId: 'test-board', sourceFilename: 'board.png', sourceSha256,
  cornerManifestSha256: 'C'.repeat(64), pieceSetFamily: null, pieceSetStyle: 'unknown',
  boardThemeFamily: null, difficultyTags: [], sourcePlatform: null });
const catalog = (source = sample()) => ({ samples: [source], v01CornerManifestSha256: 'C'.repeat(64),
  v03CornerManifestSha256: 'D'.repeat(64), duplicateAliases: [{ sampleId: 'overlap', canonicalSampleId: source.sampleId,
    sourceSha256: source.sourceSha256 }], outOfScope: ['3d-hard-negative'] });
const verified = (source = sample(), labels = blank()) => createPieceRecord(source, {
  labels, boardOrientation: 'white-at-bottom', status: 'verified', source: 'manual',
  humanVerifiedBy: 'Alexander', confirmation: 'I reviewed all 64 squares'
});

test('exact 64-label and 13-class invariant rejects invalid and incomplete arrays', () => {
  assert.equal(LABELS.length, 13);
  assert.equal(validateLabels(blank()).length, 64);
  assert.throws(() => validateLabels(blank().slice(1)), /exactly-64/);
  assert.throws(() => validateLabels([...blank().slice(1), 'x']), /invalid-piece/);
});

test('published JSON schema names the same canonical version, class set, and 64-item rule', async () => {
  const schema = JSON.parse(await readFile(new URL('../tools/scanner-piece-label-annotator/caissa-scanner-piece-labels-v1.schema.json', import.meta.url)));
  assert.equal(schema.properties.schemaVersion.const, 'caissa-scanner-piece-labels/1');
  assert.equal(schema.properties.squareOrder.const, SQUARE_ORDER);
  assert.deepEqual(schema.$defs.label.enum, LABELS);
  assert.equal(schema.$defs.sample.properties.labels.minItems, 64);
  assert.equal(schema.$defs.sample.properties.labels.maxItems, 64);
});

test('orientation and square mapping preserve image pieces while remapping canonical truth', () => {
  assert.equal(CANONICAL_SQUARES[0], 'a8');
  assert.equal(CANONICAL_SQUARES[63], 'h1');
  assert.equal(squareForImageIndex(0, 'white-at-bottom'), 'a8');
  assert.equal(squareForImageIndex(0, 'black-at-bottom'), 'h1');
  assert.equal(squareForImageIndex(63, 'black-at-bottom'), 'a8');
  const first = assignImageSquare(blank(), 'white-at-bottom', 0, 'r');
  const flipped = reorientLabelsPreservingImage(first, 'white-at-bottom', 'black-at-bottom');
  assert.equal(flipped[63], 'r');
  assert.equal(canonicalToImageLabels(flipped, 'black-at-bottom')[0], 'r');
  assert.notEqual(labelsToPlacementFen(first), labelsToPlacementFen(flipped));
  assert.throws(() => squareForImageIndex(0, null), /orientation/);
});

test('persistent piece selection permits repeated placement and Empty clearing', () => {
  let labels = blank();
  for (const cell of [0, 1, 2]) labels = assignImageSquare(labels, 'white-at-bottom', cell, 'p');
  assert.deepEqual(labels.slice(0, 3), ['p', 'p', 'p']);
  labels = assignImageSquare(labels, 'white-at-bottom', 1, 'empty');
  assert.deepEqual(labels.slice(0, 3), ['p', 'empty', 'p']);
});

test('placement FEN is canonical, placement-only, and round-trips without legality assumptions', () => {
  const labels = placementFenToLabels('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  assert.equal(labelsToPlacementFen(labels), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  assert.equal(labelsToPlacementFen(blank()), '8/8/8/8/8/8/8/8');
  assert.throws(() => placementFenToLabels('8/8/8/8/8/8/8'), /eight-ranks/);
  assert.throws(() => placementFenToLabels('9/8/8/8/8/8/8/8'), /fen-piece/);
});

test('king and material warnings do not prevent human verification of puzzles', () => {
  const warnings = chessWarnings(blank());
  assert.ok(warnings.some((item) => item.includes('No white king')));
  assert.ok(warnings.some((item) => item.includes('No black king')));
  assert.equal(verified().annotation.status, 'verified');
  const kings = blank(); kings[0] = 'K'; kings[1] = 'K';
  assert.ok(chessWarnings(kings).some((item) => item.includes('Multiple white kings')));
});

test('verified truth requires explicit human review, orientation, and reviewed FEN prefill', () => {
  assert.throws(() => createPieceRecord(sample(), { labels: blank(), boardOrientation: null, status: 'verified',
    humanVerifiedBy: 'Alexander', confirmation: 'I reviewed all 64 squares' }), /orientation/);
  assert.throws(() => createPieceRecord(sample(), { labels: blank(), boardOrientation: 'white-at-bottom', status: 'verified',
    humanVerifiedBy: 'Alexander' }), /human-confirmation/);
  assert.throws(() => createPieceRecord({ ...sample(), trustedFenPlacement: '8/8/8/8/8/8/8/8' },
    { labels: blank(), boardOrientation: 'white-at-bottom', status: 'verified',
    source: 'fen-prefill-unreviewed', humanVerifiedBy: 'Alexander', confirmation: 'I reviewed all 64 squares' }), /unreviewed-prefill/);
  assert.throws(() => createPieceRecord(sample(), { labels: blank(), boardOrientation: 'white-at-bottom', status: 'draft',
    source: 'fen-prefill-unreviewed' }), /trusted-fen-prefill-unavailable/);
  const reviewed = createPieceRecord({ ...sample(), trustedFenPlacement: '8/8/8/8/8/8/8/8' },
    { labels: blank(), boardOrientation: 'black-at-bottom', status: 'verified',
    source: 'fen-prefill-reviewed', humanVerifiedBy: 'Alexander', confirmation: 'I reviewed all 64 squares' });
  assert.equal(reviewed.annotation.source, 'fen-prefill-reviewed');
});

test('canonical verified truth adapts to visual benchmark order only after human review', () => {
  const labels = blank(); labels[0] = 'K';
  const record = createPieceRecord(sample(), { labels, boardOrientation: 'black-at-bottom', status: 'verified',
    source: 'manual', humanVerifiedBy: 'Alexander', confirmation: 'I reviewed all 64 squares' });
  const visual = toVisualBenchmarkTruth(record);
  assert.equal(truthLabels(visual)[63], 'K');
  assert.equal(truthLabels(visual)[0], 'empty');
  assert.throws(() => toVisualBenchmarkTruth({ ...record, annotation: { ...record.annotation, status: 'draft' } }), /verified-human/);
});

test('checksum and corner identity bind records and reject stale or tampered truth', () => {
  const original = verified();
  assert.equal(original.squareOrder, SQUARE_ORDER);
  assert.equal(validatePieceRecord(original, sample()).sampleId, sample().sampleId);
  assert.throws(() => validatePieceRecord(original, sample('B'.repeat(64))), /source-checksum/);
  assert.throws(() => validatePieceRecord({ ...original, cornerManifestSha256: 'E'.repeat(64) }, sample()), /corner-manifest/);
  assert.throws(() => validatePieceRecord({ ...original, placementFen: '8/8/8/8/8/8/8/7K' }, sample()), /fen-label/);
});

test('exact-byte alias reuses canonical truth without another annotation and coverage counts unique 2D boards', () => {
  const source = sample(); const corpora = catalog(source);
  const manifest = { ...emptyManifest(corpora), samples: [verified(source)] };
  assert.deepEqual(coverageReport(corpora, manifest), {
    schemaVersion: 'caissa-scanner-piece-label-coverage/1', verifiedCornerBoards: 1,
    eligibleUnique2dBoards: 1, pieceLabeledComplete: 1, draftBoards: 0, pieceLabeledPending: 0,
    missingTruth: 0, excludedExactByteDuplicates: 1, outOfScope: 1, trustedFenPrefillCandidates: 0
  });
  const duplicateCatalog = { ...corpora, samples: [source, { ...source, sampleId: 'duplicate-record' }] };
  const duplicate = { ...verified(source), sampleId: 'duplicate-record' };
  assert.throws(() => validateManifest({ ...emptyManifest(duplicateCatalog), samples: [verified(source), duplicate] }, duplicateCatalog), /duplicate-piece-truth/);
});

test('canonical manifest serialization is stable, sorted, and contains no generated timestamp', () => {
  const source = sample(); const corpora = catalog(source);
  const manifest = { ...emptyManifest(corpora), samples: [verified(source)] };
  const first = serializeManifest(manifest, corpora);
  assert.equal(first, serializeManifest(manifest, corpora));
  assert.equal(first.includes('createdAt'), false);
  assert.equal(first.includes('updatedAt'), false);
  assert.equal(JSON.parse(first).samples[0].labels.length, 64);
});

test('file store resumes drafts, retains prior hash-named history, and rejects changed source bytes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'caissa-piece-core-'));
  try {
    const image = join(folder, 'board.png');
    await writeFile(image, Buffer.from('immutable-image'));
    const source = { ...sample(sha(await readFile(image))), sourcePath: image };
    const corpora = catalog(source);
    assert.throws(() => createPieceStore({ outputPath: image, catalog: corpora }), /output-overlaps-source-image/);
    assert.throws(() => createPieceStore({ outputPath: join(folder, 'inside.json'),
      catalog: { ...corpora, protectedCorpusRoots: [folder] } }), /output-inside-immutable-corpus/);
    const output = join(folder, 'truth', 'piece-labels.json');
    const store = createPieceStore({ outputPath: output, catalog: corpora });
    assert.equal((await store.read()).samples.length, 0);
    const draft = createPieceRecord(source, { labels: blank(), boardOrientation: null, status: 'draft' });
    await store.save(draft);
    assert.equal((await store.read()).samples[0].annotation.status, 'draft');
    await store.save(verified(source));
    assert.equal((await store.read()).samples[0].annotation.status, 'verified');
    assert.equal((await readdir(join(folder, 'truth', 'history'))).length, 1);
    const before = await readFile(output);
    await writeFile(image, Buffer.from('changed-image'));
    await assert.rejects(() => store.save(verified(source)), /source-checksum-mismatch/);
    assert.deepEqual(await readFile(output), before);
  } finally {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir())));
    await rm(folder, { recursive: true, force: true });
  }
});

test('real audited corpus has 32 unique 2D corner boards, 14 aliases, one 3D exclusion, and immutable source bytes', async () => {
  const real = await loadPieceCatalog();
  assert.equal(real.samples.length, 32);
  assert.equal(real.duplicateAliases.length, 14);
  assert.equal(real.outOfScope.length, 1);
  const before = await verifySourceImage(real.samples[0]);
  const png = await rectifiedBoardPng(real.samples[0]);
  const image = await sharp(png).metadata();
  assert.equal(image.width, 512);
  assert.equal(image.height, 512);
  assert.equal(await verifySourceImage(real.samples[0]), before);
});
