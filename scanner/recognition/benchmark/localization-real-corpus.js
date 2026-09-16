const CORNER_KEYS = Object.freeze(['topLeft', 'topRight', 'bottomRight', 'bottomLeft']);

function finitePoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
}

function cross(a, b, c) {
  return ((b[0] - a[0]) * (c[1] - b[1])) - ((b[1] - a[1]) * (c[0] - b[0]));
}

export function orderedAnnotationCorners(sample, coordinateSpace = 'pixels') {
  const corners = sample?.groundTruth?.playableBoardCorners;
  if (!corners) return null;
  return CORNER_KEYS.map((key) => {
    const point = corners[key]?.[coordinateSpace];
    return [point?.x, point?.y];
  });
}

export function validateLocalizationCorpus({ manifest, annotation, source, annotationSha256, sourceSha256 }) {
  const errors = [];
  if (manifest?.annotationManifest?.sha256 !== annotationSha256) errors.push('annotation-manifest-checksum-mismatch');
  if (manifest?.sourceManifest?.sha256 !== sourceSha256) errors.push('source-manifest-checksum-mismatch');
  if (manifest?.annotationSchemaVersion !== annotation?.schemaVersion) errors.push('annotation-schema-mismatch');
  if (manifest?.sampleCount !== 14 || annotation?.samples?.length !== 14 || source?.samples?.length !== 14) {
    errors.push('sample-count-mismatch');
  }

  const splitSamples = manifest?.samples || [];
  const splitIds = new Set(splitSamples.map((sample) => sample.sampleId));
  if (splitIds.size !== 14 || splitSamples.length !== 14) errors.push('split-id-duplicate-or-missing');
  if (splitSamples.filter((sample) => sample.split === 'development').length !== 10
      || splitSamples.filter((sample) => sample.split === 'holdout').length !== 4) errors.push('split-count-mismatch');

  const annotationIds = new Set();
  for (const sample of annotation?.samples || []) {
    if (annotationIds.has(sample.sampleId)) errors.push(`${sample.sampleId}:annotation-id-duplicate`);
    annotationIds.add(sample.sampleId);
    const split = splitSamples.find((entry) => entry.sampleId === sample.sampleId);
    const original = source?.samples?.find((entry) => entry.sampleId === sample.sampleId);
    if (!split || !original) {
      errors.push(`${sample.sampleId}:identity-missing`);
      continue;
    }
    if (split.sha256 !== sample.originalSha256 || original.originalSha256 !== sample.originalSha256
        || sample.sourceSha256 !== sample.originalSha256) errors.push(`${sample.sampleId}:checksum-identity-mismatch`);
    if (sample.originalFile !== original.originalFile || sample.sourceFilename !== sample.originalFile?.split('/').at(-1)) {
      errors.push(`${sample.sampleId}:source-path-mismatch`);
    }
    if (sample.boardPresent !== true || original.boardPresent !== true) errors.push(`${sample.sampleId}:board-presence-invalid`);
    if (sample.annotation?.annotationStatus !== 'verified' || sample.annotation?.sampleStatus !== 'board-present'
        || sample.annotation?.cornerOrder !== 'tl-tr-br-bl' || !sample.humanVerifiedByAlexander) {
      errors.push(`${sample.sampleId}:annotation-invalid`);
    }

    const pixels = orderedAnnotationCorners(sample, 'pixels');
    const normalized = orderedAnnotationCorners(sample, 'normalized');
    if (!pixels?.every(finitePoint) || !normalized?.every(finitePoint)) {
      errors.push(`${sample.sampleId}:corners-missing-or-nonfinite`);
      continue;
    }
    if (normalized.flat().some((value) => value < 0 || value > 1)) errors.push(`${sample.sampleId}:normalized-corner-out-of-range`);
    if (!Number.isSafeInteger(sample.sourceWidth) || !Number.isSafeInteger(sample.sourceHeight)
        || sample.sourceWidth <= 0 || sample.sourceHeight <= 0) errors.push(`${sample.sampleId}:source-dimensions-invalid`);
    const normalizedMismatch = pixels.some(([x, y], index) => (
      Math.abs((x / sample.sourceWidth) - normalized[index][0]) > 1e-5
      || Math.abs((y / sample.sourceHeight) - normalized[index][1]) > 1e-5
    ));
    if (normalizedMismatch) errors.push(`${sample.sampleId}:normalized-corner-mismatch`);
    const turns = pixels.map((point, index) => cross(point, pixels[(index + 1) % 4], pixels[(index + 2) % 4]));
    if (turns.some((value) => Math.abs(value) < 1e-6) || !(turns.every((value) => value > 0) || turns.every((value) => value < 0))) {
      errors.push(`${sample.sampleId}:quadrilateral-not-convex`);
    }
    const [[tlx, tly], [trx, try_], [brx, bry], [blx, bly]] = pixels;
    if (tlx >= trx || blx >= brx || tly >= bly || try_ >= bry) errors.push(`${sample.sampleId}:corner-order-invalid`);
  }
  for (const sample of source?.samples || []) {
    if (!annotationIds.has(sample.sampleId)) errors.push(`${sample.sampleId}:annotation-missing`);
  }
  if (errors.length) throw new Error(errors.join(','));
  return Object.freeze({
    sampleCount: annotation.samples.length,
    developmentCount: 10,
    holdoutCount: 4,
    annotationSha256,
    sourceSha256
  });
}

export { CORNER_KEYS };
