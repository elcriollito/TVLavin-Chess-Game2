const round = (value, places = 6) => Number.isFinite(value) ? Number(value.toFixed(places)) : null;
const median = (values) => {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return round(ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2, 3);
};

export function summarizeV03(items) {
  const positives = items.filter((record) => record.boardPresent);
  const negatives = items.filter((record) => !record.boardPresent);
  const accepted = items.filter((record) => record.decision === 'accepted');
  const geometry = items.filter((record) => record.cornerRmse !== null);
  const timing = items.map((record) => record.timingMs.totalGeometryMs);
  return {
    sampleCount: items.length, positives: positives.length, negatives: negatives.length,
    boardFound: items.filter((record) => record.boardFound).length, accepted: accepted.length,
    reviewNeeded: items.filter((record) => record.decision === 'review-needed').length,
    deferred: items.filter((record) => record.decision === 'deferred-unsupported').length,
    ambiguous: items.filter((record) => record.decision === 'multiple-board-candidates').length,
    wrongBoard: positives.filter((record) => record.wrongBoard).length,
    outerFrame: positives.filter((record) => record.outerFrame).length,
    wrongBoardRate: positives.length ? round(positives.filter((record) => record.wrongBoard).length / positives.length) : null,
    falsePositives: negatives.filter((record) => record.decision === 'accepted').length,
    geometryFalseCandidates: negatives.filter((record) => record.boardFound).length,
    geometryFalseCandidateRate: negatives.length ? round(negatives.filter((record) => record.boardFound).length / negatives.length) : null,
    falsePositiveRate: negatives.length ? round(negatives.filter((record) => record.decision === 'accepted').length / negatives.length) : null,
    trueNegativeRate: negatives.length ? round(negatives.filter((record) => record.decision !== 'accepted').length / negatives.length) : null,
    medianCornerRmse: median(geometry.map((record) => record.cornerRmse)),
    worstCornerError: geometry.length ? round(Math.max(...geometry.map((record) => record.worstCornerError))) : null,
    homographySuccess: items.filter((record) => record.homographySuccess).length,
    geometryPass: items.filter((record) => record.geometryPass).length,
    medianLatencyMs: median(timing), worstLatencyMs: timing.length ? Math.max(...timing) : null
  };
}
