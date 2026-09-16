export const ANNOTATION_SCHEMA = 'caissa-scanner-localization-annotations/1';
export const OUTPUT_FILE = 'localization-hard-v0.1.annotated.json';
export const CORNER_KEYS = Object.freeze(['topLeft', 'topRight', 'bottomRight', 'bottomLeft']);
export const CORNER_LABELS = Object.freeze(['TOP-LEFT', 'TOP-RIGHT', 'BOTTOM-RIGHT', 'BOTTOM-LEFT']);
export const SAMPLE_STATUSES = Object.freeze([
  'board-present',
  'board-not-present',
  'unsupported-partial-board',
  'skip-for-now'
]);

function round(value, places) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function cross(a, b, c) {
  return ((b.x - a.x) * (c.y - a.y)) - ((b.y - a.y) * (c.x - a.x));
}

function orientation(a, b, c) {
  const value = cross(a, b, c);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function onSegment(a, b, point) {
  return point.x >= Math.min(a.x, b.x) - 1e-9
    && point.x <= Math.max(a.x, b.x) + 1e-9
    && point.y >= Math.min(a.y, b.y) - 1e-9
    && point.y <= Math.max(a.y, b.y) + 1e-9;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  return o4 === 0 && onSegment(c, d, b);
}

export function mapDisplayPoint({ clientX, clientY, rect, imageWidth, imageHeight }) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
    throw new Error('display-geometry-invalid');
  }
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('source-dimensions-invalid');
  }
  const x = Math.max(0, Math.min(imageWidth, ((clientX - rect.left) / rect.width) * imageWidth));
  const y = Math.max(0, Math.min(imageHeight, ((clientY - rect.top) / rect.height) * imageHeight));
  return Object.freeze({ x: round(x, 3), y: round(y, 3) });
}

export function normalizePoint(point, imageWidth, imageHeight) {
  if (!finitePoint(point) || !(imageWidth > 0) || !(imageHeight > 0)) {
    throw new Error('normalization-input-invalid');
  }
  return Object.freeze({
    x: round(point.x / imageWidth, 6),
    y: round(point.y / imageHeight, 6)
  });
}

export function validateQuadrilateral(points, imageWidth, imageHeight) {
  const reasons = [];
  if (!Array.isArray(points) || points.length !== 4) {
    return Object.freeze({ valid: false, reasons: Object.freeze(['four-corners-required']) });
  }
  if (!(imageWidth > 0) || !(imageHeight > 0)) reasons.push('source-dimensions-invalid');
  if (points.some((point) => !finitePoint(point))) reasons.push('non-finite-corner');
  if (reasons.length) return Object.freeze({ valid: false, reasons: Object.freeze(reasons) });

  const unique = new Set(points.map((point) => `${point.x}:${point.y}`));
  if (unique.size !== 4) reasons.push('duplicate-corner');
  if (points.some((point) => point.x < 0 || point.y < 0 || point.x > imageWidth || point.y > imageHeight)) {
    reasons.push('corner-out-of-bounds');
  }
  if (segmentsIntersect(points[0], points[1], points[2], points[3])
      || segmentsIntersect(points[1], points[2], points[3], points[0])) {
    reasons.push('self-intersection');
  }

  const turns = points.map((point, index) => cross(
    point,
    points[(index + 1) % 4],
    points[(index + 2) % 4]
  ));
  if (turns.some((value) => Math.abs(value) < 1e-9)) reasons.push('zero-area-corner');
  const hasPositive = turns.some((value) => value > 0);
  const hasNegative = turns.some((value) => value < 0);
  if (hasPositive && hasNegative) reasons.push('non-convex');

  const signedTwiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % 4];
    return sum + ((point.x * next.y) - (next.x * point.y));
  }, 0);
  const area = Math.abs(signedTwiceArea) / 2;
  if (area < 1e-6) reasons.push('zero-area');

  return Object.freeze({
    valid: reasons.length === 0,
    reasons: Object.freeze([...new Set(reasons)]),
    area: round(area, 3)
  });
}

export function createAnnotationState(points = []) {
  return Object.freeze({ points: Object.freeze(points.map((point) => Object.freeze({ ...point }))) });
}

export function reduceAnnotationState(state, action) {
  const points = [...(state?.points || [])];
  switch (action?.type) {
    case 'add':
      if (points.length >= 4 || !finitePoint(action.point)) return createAnnotationState(points);
      points.push({ x: action.point.x, y: action.point.y });
      return createAnnotationState(points);
    case 'undo':
      points.pop();
      return createAnnotationState(points);
    case 'reset':
      return createAnnotationState();
    case 'load':
      return createAnnotationState(Array.isArray(action.points) ? action.points.slice(0, 4) : []);
    default:
      return createAnnotationState(points);
  }
}

export async function sha256Hex(bytes) {
  const source = bytes instanceof ArrayBuffer
    ? bytes
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', source);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function verifyChecksum(bytes, expected) {
  const actual = await sha256Hex(bytes);
  return Object.freeze({
    ok: actual === String(expected || '').toUpperCase(),
    expected: String(expected || '').toUpperCase(),
    actual
  });
}

export function cornersFromGroundTruth(sample) {
  const corners = sample?.groundTruth?.playableBoardCorners;
  if (!corners) return [];
  return CORNER_KEYS.map((key) => corners[key]?.pixels).filter(finitePoint);
}

export function isSampleComplete(sample) {
  const status = sample?.annotation?.sampleStatus;
  if (sample?.annotation?.annotationStatus !== 'verified') return false;
  if (status === 'board-not-present' || status === 'unsupported-partial-board') return true;
  return status === 'board-present' && cornersFromGroundTruth(sample).length === 4;
}

export function annotateSample(sourceSample, { status, points = [], imageWidth, imageHeight }) {
  if (!SAMPLE_STATUSES.includes(status)) throw new Error('sample-status-invalid');
  const result = structuredClone(sourceSample);
  result.sourceFilename = String(sourceSample.originalFile || '').split(/[\\/]/).pop();
  result.sourceSha256 = sourceSample.originalSha256;
  result.sourceWidth = imageWidth;
  result.sourceHeight = imageHeight;

  if (status === 'skip-for-now') {
    delete result.groundTruth;
    result.annotation = {
      humanVerifiedBy: 'Alexander',
      annotationStatus: 'skip-for-now',
      sampleStatus: status,
      timestampPolicy: 'omitted-for-determinism'
    };
    return result;
  }

  if (status === 'board-present') {
    const validation = validateQuadrilateral(points, imageWidth, imageHeight);
    if (!validation.valid) throw new Error(validation.reasons.join(','));
    const playableBoardCorners = {};
    CORNER_KEYS.forEach((key, index) => {
      playableBoardCorners[key] = {
        pixels: { x: round(points[index].x, 3), y: round(points[index].y, 3) },
        normalized: normalizePoint(points[index], imageWidth, imageHeight)
      };
    });
    result.boardPresent = true;
    result.groundTruth = { playableBoardCorners };
  } else {
    result.boardPresent = status !== 'board-not-present';
    result.groundTruth = status === 'unsupported-partial-board'
      ? { expectedLocalizationResult: 'unsupported-partial-board' }
      : { expectedLocalizationResult: 'board-not-found' };
  }

  result.annotation = {
    humanVerifiedBy: 'Alexander',
    annotationStatus: 'verified',
    sampleStatus: status,
    cornerOrder: status === 'board-present' ? 'tl-tr-br-bl' : null,
    timestampPolicy: 'omitted-for-determinism'
  };
  return result;
}

export function mergeAnnotationManifest(sourceManifest, annotationsById, sourceManifestSha256) {
  if (!sourceManifest || !Array.isArray(sourceManifest.samples)) throw new Error('source-manifest-invalid');
  const seen = new Set();
  const samples = sourceManifest.samples.map((sample) => {
    if (!sample.sampleId || seen.has(sample.sampleId)) throw new Error('duplicate-sample-id');
    seen.add(sample.sampleId);
    return structuredClone(annotationsById.get(sample.sampleId) || sample);
  });
  const completed = samples.filter(isSampleComplete).length;
  return {
    schemaVersion: ANNOTATION_SCHEMA,
    corpus: sourceManifest.corpus,
    status: completed === samples.length ? 'annotation-complete' : 'annotation-in-progress',
    sourceManifest: {
      file: 'manifest-starter.json',
      sha256: sourceManifestSha256,
      sampleCount: samples.length
    },
    progress: { completed, total: samples.length },
    samples
  };
}

export function hydrateAnnotations(sourceManifest, annotatedManifest) {
  const result = new Map();
  if (!annotatedManifest) return result;
  if (annotatedManifest.schemaVersion !== ANNOTATION_SCHEMA) throw new Error('annotation-schema-unsupported');
  if (annotatedManifest.corpus !== sourceManifest.corpus) throw new Error('annotation-corpus-mismatch');
  const sourceIds = new Set(sourceManifest.samples.map((sample) => sample.sampleId));
  for (const sample of annotatedManifest.samples || []) {
    if (!sourceIds.has(sample.sampleId)) throw new Error('annotation-sample-unknown');
    if (result.has(sample.sampleId)) throw new Error('duplicate-sample-id');
    if (sample.annotation) result.set(sample.sampleId, structuredClone(sample));
  }
  return result;
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
