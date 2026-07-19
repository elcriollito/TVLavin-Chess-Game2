export const CLASSIFIER_VERSION = '1.0.0';

/** Confidence is heuristic evidence strength in [0, 1], not a probability. */
export function classifyExercise(fen, features, scoreResult) {
    void fen;
    if (!features || !scoreResult) return { ok: false, error: { code: 'invalid-options' } };
    let type = 'unclassified';
    const reasons = [];
    const labels = [features.categoryId, features.sideToMove].filter(Boolean);
    if (!scoreResult.accepted) { type = 'low-quality-candidate'; reasons.push('score-below-threshold'); }
    else if (['KQK', 'KRK'].includes(features.categoryId)) { type = 'basic-mate-practice'; reasons.push('major-piece-and-king-coordination'); }
    else if (features.oppositionPattern !== 'none') { type = 'opposition-pattern'; reasons.push(`${features.oppositionPattern}-opposition`); }
    else if (features.categoryId === 'KPKP') { type = 'balanced-pawn-endgame'; reasons.push('symmetric-pawn-material'); }
    else if (features.categoryId === 'KPK' && features.sideToMove === 'white') { type = 'pawn-conversion-practice'; reasons.push('king-and-pawn-activity'); }
    else if (features.categoryId === 'KPK') { type = 'pawn-defense-practice'; reasons.push('defensive-king-activity'); }
    else if (features.kingDistance !== null && features.kingDistance <= 4) { type = 'king-activity'; reasons.push('interacting-kings'); }
    const matchedConditions = Math.min(3, reasons.length + (scoreResult.accepted ? 1 : 0));
    const confidence = Number((0.4 + matchedConditions * 0.2).toFixed(2));
    return { type, confidence: Math.min(1, confidence), reasons, labels, version: CLASSIFIER_VERSION };
}
