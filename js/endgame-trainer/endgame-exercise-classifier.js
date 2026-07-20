export const CLASSIFIER_VERSION = '1.0.0';

/** Confidence is heuristic evidence strength in [0, 1], not a probability. */
export function classifyExercise(fen, features, scoreResult) {
    void fen;
    if (!features || !scoreResult) return { ok: false, error: { code: 'invalid-options' } };
    let type = 'unclassified';
    const reasons = [];
    const labels = [features.categoryId, features.sideToMove].filter(Boolean);
    const tags = [];
    if (!scoreResult.accepted) { type = 'low-quality-candidate'; reasons.push('score-below-threshold'); }
    else if (features.categoryId === 'KRPvKR' && features.rookPawn) {
        const geometry = features.rookPawn;
        type = features.sideToMove === geometry.strongSide ? 'conversion' : 'defense';
        tags.push(type, 'technique', geometry.rookBehindPawn ? 'active-rook' : 'passive-rook');
        if (geometry.defendingRookActivity <= 2) tags.push('passive-rook');
        if (geometry.kingCutOffFiles >= 2 || geometry.kingCutOffRanks >= 2) tags.push('king-cutoff');
        if (geometry.sideCheckAvailability) tags.push('checking-defense', 'side-check-defense');
        if (geometry.frontalCheckAvailability) tags.push('checking-defense', 'frontal-defense');
        if (geometry.checkingDistance >= 2) tags.push('checking-distance');
        if (geometry.rookPawn) tags.push('rook-pawn');
        if (geometry.rookBehindPawn) tags.push('rook-behind-pawn');
        if (geometry.bridgeBuildingPotential) tags.push('bridge-building', 'lucena-like');
        if (geometry.pawnRankProgress === 4 && features.sideToMove !== geometry.strongSide && geometry.defendingRookActivity >= 3) tags.push('philidor-like');
        if (geometry.pawnRankProgress === 5) tags.push('sixth-rank-pawn');
        if (geometry.pawnRankProgress === 6) tags.push('seventh-rank-pawn');
        tags.push(features.sideToMove === geometry.strongSide ? 'conversion-technique' : 'defensive-hold');
        tags.push(geometry.defendingRookActivity >= 3 ? 'active-defense' : 'passive-defense');
        reasons.push('rook-and-pawn-technique');
    }
    else if (['KQK', 'KRK'].includes(features.categoryId)) { type = 'basic-mate-practice'; reasons.push('major-piece-and-king-coordination'); }
    else if (features.oppositionPattern !== 'none') { type = 'opposition-pattern'; reasons.push(`${features.oppositionPattern}-opposition`); }
    else if (features.categoryId === 'KPKP') { type = 'balanced-pawn-endgame'; reasons.push('symmetric-pawn-material'); }
    else if (features.categoryId === 'KPK' && features.sideToMove === 'white') { type = 'pawn-conversion-practice'; reasons.push('king-and-pawn-activity'); }
    else if (features.categoryId === 'KPK') { type = 'pawn-defense-practice'; reasons.push('defensive-king-activity'); }
    else if (features.kingDistance !== null && features.kingDistance <= 4) { type = 'king-activity'; reasons.push('interacting-kings'); }
    const matchedConditions = Math.min(3, reasons.length + (scoreResult.accepted ? 1 : 0));
    const confidence = Number((0.4 + matchedConditions * 0.2).toFixed(2));
    return { type, tags: [...new Set(tags)], confidence: Math.min(1, confidence), reasons, labels, version: CLASSIFIER_VERSION };
}
