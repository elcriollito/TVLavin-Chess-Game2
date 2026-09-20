import { analyzeStructuralPosition } from '../../scanner/beta/scanner-structural-guardrails.js';

function buildStructuralGuardrailReport(state = {}) {
  const scans = Array.isArray(state.scans) ? state.scans : [];
  const feedback = Array.isArray(state.feedback) ? state.feedback : [];
  const dispositionByScan = new Map(feedback.map((item) => {
    const record = item.feedback || item;
    return [record.scanId, record.feedbackType];
  }));
  const rows = scans.flatMap((item) => {
    const snapshot = item.snapshot || item;
    if (!snapshot?.scanId || !snapshot?.predictedFEN) return [];
    return [{ scanId: snapshot.scanId, result: analyzeStructuralPosition(snapshot.predictedFEN) }];
  });
  const warnings = rows.flatMap((row) => row.result.warnings);
  const frequency = {};
  for (const item of warnings) frequency[item.code] = (frequency[item.code] || 0) + 1;
  const overlap = (feedbackType, predicate = () => true) => rows.filter((row) => (
    dispositionByScan.get(row.scanId) === feedbackType && predicate(row.result)
  )).length;
  const hasWarnings = (result) => result.status !== 'NORMAL';
  return Object.freeze({
    schemaVersion: 'caissa-scanner-structural-guardrail-report/1',
    sourceImagesIncluded: false,
    scansAnalyzed: rows.length,
    hardWarningScans: rows.filter((row) => row.result.status === 'REVIEW_REQUIRED').length,
    softWarningScans: rows.filter((row) => row.result.status === 'REVIEW_RECOMMENDED').length,
    hardWarningCount: warnings.filter((item) => item.severity === 'HARD').length,
    softWarningCount: warnings.filter((item) => item.severity === 'SOFT').length,
    warningCodeFrequencies: Object.fromEntries(Object.entries(frequency).sort()),
    overlapWithLocalizationFailures: overlap('LOCALIZATION_FAILURE', hasWarnings),
    overlapWithCorrectedScans: overlap('PIECE_CORRECTION', hasWarnings),
    overlapWithConfirmedCorrectScans: overlap('CONFIRMED_CORRECT', hasWarnings)
  });
}

export { buildStructuralGuardrailReport };
