export const NONSTANDARD_EDGE_CASE = Object.freeze({
  sampleId: 'cv-success-005-puzzle-diagram-no-kings',
  benchmarkEligibility: 'excluded',
  exclusionReason: 'nonstandard-artistic-composition',
  classifierHeadlineScoring: false,
  chessLogicScoring: false,
  retainForEdgeCaseResearch: true
});

export function certifyVerifiedRealEligibility(samples, manifest) {
  if (!Array.isArray(samples) || samples.length !== 32 || !Array.isArray(manifest?.samples)) {
    throw new Error('verified-real corpus must contain exactly 32 unique 2D boards');
  }
  const sourceHashes = new Set(samples.map((sample) => sample.sourceSha256));
  if (sourceHashes.size !== 32) throw new Error('exact-byte source alias entered verified-real scoring');
  const sampleIds = new Set(samples.map((sample) => sample.sampleId));
  const records = new Map(manifest.samples.map((record) => [record.sampleId, record]));
  if (records.size !== manifest.samples.length || records.size !== 32
      || [...records.keys()].some((id) => !sampleIds.has(id))) {
    throw new Error('verified-real truth must cover the exact 32-board corpus');
  }
  const excluded = records.get(NONSTANDARD_EDGE_CASE.sampleId);
  if (!excluded) throw new Error('nonstandard edge-case annotation must be retained');
  const scored = samples.filter((sample) => sample.sampleId !== NONSTANDARD_EDGE_CASE.sampleId);
  if (scored.length !== 31 || scored.some((sample) => records.get(sample.sampleId)?.annotation?.status !== 'verified')) {
    throw new Error('exactly 31 human-verified scoring boards required; no draft enters headline scoring');
  }
  return {
    scoringSampleIds: scored.map((sample) => sample.sampleId),
    scoredBoards: 31,
    scoredSquares: 31 * 64,
    excluded: { ...NONSTANDARD_EDGE_CASE, annotationStatus: excluded.annotation.status }
  };
}
