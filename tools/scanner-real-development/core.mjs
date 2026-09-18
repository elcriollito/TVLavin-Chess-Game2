import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { CANONICAL_SQUARES, LABELS, ORIENTATIONS, labelsToPlacementFen, validateLabels }
  from '../scanner-piece-label-annotator/piece-label-core.js';

export const CORPUS_VERSION = 'caissa-scanner-real-development-v0.1';
export const MANIFEST_SCHEMA = 'caissa-scanner-real-development-manifest/1';
export const ANNOTATION_SCHEMA = 'caissa-scanner-real-development-annotations/1';
export const SOURCE_ROOT = 'C:/Users/ALEXANDER/Alexander Projects/caissa_scanner_real_development_cohort_v0_1';
export const ANNOTATION_ROOT = 'C:/Users/ALEXANDER/Alexander Projects/caissa_scanner_real_development_cohort_v0_1_annotations';
export const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const EMPTY_SUBTYPES = Object.freeze(['plain-digital', 'highlighted', 'arrow-overlay', 'coordinate-edge',
  'screen-glare', 'moire', 'compression', 'wood', 'dark-theme', 'light-theme', 'print', 'paper-texture',
  'hatched', 'low-contrast', 'livestream', 'photo-of-screen']);
const HASH = /^[A-F0-9]{64}$/;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };
const compareNames = (a, b) => a.normalize('NFC').toLowerCase().localeCompare(b.normalize('NFC').toLowerCase(), 'en');

export async function fingerprint(bytes) {
  // Difference hashes and low-frequency DCT hashes for whole image and center.
  // These are candidate screens, not proof that two source frames match.
  const dhash = async (fit) => {
    const pixels = await sharp(bytes, { failOn: 'error' }).rotate().resize(9, 8, { fit, position: 'centre' })
      .greyscale().raw().toBuffer();
    let bits = 0n;
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      bits = (bits << 1n) | BigInt(pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? 1 : 0);
    }
    return bits.toString(16).toUpperCase().padStart(16, '0');
  };
  const phash = async (fit) => {
    const pixels = await sharp(bytes, { failOn: 'error' }).rotate().resize(32, 32, { fit, position: 'centre' })
      .greyscale().raw().toBuffer();
    const cosine = Array.from({ length: 8 }, (_, frequency) =>
      Array.from({ length: 32 }, (_, position) => Math.cos((2 * position + 1) * frequency * Math.PI / 64)));
    const coefficients = [];
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      let value = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        value += pixels[y * 32 + x] * cosine[u][x] * cosine[v][y];
      }
      coefficients.push(value);
    }
    const ordered = coefficients.slice(1).toSorted((a, b) => a - b);
    const median = ordered[Math.floor(ordered.length / 2)];
    let bits = 0n;
    for (const value of coefficients) bits = (bits << 1n) | BigInt(value > median ? 1 : 0);
    return bits.toString(16).toUpperCase().padStart(16, '0');
  };
  return { fullDhash64: await dhash('fill'), centerDhash64: await dhash('cover'),
    fullPhash64: await phash('fill'), centerPhash64: await phash('cover') };
}

export function hamming64(left, right) {
  assert(/^[A-F0-9]{16}$/.test(left) && /^[A-F0-9]{16}$/.test(right), 'invalid-fingerprint');
  let bits = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (bits) { count += Number(bits & 1n); bits >>= 1n; }
  return count;
}

export function possibleNearDuplicate(a, b) {
  return hamming64(a.fullDhash64, b.fullDhash64) <= 4
    || hamming64(a.centerDhash64, b.centerDhash64) <= 3
    || (a.fullPhash64 && b.fullPhash64 && hamming64(a.fullPhash64, b.fullPhash64) <= 8)
    || (a.centerPhash64 && b.centerPhash64 && hamming64(a.centerPhash64, b.centerPhash64) <= 6);
}

async function imageInfo(path, name) {
  const bytes = await readFile(path);
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata();
  assert(metadata.width >= 64 && metadata.height >= 64 && metadata.width <= 8000 && metadata.height <= 8000,
    'unsupported-image-dimensions');
  return { sourceFilename: name, extension: extname(name).toLowerCase(), sourceBytes: bytes.length,
    sourceWidth: metadata.width, sourceHeight: metadata.height, sourceSha256: sha(bytes),
    fingerprint: await fingerprint(bytes) };
}

export async function inventorySources(folder = SOURCE_ROOT) {
  const entries = await readdir(folder, { withFileTypes: true });
  const imageNames = entries.filter((entry) => entry.isFile() && SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name).sort(compareNames);
  const unsupported = entries.filter((entry) => !entry.isFile() || !SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name).sort(compareNames);
  assert(new Set(imageNames.map((name) => name.normalize('NFC').toLowerCase())).size === imageNames.length,
    'normalized-filename-collision');
  const samples = [];
  for (const [index, name] of imageNames.entries()) {
    samples.push({ sampleId: `dev-real-v0.1-${String(index + 1).padStart(3, '0')}`,
      ...await imageInfo(join(folder, name), name) });
  }
  return { samples, unsupported };
}

export async function protectedSources({ repoRoot, corpusV01, corpusV03, truthPath }) {
  const v01Manifest = JSON.parse(await readFile(join(repoRoot,
    'scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.1.json')));
  const v01Annotations = JSON.parse(await readFile(join(corpusV01, v01Manifest.annotationManifest.file)));
  const v03Starter = JSON.parse(await readFile(join(corpusV03, 'manifest-starter-v0.3.json')));
  const fresh = JSON.parse(await readFile(join(repoRoot,
    'scanner/recognition/datasets/pieces/catalog/fresh-evaluation-candidates-v0.1.json')));
  const truth = JSON.parse(await readFile(truthPath));
  const cataloged = [
    ...v01Annotations.samples.map((item) => ({ sampleId: item.sampleId, sourceSha256: item.originalSha256,
      path: join(corpusV01, ...item.originalFile.split('/')) })),
    ...v03Starter.samples.map((item) => ({ sampleId: item.sampleId, sourceSha256: item.originalSha256,
      path: join(corpusV03, ...item.originalFile.split('/')) }))
  ];
  const hashes = new Set(cataloged.map((item) => item.sourceSha256));
  for (const item of fresh.candidates) assert(hashes.has(item.originalSha256), 'fresh-catalog-source-not-protected');
  for (const item of truth.samples) assert(hashes.has(item.sourceSha256), 'final-truth-source-not-protected');
  const protectedIds = new Set([...cataloged.map((item) => item.sampleId),
    ...fresh.candidates.map((item) => item.candidateId), ...truth.samples.map((item) => item.sampleId)]);
  const unique = new Map();
  for (const item of cataloged) if (!unique.has(item.sourceSha256)) unique.set(item.sourceSha256, item);
  const sources = [];
  for (const item of unique.values()) {
    const info = await imageInfo(item.path, basename(item.path));
    assert(info.sourceSha256 === item.sourceSha256, `${item.sampleId}: protected-source-checksum-mismatch`);
    sources.push({ sampleId: item.sampleId, sourceSha256: item.sourceSha256, fingerprint: info.fingerprint });
  }
  return { sources, protectedIds, protectedFinalHashes: new Set(truth.samples
    .filter((item) => item.annotation?.status === 'verified').map((item) => item.sourceSha256)) };
}

export function auditInventory(inventory, protectedCatalog) {
  const seen = new Map();
  const samples = inventory.samples.map((item) => {
    const exactProtected = protectedCatalog.sources.find((source) => source.sourceSha256 === item.sourceSha256);
    const exactLocal = seen.get(item.sourceSha256);
    if (!exactLocal) seen.set(item.sourceSha256, item.sampleId);
    const nearProtected = exactProtected ? [] : protectedCatalog.sources.filter((source) =>
      possibleNearDuplicate(item.fingerprint, source.fingerprint)).map((source) => source.sampleId);
    return { ...item, sourceRole: 'development-only', platform: 'unknown', platformSubtype: 'unknown',
      captureType: 'unknown', sourceCategory: 'unknown', rightsStatus: 'user-provided-internal-research',
      developmentUseAllowed: true, redistributionAllowed: false, humanVerified: false, notes: '',
      sourceGroup: null, sessionGroup: null, split: 'unassigned', subtypeTags: [],
      duplicateOf: exactProtected?.sampleId || exactLocal || null,
      protectedSourceId: exactProtected?.sampleId || null, possibleNearProtected: nearProtected,
      possibleNearPeers: [], governanceStatus: exactProtected || exactLocal ? 'excluded-exact-duplicate'
        : nearProtected.length ? 'review-required' : 'admitted' };
  });
  for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
    if (samples[i].sourceSha256 === samples[j].sourceSha256) continue;
    if (possibleNearDuplicate(samples[i].fingerprint, samples[j].fingerprint)) {
      samples[i].possibleNearPeers.push(samples[j].sampleId);
      samples[j].possibleNearPeers.push(samples[i].sampleId);
      if (samples[i].governanceStatus === 'admitted') samples[i].governanceStatus = 'review-required';
      if (samples[j].governanceStatus === 'admitted') samples[j].governanceStatus = 'review-required';
    }
  }
  const result = { schemaVersion: MANIFEST_SCHEMA, corpusVersion: CORPUS_VERSION,
    sourceRole: 'development-only', finalBenchmarkUseAllowed: false, sourceCount: samples.length,
    unsupportedFiles: inventory.unsupported, samples };
  result.summary = summary(result);
  validateManifest(result, protectedCatalog);
  return result;
}

export function validateManifest(manifest, protectedCatalog) {
  assert(manifest?.schemaVersion === MANIFEST_SCHEMA && manifest.corpusVersion === CORPUS_VERSION
    && manifest.sourceRole === 'development-only' && manifest.finalBenchmarkUseAllowed === false,
  'development-role-required');
  assert(Array.isArray(manifest.samples) && manifest.sourceCount === manifest.samples.length,
    'source-count-mismatch');
  const ids = new Set(), hashes = new Set();
  for (const [index, sample] of manifest.samples.entries()) {
    assert(sample.sampleId === `dev-real-v0.1-${String(index + 1).padStart(3, '0')}` && !ids.has(sample.sampleId),
      'deterministic-id-required');
    ids.add(sample.sampleId);
    assert(HASH.test(sample.sourceSha256) && sample.sourceRole === 'development-only'
      && sample.developmentUseAllowed === true && sample.redistributionAllowed === false,
    'development-governance-required');
    assert(!protectedCatalog.protectedIds.has(sample.sampleId), 'protected-id-overlap');
    const exactProtected = protectedCatalog.sources.find((item) => item.sourceSha256 === sample.sourceSha256);
    if (exactProtected) assert(sample.governanceStatus === 'excluded-exact-duplicate'
      && sample.protectedSourceId === exactProtected.sampleId && sample.duplicateOf,
    'protected-exact-duplicate-not-excluded');
    else assert(sample.protectedSourceId === null, 'unexpected-protected-reference');
    if (hashes.has(sample.sourceSha256)) assert(sample.governanceStatus === 'excluded-exact-duplicate',
      'local-exact-duplicate-not-excluded');
    if (sample.governanceStatus !== 'excluded-exact-duplicate') {
      assert(sample.duplicateOf === null, 'unexpected-duplicate-reference');
    }
    hashes.add(sample.sourceSha256);
    if (sample.possibleNearProtected.length || sample.possibleNearPeers.length) {
      assert(['review-required', 'excluded-exact-duplicate'].includes(sample.governanceStatus),
        'near-duplicate-not-held-for-review');
    }
    assert(['admitted', 'review-required', 'excluded-exact-duplicate'].includes(sample.governanceStatus),
      'invalid-governance-status');
  }
  assert(JSON.stringify(manifest.summary) === JSON.stringify(summary(manifest)), 'manifest-summary-mismatch');
  return manifest;
}

export function summary(manifest, annotations = { samples: [] }) {
  const values = manifest.samples;
  const records = new Map(annotations.samples.map((item) => [item.sampleId, item]));
  return { corpusVersion: CORPUS_VERSION, sourceCount: values.length,
    exactUniqueImages: new Set(values.map((item) => item.sourceSha256)).size,
    exactProtectedDuplicates: values.filter((item) => item.protectedSourceId).length,
    nearDuplicateReviewCandidates: values.filter((item) => item.governanceStatus === 'review-required').length,
    admittedDevelopmentSamples: values.filter((item) => item.governanceStatus === 'admitted').length,
    excludedSamples: values.filter((item) => item.governanceStatus === 'excluded-exact-duplicate').length,
    annotated: annotations.samples.length,
    humanVerified: annotations.samples.filter((item) => item.status === 'human-verified').length,
    platformKnown: annotations.samples.filter((item) => item.metadata?.platform && item.metadata.platform !== 'unknown').length,
    developmentUseAllowed: values.filter((item) =>
      records.get(item.sampleId)?.metadata?.developmentUseAllowed ?? item.developmentUseAllowed).length,
    redistributionAllowed: values.filter((item) => item.redistributionAllowed).length,
    splitStatus: 'unassigned-until-human-governance' };
}

export function validateCorners(corners, width, height) {
  assert(Array.isArray(corners) && corners.length === 4 && corners.every((point) =>
    Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
    && point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height),
  'four-playable-field-corners-required');
  const area = corners.reduce((sum, point, index) => {
    const next = corners[(index + 1) % 4];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  assert(area > width * height * 0.01, 'invalid-corner-order-or-area');
  const turns = corners.map((point, index) => {
    const b = corners[(index + 1) % 4], c = corners[(index + 2) % 4];
    return (b[0] - point[0]) * (c[1] - b[1]) - (b[1] - point[1]) * (c[0] - b[0]);
  });
  assert(turns.every((value) => value > width * height * 0.0001), 'non-convex-or-degenerate-corners');
  return corners;
}

export function validateAnnotation(record, sample) {
  assert(record?.sampleId === sample.sampleId && record.sourceSha256 === sample.sourceSha256,
    'annotation-source-mismatch');
  assert(record.sourceRole === 'development-only' && record.finalBenchmarkUseAllowed === false,
    'annotation-role-invalid');
  assert(['unreviewed', 'corners-draft', 'corners-verified', 'pieces-draft', 'human-verified', 'excluded']
    .includes(record.status), 'annotation-status-invalid');
  assert(record.metadata && typeof record.metadata === 'object'
    && typeof record.metadata.developmentUseAllowed === 'boolean'
    && record.metadata.redistributionAllowed === false
    && ['user-provided-internal-research', 'evaluation-only', 'blocked'].includes(record.metadata.rightsStatus),
  'metadata-development-permission-required');
  if (!record.metadata.developmentUseAllowed) {
    assert(record.metadata.split === 'unassigned', 'non-development-source-cannot-be-split');
  }
  if (record.metadata.rightsStatus !== 'user-provided-internal-research') {
    assert(record.metadata.developmentUseAllowed === false, 'unclear-rights-must-be-evaluation-only');
  }
  assert(Array.isArray(record.metadata.subtypeTags)
    && record.metadata.subtypeTags.every((tag) => EMPTY_SUBTYPES.includes(tag)), 'invalid-empty-subtype');
  assert(['unassigned', 'train-development', 'validation'].includes(record.metadata.split), 'invalid-development-split');
  if (record.status === 'corners-draft') {
    assert(Array.isArray(record.corners) && record.corners.length <= 4 && record.corners.every((point) =>
      Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
      && point[0] >= 0 && point[0] <= sample.sourceWidth && point[1] >= 0 && point[1] <= sample.sourceHeight),
    'corner-draft-invalid');
  } else if (record.status !== 'unreviewed' && record.status !== 'excluded') {
    validateCorners(record.corners, sample.sourceWidth, sample.sourceHeight);
  }
  if (['corners-verified', 'pieces-draft', 'human-verified'].includes(record.status)) {
    assert(record.verification?.cornersVerifiedBy === 'Alexander', 'human-corner-verification-required');
    assert(record.cornerRevision === hash(Buffer.from(JSON.stringify(record.corners))), 'corner-revision-mismatch');
  }
  if (['pieces-draft', 'human-verified'].includes(record.status)) {
    validateLabels(record.labels);
    assert(ORIENTATIONS.includes(record.orientation), 'explicit-orientation-required');
    assert(record.placementFen === labelsToPlacementFen(record.labels), 'placement-fen-mismatch');
  }
  if (record.status === 'human-verified') {
    assert(sample.governanceStatus === 'admitted' || (record.verification?.nearDuplicateReviewedDistinctBy === 'Alexander'
      && typeof record.verification.reviewReason === 'string' && record.verification.reviewReason.trim().length >= 10),
      'near-duplicate-review-required');
    assert(sample.governanceStatus !== 'excluded-exact-duplicate', 'excluded-source-cannot-be-truth');
    assert(record.verification?.piecesVerifiedBy === 'Alexander'
      && record.verification?.all64Reviewed === true, 'human-piece-verification-required');
  }
  if (sample.governanceStatus === 'excluded-exact-duplicate') assert(record.status === 'excluded',
    'exact-duplicate-must-remain-excluded');
  if (record.status === 'excluded') assert(typeof record.metadata.notes === 'string'
    && record.metadata.notes.trim().length >= 5, 'exclusion-reason-required');
  return record;
}

export function validateSplitIsolation(manifest, annotations) {
  const splitById = new Map(annotations.samples.map((item) => [item.sampleId, item.metadata?.split || 'unassigned']));
  for (const sample of manifest.samples) {
    const split = splitById.get(sample.sampleId);
    if (!split || split === 'unassigned') continue;
    assert(sample.governanceStatus !== 'excluded-exact-duplicate', 'excluded-sample-in-split');
    for (const peer of sample.possibleNearPeers) {
      const peerSplit = splitById.get(peer);
      assert(!peerSplit || peerSplit === 'unassigned' || peerSplit === split, 'near-duplicate-split-leakage');
    }
  }
  const groups = new Map();
  for (const item of annotations.samples) {
    const split = item.metadata?.split;
    for (const group of [item.metadata?.sourceGroup, item.metadata?.sessionGroup].filter(Boolean)) {
      const prior = groups.get(group);
      assert(!prior || prior === split || prior === 'unassigned' || split === 'unassigned', 'source-group-split-leakage');
      groups.set(group, split);
    }
  }
  return true;
}

export function deriveIndexes(manifest, annotations) {
  validateSplitIsolation(manifest, annotations);
  const eligible = new Map(manifest.samples.map((sample) => [sample.sampleId, sample]));
  const empty = [], occupied = [], kingContrast = [];
  for (const record of annotations.samples) {
    const source = eligible.get(record.sampleId);
    if (!source || record.status !== 'human-verified' || record.metadata.split === 'unassigned'
      || !record.metadata.developmentUseAllowed) continue;
    validateAnnotation(record, source);
    for (let index = 0; index < 64; index++) {
      const pieceClass = record.labels[index];
      const common = { sampleId: record.sampleId, square: CANONICAL_SQUARES[index],
        sourceCategory: record.metadata.sourceCategory, platform: record.metadata.platform,
        subtypeTags: record.metadata.subtypeTags, split: record.metadata.split,
        imageSha256: source.sourceSha256, cornerTruthVersion: record.cornerRevision };
      if (pieceClass === 'empty') empty.push({ ...common, label: 'empty' });
      else occupied.push({ ...common, pieceClass, color: pieceClass === pieceClass.toUpperCase() ? 'white' : 'black',
        pieceType: pieceClass.toUpperCase() });
      if (['empty', 'K', 'k', 'Q', 'q', 'B', 'b', 'R', 'r', 'N', 'n'].includes(pieceClass)) {
        kingContrast.push({ ...common, pieceClass });
      }
    }
  }
  return { schemaVersion: 'caissa-scanner-real-development-indexes/1', corpusVersion: CORPUS_VERSION,
    sourceRole: 'development-only', empty, occupied, kingContrast };
}

export function hash(bytes) { return sha(bytes); }
