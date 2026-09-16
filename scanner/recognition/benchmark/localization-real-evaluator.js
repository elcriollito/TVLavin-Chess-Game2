const QUALITY_POLICY = Object.freeze({
  excellent: Object.freeze({ maximumRmse: 0.012, maximumWorstCorner: 0.02 }),
  acceptable: Object.freeze({ maximumRmse: 0.03, maximumWorstCorner: 0.05 }),
  reviewNeeded: Object.freeze({ maximumRmse: 0.06, maximumWorstCorner: 0.1 })
});

function round(value, places = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function polygonArea(points) {
  if (!Array.isArray(points) || points.length !== 4) return null;
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + ((point[0] * next[1]) - (next[0] * point[1]));
  }, 0)) / 2;
}

export function qualityBucket(metrics) {
  if (!metrics) return 'failed';
  if (metrics.normalizedCornerRmse <= QUALITY_POLICY.excellent.maximumRmse
      && metrics.normalizedWorstCornerError <= QUALITY_POLICY.excellent.maximumWorstCorner) return 'excellent';
  if (metrics.normalizedCornerRmse <= QUALITY_POLICY.acceptable.maximumRmse
      && metrics.normalizedWorstCornerError <= QUALITY_POLICY.acceptable.maximumWorstCorner) return 'acceptable';
  if (metrics.normalizedCornerRmse <= QUALITY_POLICY.reviewNeeded.maximumRmse
      && metrics.normalizedWorstCornerError <= QUALITY_POLICY.reviewNeeded.maximumWorstCorner) return 'review-needed';
  return 'failed';
}

export function failureTaxonomy(result, cornerMetrics, predictedCorners, truthCorners) {
  if (!result?.ok) {
    if (result?.error?.code === 'multiple-board-candidates') return 'multiple-board-candidates';
    if (result?.error?.code === 'homography-failed') return 'homography-failed';
    if (result?.error?.code === 'geometry-contract-failed') return 'geometry-contract-failed';
    if (result?.error?.code === 'invalid-quadrilateral') return 'quadrilateral-validation';
    const top = result?.error?.diagnostics?.candidateSummaries?.[0];
    const reasons = top?.rejectionReasons || [];
    if (reasons.includes('candidate-score-too-low')) return 'candidate-score-too-low';
    if (reasons.includes('insufficient-grid-evidence')) return 'grid-score-too-low';
    if (reasons.includes('insufficient-checker-evidence')) return 'checker-score-too-low';
    if (reasons.length) return 'candidate-rejected';
    return 'board-not-found';
  }
  const bucket = qualityBucket(cornerMetrics);
  if (bucket === 'excellent' || bucket === 'acceptable') return null;
  if (bucket === 'review-needed') return 'corner-position-error';
  const predictedArea = polygonArea(predictedCorners);
  const truthArea = polygonArea(truthCorners);
  if (predictedArea && truthArea && predictedArea / truthArea >= 1.18) return 'outer-frame-selected';
  return 'wrong-board-selected';
}

function selectedSummary(result) {
  const summaries = result?.diagnostics?.candidateSummaries
    || result?.error?.diagnostics?.candidateSummaries;
  if (!summaries) return null;
  return summaries.find((candidate) => candidate.accepted)
    || summaries[0]
    || null;
}

export function evaluateLocalizationSample({ sample, splitRecord, result, cornerMetrics, truthCandidateEvidence = null }) {
  const truthCorners = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']
    .map((key) => sample.groundTruth.playableBoardCorners[key].pixels)
    .map((point) => [point.x, point.y]);
  const predictedCorners = result?.ok ? result.board.corners.map((point) => [round(point[0], 3), round(point[1], 3)]) : null;
  const candidate = selectedSummary(result);
  const bucket = qualityBucket(cornerMetrics);
  const failure = failureTaxonomy(result, cornerMetrics, predictedCorners, truthCorners);
  return Object.freeze({
    sampleId: sample.sampleId,
    split: splitRecord.split,
    categoryGroup: splitRecord.categoryGroup,
    difficultyTags: sample.difficultyTags,
    referenceSystem: sample.referenceSystem || null,
    referenceOutcome: sample.referenceOutcome || null,
    boardPresent: sample.boardPresent,
    detected: result?.ok === true,
    localizationAccepted: result?.ok === true && (bucket === 'excellent' || bucket === 'acceptable'),
    qualityBucket: bucket,
    failureTaxonomy: failure,
    predictedCorners,
    truthCorners,
    cornerRmse: round(cornerMetrics?.normalizedCornerRmse),
    worstCornerError: round(cornerMetrics?.normalizedWorstCornerError),
    selectedCandidate: candidate ? {
      source: candidate.source,
      corners: candidate.corners?.map((point) => [round(point[0], 3), round(point[1], 3)]) || null,
      candidateScore: round(candidate.candidateScore),
      geometryScore: round(candidate.geometryScore),
      gridScore: round(candidate.gridEvidenceScore),
      gridPhaseScore: round(candidate.gridPhaseEvidenceScore),
      checkerScore: round(candidate.checkerEvidenceScore),
      edgeScore: round(candidate.edgeEvidenceScore),
      outerBoundary: candidate.outerBoundary || null,
      rejectionReasons: candidate.rejectionReasons || []
    } : null,
    truthCandidateEvidence: truthCandidateEvidence ? {
      candidateScore: round(truthCandidateEvidence.candidateScore),
      geometryScore: round(truthCandidateEvidence.geometryScore),
      gridScore: round(truthCandidateEvidence.gridEvidenceScore),
      gridPhaseScore: round(truthCandidateEvidence.gridPhaseEvidenceScore),
      checkerScore: round(truthCandidateEvidence.checkerEvidenceScore),
      edgeScore: round(truthCandidateEvidence.edgeEvidenceScore),
      outerBoundary: truthCandidateEvidence.outerBoundary || null,
      acceptedByScoring: truthCandidateEvidence.accepted,
      rejectionReasons: truthCandidateEvidence.rejectionReasons || []
    } : null,
    ambiguity: result?.error?.code === 'multiple-board-candidates',
    homographySuccess: result?.ok === true && Boolean(result.board?.transformMetadata),
    geometryContractSuccess: result?.ok === true && result.board?.geometry?.tiles?.length === 64,
    typedFailureCode: result?.ok ? null : (result?.error?.code || 'board-not-found'),
    timingsMs: {
      localization: round(result?.timing?.localizationMs, 3) || 0,
      candidateGeneration: round(result?.timing?.candidateGenerationMs, 3) || 0,
      periodicityScoring: round(result?.timing?.periodicityScoringMs, 3) || 0,
      insetRefinement: round(result?.timing?.insetRefinementMs, 3) || 0,
      cornerRefinement: round(result?.timing?.cornerRefinementMs, 3) || 0,
      candidateScoring: round(result?.timing?.candidateScoringMs, 3) || 0,
      homography: round(result?.timing?.homographyMs, 3) || 0,
      geometryValidation: round(result?.timing?.geometryValidationMs, 3) || 0,
      totalGeometry: round(result?.timing?.totalGeometryMs, 3) || 0
    }
  });
}

export function aggregateLocalization(samples) {
  const total = samples.length;
  const detected = samples.filter((sample) => sample.detected).length;
  const accepted = samples.filter((sample) => sample.localizationAccepted).length;
  const ambiguities = samples.filter((sample) => sample.ambiguity).length;
  const wrongSelections = samples.filter((sample) => ['wrong-board-selected', 'outer-frame-selected'].includes(sample.failureTaxonomy)).length;
  const cornerSamples = samples.filter((sample) => sample.cornerRmse !== null);
  const latencies = samples.map((sample) => sample.timingsMs.totalGeometry);
  const worstCornerSample = [...cornerSamples].sort((left, right) => right.cornerRmse - left.cornerRmse)[0] || null;
  const worstLatencySample = [...samples].sort((left, right) => right.timingsMs.totalGeometry - left.timingsMs.totalGeometry)[0] || null;
  return Object.freeze({
    sampleCount: total,
    boardFoundRate: total ? round(detected / total) : null,
    falseNegativeRate: total ? round((total - detected) / total) : null,
    localizationAcceptedRate: total ? round(accepted / total) : null,
    wrongBoardSelectedRate: total ? round(wrongSelections / total) : null,
    multipleBoardAmbiguityRate: total ? round(ambiguities / total) : null,
    cornerAccuracy: {
      sampleCount: cornerSamples.length,
      meanNormalizedRmse: round(mean(cornerSamples.map((sample) => sample.cornerRmse))),
      medianNormalizedRmse: round(median(cornerSamples.map((sample) => sample.cornerRmse))),
      worstSampleId: worstCornerSample?.sampleId || null,
      worstSampleRmse: worstCornerSample?.cornerRmse ?? null,
      worstCornerError: cornerSamples.length ? round(Math.max(...cornerSamples.map((sample) => sample.worstCornerError))) : null
    },
    homographySuccessRate: total ? round(samples.filter((sample) => sample.homographySuccess).length / total) : null,
    geometryContractPassRate: total ? round(samples.filter((sample) => sample.geometryContractSuccess).length / total) : null,
    latencyMs: {
      mean: round(mean(latencies), 3),
      median: round(median(latencies), 3),
      worst: worstLatencySample?.timingsMs.totalGeometry ?? null,
      worstSampleId: worstLatencySample?.sampleId || null
    },
    qualityBuckets: Object.fromEntries(['excellent', 'acceptable', 'review-needed', 'failed'].map((bucket) => [bucket, samples.filter((sample) => sample.qualityBucket === bucket).length])),
    failures: Object.fromEntries([...new Set(samples.map((sample) => sample.failureTaxonomy).filter(Boolean))].sort().map((code) => [code, samples.filter((sample) => sample.failureTaxonomy === code).length]))
  });
}

export function createLocalizationReport({ manifest, annotationSha256, detector, samples }) {
  const bySplit = Object.fromEntries(['development', 'holdout'].map((split) => [split, aggregateLocalization(samples.filter((sample) => sample.split === split))]));
  const categoryNames = [...new Set(samples.map((sample) => sample.categoryGroup))].sort();
  return {
    schemaVersion: 'caissa-scanner-localization-real-report/1',
    corpusVersion: manifest.corpusVersion,
    annotationManifestSha256: annotationSha256,
    sourceManifestSha256: manifest.sourceManifest.sha256,
    detector,
    qualityPolicy: QUALITY_POLICY,
    scope: 'positive-corpus-localization-only',
    falsePositiveEvaluation: 'incomplete-until-real-hard-negatives-are-added',
    metrics: {
      all: aggregateLocalization(samples),
      ...bySplit,
      byCategory: Object.fromEntries(categoryNames.map((category) => [category, aggregateLocalization(samples.filter((sample) => sample.categoryGroup === category))]))
    },
    samples
  };
}

export { QUALITY_POLICY };
