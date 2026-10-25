const STABLE_LOCALIZATION_CODES = Object.freeze([
  'NO_BOARD_FOUND',
  'AMBIGUOUS_BOARD',
  'LOW_LOCALIZATION_CONFIDENCE',
  'INVALID_QUAD',
  'HOMOGRAPHY_FAILURE',
  'MULTIPLE_BOARD_CANDIDATES'
]);

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function candidateSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.freeze({
    source: typeof value.source === 'string' ? value.source.slice(0, 80) : null,
    accepted: value.accepted === true,
    candidateScore: finiteOrNull(value.candidateScore),
    geometryScore: finiteOrNull(value.geometryScore),
    gridScore: finiteOrNull(value.gridEvidenceScore),
    checkerScore: finiteOrNull(value.checkerEvidenceScore),
    gridPhaseScore: finiteOrNull(value.gridPhaseEvidenceScore),
    rejectionReasons: Array.isArray(value.rejectionReasons)
      ? value.rejectionReasons.slice(0, 8).map((reason) => String(reason).slice(0, 80))
      : []
  });
}

function localizationDiagnostics(value) {
  const diagnostics = value?.diagnostics && typeof value.diagnostics === 'object'
    ? value.diagnostics
    : (value && typeof value === 'object' ? value : {});
  const candidates = Array.isArray(diagnostics.candidateSummaries)
    ? diagnostics.candidateSummaries.slice(0, 2).map(candidateSummary).filter(Boolean)
    : [];
  const selected = candidates[0] || null;
  const runnerUp = candidates[1] || null;
  return Object.freeze({
    schemaVersion: 'caissa-scanner-localization-diagnostics/1',
    localizerVersion: typeof diagnostics.localizerVersion === 'string' ? diagnostics.localizerVersion.slice(0, 80) : null,
    candidateCount: Number.isSafeInteger(diagnostics.candidateCount) ? diagnostics.candidateCount : candidates.length,
    acceptedCandidateCount: Number.isSafeInteger(diagnostics.acceptedCandidateCount)
      ? diagnostics.acceptedCandidateCount
      : candidates.filter((candidate) => candidate.accepted).length,
    selectedCandidateScore: selected?.candidateScore ?? null,
    runnerUpCandidateScore: runnerUp?.candidateScore ?? null,
    scoreMargin: finiteOrNull(diagnostics.scoreSeparation)
      ?? (selected?.candidateScore != null && runnerUp?.candidateScore != null
        ? selected.candidateScore - runnerUp.candidateScore : null),
    geometryScore: selected?.geometryScore ?? null,
    gridScore: selected?.gridScore ?? null,
    checkerScore: selected?.checkerScore ?? null,
    gridPhaseScore: selected?.gridPhaseScore ?? null,
    candidates
  });
}

function stableLocalizationFailure(error) {
  const raw = String(error?.code || error?.message || '').toLowerCase();
  const diagnostics = localizationDiagnostics(error);
  if (raw.includes('multiple-board-candidates')) return Object.freeze({ code: 'MULTIPLE_BOARD_CANDIDATES', diagnostics });
  if (raw.includes('ambiguous')) return Object.freeze({ code: 'AMBIGUOUS_BOARD', diagnostics });
  if (raw.includes('homography')) return Object.freeze({ code: 'HOMOGRAPHY_FAILURE', diagnostics });
  if (raw.includes('invalid-quadrilateral') || raw.includes('geometry-contract')) {
    return Object.freeze({ code: 'INVALID_QUAD', diagnostics });
  }
  if (raw.includes('board-not-found')) {
    return Object.freeze({
      code: diagnostics.candidateCount > 0 ? 'LOW_LOCALIZATION_CONFIDENCE' : 'NO_BOARD_FOUND',
      diagnostics
    });
  }
  if (raw.includes('localization') || raw.includes('corner') || raw.includes('board')) {
    return Object.freeze({ code: 'LOW_LOCALIZATION_CONFIDENCE', diagnostics });
  }
  return null;
}

export { STABLE_LOCALIZATION_CODES, localizationDiagnostics, stableLocalizationFailure };
