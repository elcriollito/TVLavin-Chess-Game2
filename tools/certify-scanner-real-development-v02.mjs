import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_SQUARES } from './scanner-piece-label-annotator/piece-label-core.js';
import { CORPUS_VERSION, SOURCE_ROOT, deriveIndexes, hash, protectedSources, validateAnnotation,
  validateCorners, validateManifest } from './scanner-real-development/core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parent = resolve(root, '..');
const manifestPath = join(root, 'scanner/recognition/datasets/real-development/real-development-v0.1.json');
const truthPath = join(parent,
  'caissa_scanner_real_development_cohort_v0_1_annotations/real-development-v0.1.annotations.json');
const outputPath = join(root,
  'scanner/recognition/datasets/real-development/real-development-v0.2-certified.json');
const indexesPath = join(root,
  'scanner/recognition/datasets/real-development/real-development-v0.2-indexes.json');
const reportPath = join(root,
  'scanner/recognition/datasets/real-development/certification-v0.2.json');
const CERTIFIED_VERSION = 'caissa-scanner-real-development-v0.2-certified';
const NEAR_GROUP = new Set(['dev-real-v0.1-021', 'dev-real-v0.1-023', 'dev-real-v0.1-024']);
const CLASSES = ['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];

const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digestText = (value) => hash(Buffer.from(stable(value)));
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };
const splitScore = (id) => createHash('sha256').update(`caissa-v0.2-split/317/${id}`).digest('hex');

function canonicalTruth(records) {
  return records.toSorted((a, b) => a.sampleId.localeCompare(b.sampleId)).map((record) => ({
    sampleId: record.sampleId,
    sourceSha256: record.sourceSha256,
    corners: record.corners,
    cornerRevision: record.cornerRevision,
    orientation: record.orientation,
    labels: record.labels,
    placementFen: record.placementFen,
    verification: record.verification,
    metadata: record.metadata
  }));
}

function platformSession(platform) {
  const value = platform.trim().toLowerCase();
  if (value.includes('chessbase')) return 'chessbase';
  if (value.includes('worldchess')) return 'worldchess';
  if (value.includes('playok') || value.includes('plaok')) return 'playok';
  if (value.includes('lichess')) return 'lichess';
  if (value.includes('chess.com') || value.includes('chess,com')) return 'chess.com';
  if (value === 'unknown') return 'unknown';
  return `human-platform-${value}`;
}

function chooseUnits(units, boardTarget) {
  const ordered = units.toSorted((a, b) => splitScore(a.id).localeCompare(splitScore(b.id)));
  const possible = new Map([[0, []]]);
  for (const unit of ordered) {
    for (const [total, picked] of [...possible].toSorted((a, b) => b[0] - a[0])) {
      const next = total + unit.samples.length;
      if (next <= boardTarget && !possible.has(next)) possible.set(next, [...picked, unit]);
    }
  }
  assert(possible.has(boardTarget), `cannot-create-platform-aware-validation-split:${boardTarget}`);
  return possible.get(boardTarget);
}

function makeSplit(records) {
  const unitsById = new Map();
  for (const record of records) {
    const session = platformSession(record.metadata.platform);
    const id = record.metadata.sessionGroup || record.metadata.sourceGroup || `capture-session-2026-09-17/${session}`;
    const unit = unitsById.get(id) || { id, platform: session, samples: [] };
    assert(unit.platform === session, `mixed-platform-source-group:${id}`);
    unit.samples.push(record); unitsById.set(id, unit);
  }
  const validation = new Set();
  for (const unit of chooseUnits([...unitsById.values()], 13)) {
    for (const record of unit.samples) validation.add(record.sampleId);
  }
  assert(validation.size === 13, 'development-validation-count-must-be-13');
  return new Map(records.map((record) => [record.sampleId,
    validation.has(record.sampleId) ? 'validation' : 'train-development']));
}

function support(values, key) {
  return Object.fromEntries([...new Set(values.map((item) => item[key]))].toSorted()
    .map((label) => [label, values.filter((item) => item[key] === label).length]));
}

export async function certify({ sourceRoot = SOURCE_ROOT, write = false } = {}) {
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const truthBytes = await readFile(truthPath);
  const truth = JSON.parse(truthBytes);
  const protectedCatalog = await protectedSources({ repoRoot: root,
    corpusV01: join(parent, 'caissa_scanner_real_localization_corpus_v0_1'),
    corpusV03: join(parent, 'caissa_scanner_real_localization_corpus_v0_3'),
    truthPath: join(parent, 'caissa_scanner_piece_labels_v0_1/piece-labels-v0.1.json') });
  validateManifest(manifest, protectedCatalog);
  assert(manifest.corpusVersion === CORPUS_VERSION && manifest.samples.length === 41, 'source-manifest-count-or-version');
  const sourceManifestSha256 = hash(Buffer.from(stable(manifest)));
  assert(truth.manifestSha256 === sourceManifestSha256, 'annotation-source-manifest-checksum-mismatch');
  assert(truth.sourceRole === 'development-only' && truth.finalBenchmarkUseAllowed === false,
    'annotation-role-not-development-only');
  assert(Array.isArray(truth.samples) && truth.samples.length === 41, 'annotation-record-count-mismatch');
  const bySource = new Map(manifest.samples.map((sample) => [sample.sampleId, sample]));
  const ids = new Set(), sourceHashes = new Set();
  for (const record of truth.samples) {
    assert(!ids.has(record.sampleId), `duplicate-annotation-id:${record.sampleId}`); ids.add(record.sampleId);
    const sample = bySource.get(record.sampleId); assert(sample, `unknown-annotation-id:${record.sampleId}`);
    validateAnnotation(record, sample);
    assert(record.status === 'human-verified', `pending-annotation:${record.sampleId}`);
    assert(record.labels.length === 64 && record.labels.every((label) => CLASSES.includes(label)),
      `invalid-64-label-truth:${record.sampleId}`);
    validateCorners(record.corners, sample.sourceWidth, sample.sourceHeight);
    const sourceBytes = await readFile(join(sourceRoot, sample.sourceFilename));
    assert(hash(sourceBytes) === sample.sourceSha256 && record.sourceSha256 === sample.sourceSha256,
      `source-hash-mismatch:${record.sampleId}`);
    assert(!protectedCatalog.protectedFinalHashes.has(sample.sourceSha256),
      `protected-final-exact-leakage:${record.sampleId}`);
    assert(!sourceHashes.has(sample.sourceSha256), `development-exact-duplicate:${record.sampleId}`);
    sourceHashes.add(sample.sourceSha256);
  }
  assert(ids.size === bySource.size, 'missing-annotation-record');
  const nearRecords = truth.samples.filter((item) => NEAR_GROUP.has(item.sampleId));
  assert(nearRecords.length === 3 && new Set(nearRecords.map((item) => item.placementFen)).size === 3,
    'near-candidates-not-distinct-board-positions');
  for (const record of nearRecords) {
    const source = bySource.get(record.sampleId);
    assert(source.possibleNearProtected.length === 0 && source.possibleNearPeers.length > 0,
      `near-candidate-protected-or-unlinked:${record.sampleId}`);
    assert(record.verification.nearDuplicateReviewedDistinctBy === 'Alexander'
      && record.verification.reviewReason.trim().length >= 10, `near-candidate-human-review-missing:${record.sampleId}`);
  }
  const split = makeSplit(truth.samples);
  const certifiedSamples = truth.samples.toSorted((a, b) => a.sampleId.localeCompare(b.sampleId)).map((record) => {
    const source = bySource.get(record.sampleId);
    const near = NEAR_GROUP.has(record.sampleId);
    const session = `capture-session-2026-09-17/${platformSession(record.metadata.platform)}`;
    return { sampleId: record.sampleId, sourceFilename: source.sourceFilename,
      sourceSha256: source.sourceSha256, sourceWidth: source.sourceWidth, sourceHeight: source.sourceHeight,
      sourceRole: 'development-only', finalBenchmarkUseAllowed: false, developmentUseAllowed: true,
      redistributionAllowed: false, governanceDecision: 'ADMIT DEVELOPMENT',
      governanceReason: near ? 'Distinct human-verified board position; no protected match; grouped with same capture session.'
        : 'Unique source hash with no protected or screened near-duplicate match.',
      possibleNearProtected: source.possibleNearProtected, possibleNearPeers: source.possibleNearPeers,
      sourceGroup: record.metadata.sourceGroup || session,
      sessionGroup: record.metadata.sessionGroup || session,
      split: split.get(record.sampleId), platform: record.metadata.platform,
      platformSubtype: record.metadata.platformSubtype, captureType: record.metadata.captureType,
      sourceCategory: record.metadata.sourceCategory, rightsStatus: record.metadata.rightsStatus,
      subtypeTags: record.metadata.subtypeTags, notes: record.metadata.notes,
      corners: record.corners, cornerRevision: record.cornerRevision, orientation: record.orientation,
      labels: record.labels, placementFen: record.placementFen, humanVerified: true };
  });
  const certified = { schemaVersion: 'caissa-scanner-real-development-certified/2',
    corpusVersion: CERTIFIED_VERSION, sourceCorpusVersion: CORPUS_VERSION, sourceRole: 'development-only',
    finalBenchmarkUseAllowed: false, sourceManifestSha256,
    annotationTruthSha256: digestText(canonicalTruth(truth.samples)), sourceCount: 41,
    admittedCount: 41, heldCount: 0, excludedCount: 0,
    splitPolicy: 'deterministic platform-stratified source groups; 28 train-development / 13 validation; no final-test role',
    samples: certifiedSamples };
  const annotationsForIndexes = { samples: certifiedSamples.map((sample) => ({ sampleId: sample.sampleId,
    sourceSha256: sample.sourceSha256, sourceRole: sample.sourceRole, finalBenchmarkUseAllowed: false,
    status: 'human-verified', corners: sample.corners, cornerRevision: sample.cornerRevision,
    orientation: sample.orientation, labels: sample.labels, placementFen: sample.placementFen,
    verification: { cornersVerifiedBy: 'Alexander', piecesVerifiedBy: 'Alexander', all64Reviewed: true,
      nearDuplicateReviewedDistinctBy: NEAR_GROUP.has(sample.sampleId) ? 'Alexander' : null,
      reviewReason: sample.governanceReason },
    metadata: { platform: sample.platform, platformSubtype: sample.platformSubtype,
      captureType: sample.captureType, sourceCategory: sample.sourceCategory,
      rightsStatus: sample.rightsStatus, developmentUseAllowed: true, redistributionAllowed: false,
      sourceGroup: sample.sourceGroup, sessionGroup: sample.sessionGroup, split: sample.split,
      subtypeTags: sample.subtypeTags, notes: sample.notes } })) };
  const sourceForIndexes = { ...manifest, samples: manifest.samples.map((sample) => ({ ...sample,
    governanceStatus: 'admitted', possibleNearPeers: sample.possibleNearPeers || [] })) };
  const indexes = deriveIndexes(sourceForIndexes, annotationsForIndexes);
  indexes.schemaVersion = 'caissa-scanner-real-development-indexes/2';
  indexes.corpusVersion = CERTIFIED_VERSION;
  for (const item of [...indexes.empty, ...indexes.occupied, ...indexes.kingContrast]) {
    const sample = bySource.get(item.sampleId); const certifiedSample = certifiedSamples.find((row) => row.sampleId === item.sampleId);
    item.sourceHash = item.imageSha256; delete item.imageSha256;
    item.captureType = certifiedSample.captureType;
    item.orientationVersion = certifiedSample.orientation;
    item.sourceFilename = sample.sourceFilename;
  }
  indexes.bNqHard = indexes.occupied.filter((item) => ['B', 'b', 'N', 'n', 'Q', 'q'].includes(item.pieceClass));
  indexes.colorPair = indexes.occupied.map((item) => ({ ...item, colorPair: item.pieceType }));
  const labelCounts = Object.fromEntries(CLASSES.map((label) => [label,
    certifiedSamples.reduce((sum, sample) => sum + sample.labels.filter((value) => value === label).length, 0)]));
  const report = { schemaVersion: 'caissa-scanner-real-development-certification-report/2',
    corpusVersion: CERTIFIED_VERSION, sourceManifestSha256, annotationTruthSha256: certified.annotationTruthSha256,
    rawAnnotationFileSha256: hash(truthBytes), totalSourceBoards: 41, annotationRecords: 41,
    humanVerified: 41, pending: 0, cornerComplete: 41, orientationComplete: 41,
    label64Complete: 41, malformedRecords: 0, duplicateSampleIds: 0, missingSourceHashes: 0,
    invalidPieceLabels: 0, protectedLeakageAdmitted: 0,
    nearDuplicateDecisions: nearRecords.map((record) => ({ sampleId: record.sampleId,
      decision: 'ADMIT DEVELOPMENT', sourceGroup: 'capture-session-2026-09-17/lichess',
      distinctPlacementFen: record.placementFen, possibleNearProtected: [] })),
    splitCounts: { trainDevelopment: certifiedSamples.filter((item) => item.split === 'train-development').length,
      validation: certifiedSamples.filter((item) => item.split === 'validation').length },
    platformCounts: support(certifiedSamples, 'platform'), captureTypeCounts: support(certifiedSamples, 'captureType'),
    sourceCategoryCounts: support(certifiedSamples, 'sourceCategory'), subtypeTagCounts: Object.fromEntries(
      [...new Set(certifiedSamples.flatMap((item) => item.subtypeTags))].toSorted().map((tag) =>
        [tag, certifiedSamples.filter((item) => item.subtypeTags.includes(tag)).length])),
    realEmptySquares: indexes.empty.length, realOccupiedSquares: indexes.occupied.length,
    pieceClassSupport: labelCounts,
    kingContrastSupport: Object.fromEntries(CLASSES.filter((label) =>
      ['empty', 'K', 'k', 'Q', 'q', 'R', 'r', 'B', 'b', 'N', 'n'].includes(label))
      .map((label) => [label, labelCounts[label]])),
    admittedSourceChecksums: certifiedSamples.map((item) => ({ sampleId: item.sampleId,
      sourceSha256: item.sourceSha256, split: item.split })), held: [], excluded: [] };
  if (write) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, stable(certified));
    await writeFile(indexesPath, stable(indexes));
    await writeFile(reportPath, stable(report));
  }
  return { certified, indexes, report, outputPath, indexesPath, reportPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  certify({ write: process.argv.includes('--write') }).then(({ report }) => {
    process.stdout.write(stable(report));
  }).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
}
