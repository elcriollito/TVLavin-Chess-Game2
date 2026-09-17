export const PIECE_LABEL_SCHEMA = 'caissa-scanner-piece-labels/1';
export const SQUARE_ORDER = 'a8-to-h1';
export const LABELS = Object.freeze(['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
export const ORIENTATIONS = Object.freeze(['white-at-bottom', 'black-at-bottom']);
export const CANONICAL_SQUARES = Object.freeze(Array.from({ length: 64 }, (_, index) =>
  `${String.fromCharCode(97 + index % 8)}${8 - Math.floor(index / 8)}`));
const ALLOWED = new Set(LABELS);
const HASH = /^[A-F0-9]{64}$/;

function requireCondition(condition, reason) { if (!condition) throw new Error(reason); }

export function validateLabels(labels) {
  requireCondition(Array.isArray(labels) && labels.length === 64, 'exactly-64-labels-required');
  requireCondition(labels.every((label) => ALLOWED.has(label)), 'invalid-piece-label');
  return labels;
}

export function canonicalIndexForImageIndex(imageIndex, orientation) {
  requireCondition(Number.isInteger(imageIndex) && imageIndex >= 0 && imageIndex < 64, 'image-square-out-of-range');
  requireCondition(ORIENTATIONS.includes(orientation), 'orientation-required');
  return orientation === 'white-at-bottom' ? imageIndex : 63 - imageIndex;
}

export function squareForImageIndex(imageIndex, orientation) {
  return CANONICAL_SQUARES[canonicalIndexForImageIndex(imageIndex, orientation)];
}

export function canonicalToImageLabels(labels, orientation) {
  validateLabels(labels);
  requireCondition(ORIENTATIONS.includes(orientation), 'orientation-required');
  return orientation === 'white-at-bottom' ? [...labels] : [...labels].reverse();
}

export function reorientLabelsPreservingImage(labels, priorOrientation, nextOrientation) {
  validateLabels(labels);
  requireCondition(ORIENTATIONS.includes(nextOrientation), 'orientation-required');
  if (priorOrientation === null || priorOrientation === nextOrientation) return [...labels];
  requireCondition(ORIENTATIONS.includes(priorOrientation), 'invalid-orientation');
  return [...labels].reverse();
}

export function assignImageSquare(labels, orientation, imageIndex, label) {
  validateLabels(labels);
  requireCondition(ALLOWED.has(label), 'invalid-piece-label');
  const updated = [...labels];
  updated[canonicalIndexForImageIndex(imageIndex, orientation)] = label;
  return updated;
}

export function labelsToPlacementFen(labels) {
  validateLabels(labels);
  return Array.from({ length: 8 }, (_, row) => {
    let rank = '';
    let empties = 0;
    for (const label of labels.slice(row * 8, row * 8 + 8)) {
      if (label === 'empty') empties++;
      else {
        if (empties) rank += String(empties);
        empties = 0;
        rank += label;
      }
    }
    if (empties) rank += String(empties);
    return rank;
  }).join('/');
}

export function placementFenToLabels(placementFen) {
  requireCondition(typeof placementFen === 'string', 'placement-fen-required');
  const ranks = placementFen.split('/');
  requireCondition(ranks.length === 8, 'fen-eight-ranks-required');
  const labels = [];
  for (const rank of ranks) {
    let count = 0;
    for (const character of rank) {
      if (/^[1-8]$/.test(character)) {
        const amount = Number(character);
        count += amount;
        labels.push(...Array(amount).fill('empty'));
      } else {
        requireCondition(ALLOWED.has(character) && character !== 'empty', 'fen-piece-invalid');
        count++;
        labels.push(character);
      }
    }
    requireCondition(count === 8, 'fen-rank-width-invalid');
  }
  validateLabels(labels);
  return labels;
}

export function chessWarnings(labels) {
  validateLabels(labels);
  const count = (label) => labels.filter((value) => value === label).length;
  const result = [];
  if (!count('K')) result.push('No white king (allowed for puzzles/compositions).');
  if (!count('k')) result.push('No black king (allowed for puzzles/compositions).');
  if (count('K') > 1) result.push('Multiple white kings (review, not blocked).');
  if (count('k') > 1) result.push('Multiple black kings (review, not blocked).');
  if (count('P') > 8 || count('p') > 8) result.push('More than eight pawns of one color (review, not blocked).');
  const white = labels.filter((label) => label !== 'empty' && label === label.toUpperCase()).length;
  const black = labels.filter((label) => label !== 'empty' && label === label.toLowerCase()).length;
  if (white > 16 || black > 16) result.push('More than 16 pieces of one color (review, not blocked).');
  return result;
}

export function createPieceRecord(sample, { labels, boardOrientation = null, status = 'draft', source = 'manual', humanVerifiedBy = null, confirmation = null }) {
  validateLabels(labels);
  requireCondition(boardOrientation === null || ORIENTATIONS.includes(boardOrientation), 'invalid-orientation');
  requireCondition(status === 'draft' || status === 'verified', 'invalid-annotation-status');
  requireCondition(['manual', 'fen-prefill-unreviewed', 'fen-prefill-reviewed'].includes(source), 'invalid-annotation-source');
  if (source !== 'manual') {
    requireCondition(typeof sample.trustedFenPlacement === 'string', 'trusted-fen-prefill-unavailable');
    placementFenToLabels(sample.trustedFenPlacement);
  }
  if (status === 'verified') {
    requireCondition(ORIENTATIONS.includes(boardOrientation), 'orientation-required');
    requireCondition(humanVerifiedBy === 'Alexander' && confirmation === 'I reviewed all 64 squares', 'human-confirmation-required');
    requireCondition(source === 'manual' || source === 'fen-prefill-reviewed', 'unreviewed-prefill-cannot-be-truth');
  }
  const record = {
    sampleId: sample.sampleId,
    sourceFilename: sample.sourceFilename,
    sourceSha256: sample.sourceSha256,
    cornerManifestSha256: sample.cornerManifestSha256,
    boardOrientation,
    squareOrder: SQUARE_ORDER,
    labels: [...labels],
    placementFen: labelsToPlacementFen(labels),
    annotation: {
      status,
      source,
      humanVerifiedBy: status === 'verified' ? humanVerifiedBy : null,
      reviewedAgainstRectifiedBoard: status === 'verified'
    },
    pieceSetFamily: sample.pieceSetFamily ?? null,
    pieceSetStyle: sample.pieceSetStyle ?? 'unknown',
    boardThemeFamily: sample.boardThemeFamily ?? null,
    difficultyTags: [...(sample.difficultyTags || [])],
    sourcePlatform: sample.sourcePlatform ?? null,
    reference: {
      outcome: sample.referenceOutcome ?? null,
      predictedFen: sample.referencePredictedFen ?? null,
      knownWrongSquares: [...(sample.knownWrongSquares || [])],
      failureType: [...(sample.classifierFailureTypes || [])]
    }
  };
  validatePieceRecord(record, sample);
  return record;
}

export function validatePieceRecord(record, sample) {
  requireCondition(record && typeof record === 'object', 'piece-record-required');
  requireCondition(record.sampleId === sample.sampleId && record.sourceFilename === sample.sourceFilename,
    'source-identity-mismatch');
  requireCondition(HASH.test(record.sourceSha256 || '') && record.sourceSha256 === sample.sourceSha256,
    'source-checksum-mismatch');
  requireCondition(HASH.test(record.cornerManifestSha256 || '')
    && record.cornerManifestSha256 === sample.cornerManifestSha256, 'corner-manifest-checksum-mismatch');
  requireCondition(record.squareOrder === SQUARE_ORDER, 'canonical-square-order-required');
  validateLabels(record.labels);
  requireCondition(record.placementFen === labelsToPlacementFen(record.labels), 'fen-label-mismatch');
  requireCondition(JSON.stringify(placementFenToLabels(record.placementFen)) === JSON.stringify(record.labels), 'fen-round-trip-mismatch');
  requireCondition(record.boardOrientation === null || ORIENTATIONS.includes(record.boardOrientation), 'invalid-orientation');
  const annotation = record.annotation;
  requireCondition(annotation && ['draft', 'verified'].includes(annotation.status), 'annotation-status-invalid');
  requireCondition(['manual', 'fen-prefill-unreviewed', 'fen-prefill-reviewed'].includes(annotation.source),
    'annotation-source-invalid');
  if (annotation.source !== 'manual') {
    requireCondition(typeof sample.trustedFenPlacement === 'string', 'trusted-fen-prefill-unavailable');
    placementFenToLabels(sample.trustedFenPlacement);
  }
  if (annotation.status === 'verified') {
    requireCondition(ORIENTATIONS.includes(record.boardOrientation), 'orientation-required');
    requireCondition(annotation.humanVerifiedBy === 'Alexander' && annotation.reviewedAgainstRectifiedBoard === true,
      'human-verification-required');
    requireCondition(['manual', 'fen-prefill-reviewed'].includes(annotation.source), 'annotation-source-invalid');
  } else {
    requireCondition(annotation.humanVerifiedBy === null && annotation.reviewedAgainstRectifiedBoard === false,
      'draft-cannot-be-verified-truth');
  }
  return record;
}

export function emptyManifest(catalog) {
  return {
    schemaVersion: PIECE_LABEL_SCHEMA,
    squareOrder: SQUARE_ORDER,
    corpusIdentity: { v01CornerManifestSha256: catalog.v01CornerManifestSha256,
      v03CornerManifestSha256: catalog.v03CornerManifestSha256 },
    samples: []
  };
}

export function validateManifest(manifest, catalog) {
  requireCondition(manifest?.schemaVersion === PIECE_LABEL_SCHEMA && manifest.squareOrder === SQUARE_ORDER,
    'piece-manifest-schema-invalid');
  requireCondition(manifest.corpusIdentity?.v01CornerManifestSha256 === catalog.v01CornerManifestSha256
    && manifest.corpusIdentity?.v03CornerManifestSha256 === catalog.v03CornerManifestSha256,
    'corpus-identity-mismatch');
  requireCondition(Array.isArray(manifest.samples), 'piece-samples-invalid');
  const seenIds = new Set();
  const seenHashes = new Set();
  for (const record of manifest.samples) {
    const sample = catalog.samples.find((item) => item.sampleId === record.sampleId);
    requireCondition(sample, 'unknown-piece-sample');
    requireCondition(!seenIds.has(record.sampleId) && !seenHashes.has(record.sourceSha256), 'duplicate-piece-truth');
    seenIds.add(record.sampleId);
    seenHashes.add(record.sourceSha256);
    validatePieceRecord(record, sample);
  }
  return manifest;
}

export function toVisualBenchmarkTruth(record) {
  requireCondition(record?.annotation?.status === 'verified'
    && record.annotation.humanVerifiedBy === 'Alexander'
    && record.annotation.reviewedAgainstRectifiedBoard === true, 'verified-human-truth-required');
  return {
    sampleId: record.sampleId,
    sourceSha256: record.sourceSha256,
    verifiedBy: record.annotation.humanVerifiedBy,
    reviewedAgainstRectifiedBoard: true,
    squareLabels: canonicalToImageLabels(record.labels, record.boardOrientation),
    fenPlacement: record.placementFen,
    orientation: record.boardOrientation
  };
}

export function serializeManifest(manifest, catalog) {
  validateManifest(manifest, catalog);
  return `${JSON.stringify({ ...manifest, samples: [...manifest.samples].sort((a, b) =>
    a.sampleId < b.sampleId ? -1 : a.sampleId > b.sampleId ? 1 : 0) }, null, 2)}\n`;
}

export function coverageReport(catalog, manifest) {
  validateManifest(manifest, catalog);
  const verified = manifest.samples.filter((sample) => sample.annotation.status === 'verified').length;
  const drafts = manifest.samples.filter((sample) => sample.annotation.status === 'draft').length;
  return {
    schemaVersion: 'caissa-scanner-piece-label-coverage/1',
    verifiedCornerBoards: catalog.samples.length,
    eligibleUnique2dBoards: catalog.samples.length,
    pieceLabeledComplete: verified,
    draftBoards: drafts,
    pieceLabeledPending: catalog.samples.length - verified,
    missingTruth: catalog.samples.length - verified,
    excludedExactByteDuplicates: catalog.duplicateAliases.length,
    outOfScope: catalog.outOfScope.length,
    trustedFenPrefillCandidates: catalog.samples.filter((sample) => Boolean(sample.trustedFenPlacement)).length
  };
}
