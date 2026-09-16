import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCHMARK_SCHEMA_VERSION = 'caissa-scanner-benchmark/1';
export const MANIFEST_SCHEMA_VERSION = 'caissa-scanner-benchmark-manifest/1';
export const PIECE_CLASSES = Object.freeze([
  'empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'
]);

export const BENCHMARK_CATEGORIES = Object.freeze([
  'clean-digital-diagram',
  'app-or-site-screenshot',
  'printed-modern-book',
  'old-or-yellowed-book',
  'physical-chessboard',
  'moderate-perspective',
  'rotation',
  'shadow',
  'glare',
  'blur',
  'low-resolution',
  'compression-artifact',
  'coordinates',
  'annotation-or-highlight',
  'unusual-valid-board-color',
  'multiple-board-hard-negative',
  'non-board-hard-negative',
  'partial-or-cropped-board'
]);

export const DEFAULT_EXCLUSIVE_GROUPS = Object.freeze([
  'sourceGroup',
  'positionGroup',
  'pieceFamilyGroup',
  'augmentationFamilyGroup'
]);

const PIECE_CLASS_SET = new Set(PIECE_CLASSES);
const CATEGORY_SET = new Set(BENCHMARK_CATEGORIES);
const SPLITS = new Set(['train', 'development', 'test']);
const SOURCE_TYPES = new Set(['controlled-photo', 'licensed-diagram', 'screenshot', 'book-photo', 'consented-user', 'hard-negative', 'test-fixture']);
const CONSENT_STATUSES = new Set(['not-required', 'internal-only', 'explicitly-consented', 'prohibited-from-training']);
const ORIENTATIONS = new Set(['white-at-bottom', 'black-at-bottom', 'rotated-90', 'rotated-270', 'unknown']);
const CHECKSUM_PATTERN = /^sha256:[a-f0-9]{64}$/;

function addError(errors, pathName, code, message) {
  errors.push({ path: pathName, code, message });
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function fenPlacementToLabels(fenPlacement) {
  if (!hasText(fenPlacement)) throw new Error('FEN placement must be a non-empty string.');
  const ranks = fenPlacement.split('/');
  if (ranks.length !== 8) throw new Error('FEN placement must contain exactly 8 ranks.');
  const labels = [];
  for (const rank of ranks) {
    let fileCount = 0;
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) {
        const emptyCount = Number(token);
        fileCount += emptyCount;
        for (let index = 0; index < emptyCount; index += 1) labels.push('empty');
      } else if (PIECE_CLASS_SET.has(token) && token !== 'empty') {
        fileCount += 1;
        labels.push(token);
      } else {
        throw new Error(`Invalid FEN placement token: ${token}`);
      }
    }
    if (fileCount !== 8) throw new Error('Every FEN placement rank must describe exactly 8 squares.');
  }
  if (labels.length !== 64) throw new Error('FEN placement must describe exactly 64 squares.');
  return labels;
}

export function labelsToFenPlacement(labels) {
  if (!Array.isArray(labels) || labels.length !== 64) {
    throw new Error('Square labels must contain exactly 64 entries.');
  }
  const ranks = [];
  for (let row = 0; row < 8; row += 1) {
    let rank = '';
    let emptyCount = 0;
    for (let col = 0; col < 8; col += 1) {
      const label = labels[row * 8 + col];
      if (!PIECE_CLASS_SET.has(label)) throw new Error(`Invalid square class at index ${row * 8 + col}.`);
      if (label === 'empty') {
        emptyCount += 1;
      } else {
        if (emptyCount) rank += String(emptyCount);
        emptyCount = 0;
        rank += label;
      }
    }
    if (emptyCount) rank += String(emptyCount);
    ranks.push(rank);
  }
  return ranks.join('/');
}

export function validateSquareGroundTruth(squareLabels, fenPlacement, pathName = 'groundTruth') {
  const errors = [];
  if (!Array.isArray(squareLabels) || squareLabels.length !== 64) {
    addError(errors, `${pathName}.squareLabels`, 'INVALID_LABEL_COUNT', 'Square labels must contain exactly 64 entries in a8-to-h1 row-major order.');
    return { ok: false, errors };
  }
  squareLabels.forEach((label, index) => {
    if (!PIECE_CLASS_SET.has(label)) {
      addError(errors, `${pathName}.squareLabels[${index}]`, 'INVALID_PIECE_CLASS', `Unsupported square class: ${String(label)}`);
    }
  });
  if (errors.length) return { ok: false, errors };

  try {
    const fenLabels = fenPlacementToLabels(fenPlacement);
    if (fenLabels.some((label, index) => label !== squareLabels[index])) {
      addError(errors, pathName, 'FEN_LABEL_MISMATCH', 'Square labels do not match the FEN placement in a8-to-h1 order.');
    }
  } catch (error) {
    addError(errors, `${pathName}.fenPlacement`, 'INVALID_FEN_PLACEMENT', error.message);
  }
  return { ok: errors.length === 0, errors };
}

function validateCorners(corners, pathName, errors) {
  if (corners === undefined) return;
  if (!Array.isArray(corners) || corners.length !== 4 || corners.some((point) => (
    !Array.isArray(point) || point.length !== 2 || point.some((coordinate) => !Number.isFinite(coordinate))
  ))) {
    addError(errors, pathName, 'INVALID_BOARD_CORNERS', 'Board corners must be four finite [x,y] points in TL, TR, BR, BL order.');
  }
}

export function validateBenchmarkSample(sample, index = 0) {
  const errors = [];
  const base = `samples[${index}]`;
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    addError(errors, base, 'INVALID_SAMPLE', 'Benchmark sample must be an object.');
    return { ok: false, errors };
  }

  if (!hasText(sample.sampleId)) addError(errors, `${base}.sampleId`, 'MISSING_SAMPLE_ID', 'sampleId is required.');
  if (sample.schemaVersion !== BENCHMARK_SCHEMA_VERSION) addError(errors, `${base}.schemaVersion`, 'UNSUPPORTED_SAMPLE_SCHEMA', `Expected ${BENCHMARK_SCHEMA_VERSION}.`);
  if (!SOURCE_TYPES.has(sample.sourceType)) addError(errors, `${base}.sourceType`, 'INVALID_SOURCE_TYPE', 'sourceType is unsupported.');
  if (!sample.sourceReference || !['repository-fixture', 'external-local', 'uri'].includes(sample.sourceReference.kind) || !hasText(sample.sourceReference.value)) {
    addError(errors, `${base}.sourceReference`, 'INVALID_SOURCE_REFERENCE', 'sourceReference requires a supported kind and non-empty value.');
  }
  if (!CHECKSUM_PATTERN.test(sample.sourceChecksum || '')) addError(errors, `${base}.sourceChecksum`, 'INVALID_SOURCE_CHECKSUM', 'sourceChecksum must be sha256 followed by 64 lowercase hexadecimal characters.');
  if (!sample.provenance || !hasText(sample.provenance.origin) || !hasText(sample.provenance.license)) {
    addError(errors, `${base}.provenance`, 'INVALID_PROVENANCE', 'provenance.origin and provenance.license are required.');
  }
  if (!CONSENT_STATUSES.has(sample.consentStatus)) addError(errors, `${base}.consentStatus`, 'INVALID_CONSENT_STATUS', 'consentStatus is unsupported.');
  if (!Number.isSafeInteger(sample.imageWidth) || sample.imageWidth <= 0 || !Number.isSafeInteger(sample.imageHeight) || sample.imageHeight <= 0) {
    addError(errors, base, 'INVALID_IMAGE_DIMENSIONS', 'imageWidth and imageHeight must be positive safe integers.');
  }
  if (!SPLITS.has(sample.split)) addError(errors, `${base}.split`, 'INVALID_SPLIT', 'split must be train, development, or test.');
  if (!Array.isArray(sample.categories) || sample.categories.length === 0 || sample.categories.some((category) => !CATEGORY_SET.has(category))) {
    addError(errors, `${base}.categories`, 'INVALID_CATEGORIES', 'categories must contain one or more registered benchmark categories.');
  }
  if (!sample.conditions || typeof sample.conditions !== 'object' || Array.isArray(sample.conditions)) {
    addError(errors, `${base}.conditions`, 'INVALID_CONDITIONS', 'conditions must be an object; individual condition fields are optional.');
  }
  if (!sample.grouping || typeof sample.grouping !== 'object') {
    addError(errors, `${base}.grouping`, 'INVALID_GROUPING', 'grouping is required.');
  } else {
    for (const group of ['sourceGroup', 'positionGroup', 'pieceFamilyGroup', 'boardThemeGroup', 'augmentationFamilyGroup']) {
      if (!hasText(sample.grouping[group])) addError(errors, `${base}.grouping.${group}`, 'MISSING_GROUP', `${group} is required.`);
    }
  }

  if (!sample.groundTruth || typeof sample.groundTruth.boardPresent !== 'boolean') {
    addError(errors, `${base}.groundTruth`, 'INVALID_GROUND_TRUTH', 'groundTruth.boardPresent is required.');
  } else {
    validateCorners(sample.groundTruth.boardCorners, `${base}.groundTruth.boardCorners`, errors);
    if (sample.groundTruth.orientation !== undefined && !ORIENTATIONS.has(sample.groundTruth.orientation)) {
      addError(errors, `${base}.groundTruth.orientation`, 'INVALID_ORIENTATION', 'Ground-truth orientation is unsupported.');
    }
    if (sample.groundTruth.boardPresent) {
      const groundTruthValidation = validateSquareGroundTruth(
        sample.groundTruth.squareLabels,
        sample.groundTruth.fenPlacement,
        `${base}.groundTruth`
      );
      errors.push(...groundTruthValidation.errors);
    } else if (sample.groundTruth.fenPlacement !== undefined || sample.groundTruth.squareLabels !== undefined) {
      addError(errors, `${base}.groundTruth`, 'NEGATIVE_SAMPLE_HAS_POSITION', 'A no-board sample must not contain placement or square labels.');
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateGroupedSplits(samples, exclusiveGroups = DEFAULT_EXCLUSIVE_GROUPS) {
  const errors = [];
  for (const group of exclusiveGroups) {
    const groups = new Map();
    samples.forEach((sample, index) => {
      const value = sample?.grouping?.[group];
      if (!hasText(value) || !SPLITS.has(sample?.split)) return;
      if (!groups.has(value)) groups.set(value, { splits: new Set(), indexes: [] });
      groups.get(value).splits.add(sample.split);
      groups.get(value).indexes.push(index);
    });
    for (const [value, record] of groups) {
      if (record.splits.size > 1) {
        addError(
          errors,
          `grouping.${group}`,
          'GROUP_SPLIT_LEAKAGE',
          `${group}=${value} appears in multiple splits: ${[...record.splits].sort().join(', ')}.`
        );
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateBenchmarkManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: [{ path: '', code: 'INVALID_MANIFEST', message: 'Manifest must be an object.' }] };
  }
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) addError(errors, 'schemaVersion', 'UNSUPPORTED_MANIFEST_SCHEMA', `Expected ${MANIFEST_SCHEMA_VERSION}.`);
  if (!/^scanner-realworld-v\d+\.\d+$/.test(manifest.benchmarkVersion || '')) addError(errors, 'benchmarkVersion', 'INVALID_BENCHMARK_VERSION', 'benchmarkVersion must use scanner-realworld-vMAJOR.MINOR.');
  if (!hasText(manifest.description)) addError(errors, 'description', 'MISSING_DESCRIPTION', 'description is required.');
  if (!manifest.splitPolicy || !Array.isArray(manifest.splitPolicy.exclusiveGroups) || manifest.splitPolicy.exclusiveGroups.length === 0) {
    addError(errors, 'splitPolicy.exclusiveGroups', 'INVALID_SPLIT_POLICY', 'An explicit non-empty grouped split policy is required.');
  }
  if (!Array.isArray(manifest.samples)) {
    addError(errors, 'samples', 'INVALID_SAMPLES', 'samples must be an array.');
    return { ok: false, errors };
  }

  const ids = new Set();
  manifest.samples.forEach((sample, index) => {
    const sampleValidation = validateBenchmarkSample(sample, index);
    errors.push(...sampleValidation.errors);
    if (hasText(sample?.sampleId)) {
      if (ids.has(sample.sampleId)) addError(errors, `samples[${index}].sampleId`, 'DUPLICATE_SAMPLE_ID', `Duplicate sampleId: ${sample.sampleId}`);
      ids.add(sample.sampleId);
    }
  });
  if (manifest.splitPolicy?.exclusiveGroups) {
    const splitValidation = validateGroupedSplits(manifest.samples, manifest.splitPolicy.exclusiveGroups);
    errors.push(...splitValidation.errors);
  }
  return { ok: errors.length === 0, errors };
}

export function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export async function sha256File(filePath) {
  return sha256Bytes(await readFile(filePath));
}

export async function verifyRepositoryFixtureChecksum(sample, fixtureRoot) {
  if (sample?.sourceReference?.kind !== 'repository-fixture') {
    return { ok: false, code: 'UNSUPPORTED_REFERENCE_KIND', expected: sample?.sourceChecksum || null, actual: null };
  }
  const root = path.resolve(fixtureRoot instanceof URL ? fileURLToPath(fixtureRoot) : fixtureRoot);
  const resolved = path.resolve(root, sample.sourceReference.value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, code: 'REFERENCE_OUTSIDE_FIXTURE_ROOT', expected: sample.sourceChecksum, actual: null };
  }
  const actual = await sha256File(resolved);
  return {
    ok: actual === sample.sourceChecksum,
    code: actual === sample.sourceChecksum ? null : 'CHECKSUM_MISMATCH',
    expected: sample.sourceChecksum,
    actual
  };
}
