import '../../scanner/recognition/scanner-board-geometry.js';

export const MATCH_THRESHOLDS = Object.freeze({
  correctQuadIou: 0.8,
  correctMeanCornerErrorBoardDiagonal: 0.05,
  overlappingQuadIou: 0.5
});

const CORNER_KEYS = Object.freeze(['TL', 'TR', 'BR', 'BL']);
const CANONICAL_CORNERS = Object.freeze([[0, 0], [512, 0], [512, 512], [0, 512]]);

const round = (value, places = 6) => Number.isFinite(value) ? Number(value.toFixed(places)) : null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function polygonSignedArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + (point[0] * next[1]) - (next[0] * point[1]);
  }, 0) / 2;
}

export function polygonArea(points) {
  return Math.abs(polygonSignedArea(points));
}

function lineIntersection(start, end, clipStart, clipEnd) {
  const dx1 = end[0] - start[0];
  const dy1 = end[1] - start[1];
  const dx2 = clipEnd[0] - clipStart[0];
  const dy2 = clipEnd[1] - clipStart[1];
  const denominator = (dx1 * dy2) - (dy1 * dx2);
  if (Math.abs(denominator) < 1e-12) return end;
  const t = (((clipStart[0] - start[0]) * dy2) - ((clipStart[1] - start[1]) * dx2)) / denominator;
  return [start[0] + (t * dx1), start[1] + (t * dy1)];
}

function inside(point, start, end, winding) {
  const cross = ((end[0] - start[0]) * (point[1] - start[1]))
    - ((end[1] - start[1]) * (point[0] - start[0]));
  return winding >= 0 ? cross >= -1e-9 : cross <= 1e-9;
}

export function polygonIntersection(subject, clip) {
  let output = subject.map((point) => [...point]);
  const winding = polygonSignedArea(clip);
  for (let index = 0; index < clip.length; index += 1) {
    const clipStart = clip[index];
    const clipEnd = clip[(index + 1) % clip.length];
    const input = output;
    output = [];
    if (!input.length) break;
    let start = input[input.length - 1];
    for (const end of input) {
      const endInside = inside(end, clipStart, clipEnd, winding);
      const startInside = inside(start, clipStart, clipEnd, winding);
      if (endInside) {
        if (!startInside) output.push(lineIntersection(start, end, clipStart, clipEnd));
        output.push(end);
      } else if (startInside) output.push(lineIntersection(start, end, clipStart, clipEnd));
      start = end;
    }
  }
  return output;
}

export function quadIou(left, right) {
  const leftArea = polygonArea(left);
  const rightArea = polygonArea(right);
  const intersectionArea = polygonArea(polygonIntersection(left, right));
  const unionArea = leftArea + rightArea - intersectionArea;
  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

const distance = (left, right) => Math.hypot(left[0] - right[0], left[1] - right[1]);
const centroid = (points) => [mean(points.map((point) => point[0])), mean(points.map((point) => point[1]))];

export function cornerErrorMetrics(predicted, truth, sourceWidth, sourceHeight) {
  const errors = predicted.map((point, index) => distance(point, truth[index]));
  const boardDiagonal = mean([distance(truth[0], truth[2]), distance(truth[1], truth[3])]);
  const sourceDiagonal = Math.hypot(sourceWidth, sourceHeight);
  const meanError = mean(errors);
  return {
    cornerErrorsPx: errors.map(round),
    meanCornerErrorPx: round(meanError),
    medianCornerErrorPx: round(median(errors)),
    maxCornerErrorPx: round(Math.max(...errors)),
    truthBoardDiagonalPx: round(boardDiagonal),
    sourceDiagonalPx: round(sourceDiagonal),
    meanNormalizedCornerError: round(meanError / boardDiagonal),
    meanSourceNormalizedCornerError: round(meanError / sourceDiagonal)
  };
}

function quadMetrics(predicted, truth) {
  const predictedArea = polygonArea(predicted);
  const truthArea = polygonArea(truth);
  const truthCentroid = centroid(truth);
  const predictedCentroid = centroid(predicted);
  const topAngle = (points) => Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0]) * 180 / Math.PI;
  const rawRotationDifference = Math.abs(topAngle(predicted) - topAngle(truth));
  return {
    predictedAreaPx2: round(predictedArea),
    truthAreaPx2: round(truthArea),
    quadIou: round(quadIou(predicted, truth)),
    centroidDistancePx: round(distance(predictedCentroid, truthCentroid)),
    scaleRatio: round(Math.sqrt(predictedArea / truthArea)),
    topEdgeRotationDifferenceDegrees: round(Math.min(rawRotationDifference, 360 - rawRotationDifference))
  };
}

function canonicalAlignment(predicted, truth) {
  const geometry = globalThis.CaissaScannerBoardGeometry;
  const transform = geometry.buildTransform(predicted, 512);
  const mappedTruth = truth.map((point) => geometry.transformPoint(transform.sourceToBoard, point));
  const cornerErrors = mappedTruth.map((point, index) => distance(point, CANONICAL_CORNERS[index]));
  const edgeDrift = mappedTruth.map((point, index) => Math.max(
    Math.abs(point[0] - CANONICAL_CORNERS[index][0]),
    Math.abs(point[1] - CANONICAL_CORNERS[index][1])
  ));
  const edgeLengths = mappedTruth.map((point, index) => distance(point, mappedTruth[(index + 1) % 4]));
  const squareSizes = edgeLengths.map((value) => value / 8);
  const meanSquareSize = mean(squareSizes);
  const variance = mean(squareSizes.map((value) => (value - meanSquareSize) ** 2));
  return {
    mappedHumanCornersPx: mappedTruth.map((point) => point.map(round)),
    meanCanonicalCornerErrorPx: round(mean(cornerErrors)),
    maxCanonicalCornerErrorPx: round(Math.max(...cornerErrors)),
    meanEdgeDriftPx: round(mean(edgeDrift)),
    maxEdgeDriftPx: round(Math.max(...edgeDrift)),
    meanImpliedSquareSizePx: round(meanSquareSize),
    impliedSquareSizeCv: round(Math.sqrt(variance) / meanSquareSize),
    maxImpliedSquareSizeDeviationFrom64Px: round(Math.max(...squareSizes.map((value) => Math.abs(value - 64))))
  };
}

export function truthCorners(sample) {
  return CORNER_KEYS.map((key) => [sample.corners[key].x, sample.corners[key].y]);
}

export function validateTruthSample(sample) {
  if (!sample?.sampleId || sample.humanVerified !== true) throw new Error('truth-not-human-verified');
  if (Object.keys(sample.corners || {}).join(',') !== CORNER_KEYS.join(',')) throw new Error('truth-corner-order-invalid');
  const width = sample.sourceDimensions?.width;
  const height = sample.sourceDimensions?.height;
  const points = truthCorners(sample);
  if (!(width > 0) || !(height > 0) || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)
    || x < 0 || y < 0 || x >= width || y >= height)) throw new Error('truth-corner-out-of-bounds');
  if (polygonSignedArea(points) <= 1e-6) throw new Error('truth-quad-degenerate-or-wrong-winding');
  return sample;
}

function candidateToSource(candidate, preprocessing) {
  const scaleX = preprocessing.sourceWidth / preprocessing.workingWidth;
  const scaleY = preprocessing.sourceHeight / preprocessing.workingHeight;
  return candidate.corners.map(([x, y]) => [x * scaleX, y * scaleY]);
}

export function matchCandidate(candidate, truthSample, preprocessing, rank) {
  const predictedCorners = candidateToSource(candidate, preprocessing);
  const truth = truthCorners(truthSample);
  const corner = cornerErrorMetrics(predictedCorners, truth, preprocessing.sourceWidth, preprocessing.sourceHeight);
  const quad = quadMetrics(predictedCorners, truth);
  const humanMatch = quad.quadIou >= MATCH_THRESHOLDS.correctQuadIou
    && corner.meanNormalizedCornerError <= MATCH_THRESHOLDS.correctMeanCornerErrorBoardDiagonal;
  return {
    rank,
    source: candidate.source,
    accepted: candidate.accepted === true,
    score: round(candidate.candidateScore),
    components: {
      geometry: round(candidate.geometryScore),
      grid: round(candidate.gridEvidenceScore),
      checker: round(candidate.checkerEvidenceScore),
      gridPhase: round(candidate.gridPhaseEvidenceScore),
      edge: round(candidate.edgeEvidenceScore),
      playableField: round(candidate.playableFieldEvidence)
    },
    predictedCorners: predictedCorners.map((point) => point.map(round)),
    ...corner,
    ...quad,
    humanMatch,
    overlappingBoard: quad.quadIou >= MATCH_THRESHOLDS.overlappingQuadIou
  };
}

export function diagnoseSample({ selected, bestMatch, bestOverlap, errorCode }) {
  if (selected?.humanMatch) return null;
  if (String(errorCode || '').toLowerCase().includes('homography')) return 'HOMOGRAPHY_FAILURE';
  if (!bestOverlap) return 'GENERATION_FAILURE';
  if (!bestMatch) return 'CORNER_ESTIMATION_FAILURE';
  if (!selected) return 'AMBIGUITY_POLICY_FAILURE';
  if (bestMatch.rank !== selected.rank) return 'RANKING_FAILURE';
  return 'OTHER / UNKNOWN';
}

export function scoreSample(truthSample, diagnostic, metadata = {}) {
  validateTruthSample(truthSample);
  const candidates = diagnostic.candidateSummaries.map((candidate, index) => matchCandidate(
    candidate, truthSample, diagnostic.preprocessing, index + 1
  ));
  const selected = diagnostic.ok ? candidates[0] : null;
  const bestMatch = candidates.find((candidate) => candidate.humanMatch) || null;
  const bestOverlap = [...candidates].sort((left, right) => right.quadIou - left.quadIou)[0];
  const selection = !selected ? 'ABSTAINED'
    : selected.humanMatch ? 'CORRECT BOARD'
      : selected.quadIou < MATCH_THRESHOLDS.overlappingQuadIou ? 'WRONG BOARD' : 'AMBIGUOUS / UNUSABLE';
  const accepted = candidates.filter((candidate) => candidate.accepted);
  const acceptedMargin = accepted.length > 1 ? accepted[0].score - accepted[1].score : null;
  return {
    sampleId: truthSample.sampleId,
    governanceStatus: truthSample.governanceStatus,
    developmentRole: truthSample.developmentRole,
    duplicateGroup: truthSample.duplicateGroup,
    platform: metadata.platform || 'unknown',
    captureType: metadata.captureType || 'unknown',
    orientation: metadata.orientation || 'unknown',
    selection,
    errorCode: diagnostic.errorCode,
    candidateCount: diagnostic.candidateCount,
    acceptedCandidateCount: accepted.length,
    selectedCandidateRank: selected?.rank || null,
    selectedCandidate: selected,
    bestHumanMatchingCandidate: bestMatch,
    bestOverlapCandidate: bestOverlap,
    rawRunnerUpScore: candidates[1]?.score ?? null,
    acceptedRunnerUpScore: accepted[1]?.score ?? null,
    acceptedScoreMargin: round(acceptedMargin),
    failureCause: diagnoseSample({ selected, bestMatch, bestOverlap: bestOverlap?.overlappingBoard ? bestOverlap : null,
      errorCode: diagnostic.errorCode }),
    homographyAccuracy: selected?.humanMatch
      ? canonicalAlignment(selected.predictedCorners, truthCorners(truthSample)) : null,
    candidates
  };
}

function summarize(samples) {
  const selected = samples.map((sample) => sample.selectedCandidate).filter(Boolean);
  const allCornerErrors = selected.flatMap((candidate) => candidate.cornerErrorsPx);
  const normalized = selected.map((candidate) => candidate.meanNormalizedCornerError);
  const ious = selected.map((candidate) => candidate.quadIou);
  const matchingGenerated = samples.filter((sample) => sample.bestHumanMatchingCandidate).length;
  const selectedFromGenerated = samples.filter((sample) => sample.bestHumanMatchingCandidate && sample.selection === 'CORRECT BOARD').length;
  return {
    sampleCount: samples.length,
    correctBoardCount: samples.filter((sample) => sample.selection === 'CORRECT BOARD').length,
    wrongBoardCount: samples.filter((sample) => sample.selection === 'WRONG BOARD').length,
    ambiguousUnusableCount: samples.filter((sample) => sample.selection === 'AMBIGUOUS / UNUSABLE').length,
    abstentionCount: samples.filter((sample) => sample.selection === 'ABSTAINED').length,
    correctBoardSelectionRate: round(samples.filter((sample) => sample.selection === 'CORRECT BOARD').length / samples.length),
    wrongBoardSelectionRate: round(samples.filter((sample) => sample.selection === 'WRONG BOARD').length / samples.length),
    abstentionRate: round(samples.filter((sample) => sample.selection === 'ABSTAINED').length / samples.length),
    candidateGenerationRecall: round(matchingGenerated / samples.length),
    rankingAccuracy: matchingGenerated ? round(selectedFromGenerated / matchingGenerated) : null,
    meanCornerErrorPx: round(mean(allCornerErrors)),
    medianCornerErrorPx: round(median(allCornerErrors)),
    maximumCornerErrorPx: allCornerErrors.length ? round(Math.max(...allCornerErrors)) : null,
    meanNormalizedCornerError: round(mean(normalized)),
    medianNormalizedCornerError: round(median(normalized)),
    meanQuadIou: round(mean(ious)),
    minimumQuadIou: ious.length ? round(Math.min(...ious)) : null
  };
}

function breakdown(samples, key) {
  const values = [...new Set(samples.map((sample) => sample[key] || 'unknown'))].sort();
  return Object.fromEntries(values.map((value) => [value, summarize(samples.filter((sample) => (sample[key] || 'unknown') === value))]));
}

function taxonomy(samples) {
  const labels = ['GENERATION_FAILURE', 'RANKING_FAILURE', 'CORNER_ESTIMATION_FAILURE',
    'AMBIGUITY_POLICY_FAILURE', 'HOMOGRAPHY_FAILURE', 'OTHER / UNKNOWN'];
  return Object.fromEntries(labels.map((label) => [label, samples.filter((sample) => sample.failureCause === label)
    .map((sample) => sample.sampleId)]));
}

function counterfactualAmbiguity(samples) {
  return [0.04, 0.08, 0.1, 0.12].map((margin) => {
    const outcomes = samples.map((sample) => {
      const abstain = sample.acceptedCandidateCount > 1 && sample.acceptedScoreMargin < margin;
      return abstain ? 'ABSTAINED' : sample.selection;
    });
    return {
      margin,
      correctBoardSelectionRate: round(outcomes.filter((value) => value === 'CORRECT BOARD').length / samples.length),
      wrongBoardSelectionRate: round(outcomes.filter((value) => value === 'WRONG BOARD').length / samples.length),
      abstentionRate: round(outcomes.filter((value) => value === 'ABSTAINED').length / samples.length),
      newlyAbstainedSamples: samples.filter((sample) => sample.acceptedCandidateCount > 1
        && sample.acceptedScoreMargin < margin && sample.selection !== 'ABSTAINED').map((sample) => sample.sampleId)
    };
  });
}

function scoreComponentFindings(samples) {
  const rankingComparisons = samples.filter((sample) => sample.failureCause === 'RANKING_FAILURE').map((sample) => ({
    sampleId: sample.sampleId,
    selectedRank: sample.selectedCandidate.rank,
    correctRank: sample.bestHumanMatchingCandidate.rank,
    selected: sample.selectedCandidate.components,
    correct: sample.bestHumanMatchingCandidate.components,
    deltasSelectedMinusCorrect: Object.fromEntries(Object.keys(sample.selectedCandidate.components).map((key) => [
      key, round((sample.selectedCandidate.components[key] ?? 0) - (sample.bestHumanMatchingCandidate.components[key] ?? 0))
    ]))
  }));
  return {
    rankingFailureComparisons: rankingComparisons,
    componentOnlyCorrectTopCounts: Object.fromEntries(['geometry', 'grid', 'checker', 'gridPhase'].map((component) => [component,
      samples.filter((sample) => {
        const accepted = sample.candidates.filter((candidate) => candidate.accepted);
        if (!accepted.length) return false;
        const top = [...accepted].sort((left, right) => (right.components[component] ?? -1) - (left.components[component] ?? -1))[0];
        return top.humanMatch;
      }).length
    ])),
    conclusion: rankingComparisons.length
      ? 'Observed ranking failures require candidate-component review.'
      : 'No sample contained a human-matching candidate that lost production ranking.'
  };
}

export function buildReports({ truthManifest, browserDiagnostics, auditReport, truthSha256, browserSha256 }) {
  if (truthManifest.samples.length !== 12 || truthManifest.samples.some((sample) => sample.humanVerified !== true)) {
    throw new Error('expected-12-human-verified-samples');
  }
  const diagnosticById = new Map(browserDiagnostics.samples.map((sample) => [sample.sampleId, sample]));
  const metadataById = new Map(auditReport.samples.map((sample) => [sample.sampleId, sample]));
  const samples = truthManifest.samples.map((sample) => {
    const diagnostic = diagnosticById.get(sample.sampleId);
    if (!diagnostic) throw new Error(`${sample.sampleId}:browser-diagnostic-missing`);
    return scoreSample(sample, diagnostic, metadataById.get(sample.sampleId));
  });
  const independent = samples.filter((sample) => sample.governanceStatus === 'admitted');
  const held = samples.filter((sample) => sample.developmentRole === 'held-duplicate-review');
  if (independent.length !== 7 || held.length !== 5) throw new Error('governance-counts-invalid');
  const allMetrics = summarize(samples);
  const independentMetrics = summarize(independent);
  const failureTaxonomy = taxonomy(samples);
  const multipleBoardCases = samples.filter((sample) => sample.acceptedCandidateCount > 1).map((sample) => ({
    sampleId: sample.sampleId,
    currentResult: sample.selection,
    acceptedScoreMargin: sample.acceptedScoreMargin,
    policyMargin: 0.08,
    currentPolicyWouldAbstain: sample.acceptedScoreMargin < 0.08,
    acceptedCandidates: sample.candidates.filter((candidate) => candidate.accepted).map((candidate) => ({
      rank: candidate.rank, score: candidate.score, humanMatch: candidate.humanMatch, quadIou: candidate.quadIou
    }))
  }));
  const baseline = {
    schemaVersion: 'caissa-scanner-localization-field-hard-baseline/1',
    corpusVersion: 'caissa-scanner-localization-field-hard-v0.1',
    baselineFrozen: true,
    runtime: browserDiagnostics.runtime,
    truthSha256,
    browserDiagnosticsSha256: browserSha256,
    certifiedBetaFieldV01: auditReport.certifiedSource,
    classifierChanged: false,
    localizationAlgorithmChanged: false,
    modelTraining: 'NONE',
    thresholdChanges: 'NONE',
    productionDeployment: 'NONE',
    thresholds: MATCH_THRESHOLDS,
    normalization: {
      primary: 'Euclidean corner error divided by the mean of the two human-truth board diagonals.',
      secondary: 'Euclidean corner error divided by the source-image diagonal.'
    },
    selectionCriteria: {
      correctBoard: 'selected quad IoU >= 0.80 and mean corner error / human board diagonal <= 0.05',
      wrongBoard: 'selected quad IoU < 0.50',
      ambiguousUnusable: 'selected quad is neither correct nor wrong by the fixed criteria',
      abstained: 'production v4 returned no board'
    },
    independentAdmitted: independentMetrics,
    all12Diagnostics: allMetrics,
    heldDuplicateGroup: summarize(held),
    breakdowns: {
      platform: breakdown(samples, 'platform'),
      captureType: breakdown(samples, 'captureType'),
      orientation: breakdown(samples, 'orientation'),
      photoOfMonitor: { sampleCount: 0, note: 'No explicit photo-of-monitor metadata field; camera records are not silently relabeled.' }
    },
    candidateCounts: samples.map((sample) => ({ sampleId: sample.sampleId, generated: sample.candidateCount,
      accepted: sample.acceptedCandidateCount })),
    samples: samples.map((sample) => ({
      sampleId: sample.sampleId,
      governanceStatus: sample.governanceStatus,
      developmentRole: sample.developmentRole,
      duplicateGroup: sample.duplicateGroup,
      selection: sample.selection,
      failureCause: sample.failureCause,
      candidateCount: sample.candidateCount,
      acceptedCandidateCount: sample.acceptedCandidateCount,
      selectedCandidateRank: sample.selectedCandidateRank,
      correctCandidateRank: sample.bestHumanMatchingCandidate?.rank || null,
      selectedScore: sample.selectedCandidate?.score ?? null,
      correctCandidateScore: sample.bestHumanMatchingCandidate?.score ?? null,
      acceptedScoreMargin: sample.acceptedScoreMargin,
      meanCornerErrorPx: sample.selectedCandidate?.meanCornerErrorPx ?? null,
      maxCornerErrorPx: sample.selectedCandidate?.maxCornerErrorPx ?? null,
      meanNormalizedCornerError: sample.selectedCandidate?.meanNormalizedCornerError ?? null,
      quadIou: sample.selectedCandidate?.quadIou ?? null
    }))
  };
  const candidateAnalysis = {
    schemaVersion: 'caissa-scanner-localization-field-hard-candidate-analysis/1',
    matchingCriteria: baseline.selectionCriteria.correctBoard,
    candidateGenerationRecall: allMetrics.candidateGenerationRecall,
    rankingAccuracy: allMetrics.rankingAccuracy,
    multipleBoardCases,
    scoreComponentFindings: scoreComponentFindings(samples),
    samples: samples.map((sample) => ({
      sampleId: sample.sampleId,
      candidateCount: sample.candidateCount,
      acceptedCandidateCount: sample.acceptedCandidateCount,
      selectedCandidateRank: sample.selectedCandidateRank,
      bestHumanMatchingCandidateRank: sample.bestHumanMatchingCandidate?.rank || null,
      bestHumanMatchingCandidateScore: sample.bestHumanMatchingCandidate?.score ?? null,
      bestOverlapCandidateRank: sample.bestOverlapCandidate.rank,
      bestOverlapQuadIou: sample.bestOverlapCandidate.quadIou,
      selectedScore: sample.selectedCandidate?.score ?? null,
      rawRunnerUpScore: sample.rawRunnerUpScore,
      acceptedRunnerUpScore: sample.acceptedRunnerUpScore,
      acceptedScoreMargin: sample.acceptedScoreMargin,
      candidates: sample.candidates
    }))
  };
  const cornerErrorReport = {
    schemaVersion: 'caissa-scanner-localization-field-hard-corner-error/1',
    normalization: baseline.normalization,
    metrics: { independentAdmitted: independentMetrics, all12Diagnostics: allMetrics },
    homographyDefinitions: {
      canonicalCornerAlignment: 'Human corners transformed by the selected predicted-quad homography and compared with [0,0],[512,0],[512,512],[0,512].',
      edgeDrift: 'Per-corner maximum absolute x/y displacement from its canonical target.',
      squareGridConsistency: 'Boundary-only proxy: each mapped human edge divided by eight; CV and deviation from 64 px are reported.'
    },
    samples: samples.map((sample) => ({
      sampleId: sample.sampleId,
      selection: sample.selection,
      cornerErrorsPx: sample.selectedCandidate?.cornerErrorsPx || null,
      meanCornerErrorPx: sample.selectedCandidate?.meanCornerErrorPx || null,
      maxCornerErrorPx: sample.selectedCandidate?.maxCornerErrorPx || null,
      meanNormalizedCornerError: sample.selectedCandidate?.meanNormalizedCornerError || null,
      meanSourceNormalizedCornerError: sample.selectedCandidate?.meanSourceNormalizedCornerError || null,
      predictedAreaPx2: sample.selectedCandidate?.predictedAreaPx2 || null,
      truthAreaPx2: sample.selectedCandidate?.truthAreaPx2 || null,
      quadIou: sample.selectedCandidate?.quadIou || null,
      centroidDistancePx: sample.selectedCandidate?.centroidDistancePx || null,
      scaleRatio: sample.selectedCandidate?.scaleRatio || null,
      topEdgeRotationDifferenceDegrees: sample.selectedCandidate?.topEdgeRotationDifferenceDegrees ?? null,
      homographyAccuracy: sample.homographyAccuracy
    }))
  };
  const failureReport = {
    schemaVersion: 'caissa-scanner-localization-field-hard-failure-taxonomy/1',
    taxonomy: failureTaxonomy,
    samples: samples.filter((sample) => sample.failureCause).map((sample) => ({
      sampleId: sample.sampleId, selection: sample.selection, cause: sample.failureCause,
      evidence: {
        bestOverlapQuadIou: sample.bestOverlapCandidate.quadIou,
        humanMatchingCandidateRank: sample.bestHumanMatchingCandidate?.rank || null,
        selectedCandidateRank: sample.selectedCandidateRank,
        errorCode: sample.errorCode
      }
    }))
  };
  const counterfactual = {
    schemaVersion: 'caissa-scanner-localization-field-hard-counterfactual/1',
    baselineAlreadyFrozen: true,
    productionThresholdsChanged: false,
    ambiguityMargins: counterfactualAmbiguity(samples),
    ranking: candidateAnalysis.scoreComponentFindings,
    recommendation: 'MORE HUMAN LOCALIZATION DATA REQUIRED',
    rationale: 'The only independent miss is a corner-estimation failure; three related held samples repeat the pattern, '
      + 'but no strict human-matching candidate lost ranking and the only multiple-accepted-candidate case selected correctly.'
  };
  return { baseline, candidateAnalysis, cornerErrorReport, failureReport, counterfactual, samples };
}
