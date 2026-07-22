import { ENDGAME_COACHING_MESSAGES, GENERAL_COACHING_MESSAGES } from './endgame-coaching-messages.js';

export const ENDGAME_COACH_VERSION = '1.0.0';
export const MOVE_CLASSIFICATIONS = Object.freeze(['BEST', 'GOOD', 'INACCURACY', 'MISTAKE', 'BLUNDER', 'ONLY_MOVE', 'SUCCESS']);
const RESULTS = new Set(['win', 'draw', 'loss', 'unknown']);
const clone = value => value == null ? value : structuredClone(value);
const freeze = value => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; };
const result = value => RESULTS.has(String(value).toLowerCase()) ? String(value).toLowerCase() : 'unknown';
const moveKey = move => typeof move === 'string' ? move.toLowerCase() : move?.lan?.toLowerCase() ?? `${move?.from ?? ''}${move?.to ?? ''}${move?.promotion ?? ''}`.toLowerCase();
const cp = evaluation => evaluation?.type === 'cp' && Number.isFinite(evaluation.value) ? evaluation.value : null;

export function normalizeCoachingContext(input = {}) {
    const context = {
        theme: typeof input.theme === 'string' ? input.theme : null,
        lessonId: typeof input.lessonId === 'string' ? input.lessonId : null,
        objective: typeof input.objective === 'string' ? input.objective : null,
        studentColor: input.studentColor === 'black' ? 'black' : 'white',
        sideToMove: input.sideToMove === 'black' ? 'black' : 'white',
        positionBefore: typeof input.positionBefore === 'string' ? input.positionBefore : null,
        positionAfter: typeof input.positionAfter === 'string' ? input.positionAfter : null,
        studentMove: clone(input.studentMove ?? null), bestMove: clone(input.bestMove ?? null),
        evaluationBefore: clone(input.evaluationBefore ?? null), evaluationAfter: clone(input.evaluationAfter ?? null),
        resultBefore: result(input.resultBefore), resultAfter: result(input.resultAfter),
        positionFeatures: clone(input.positionFeatures ?? {}), moveFeatures: clone(input.moveFeatures ?? {}),
        onlyMoveVerified: input.onlyMoveVerified === true, success: input.success === true
    };
    return freeze(context);
}

export function classifyStudentMove(rawContext = {}) {
    const context = normalizeCoachingContext(rawContext);
    if (context.success) return 'SUCCESS';
    const transition = `${context.resultBefore}-${context.resultAfter}`;
    if (transition === 'win-loss') return 'BLUNDER';
    if (transition === 'win-draw') return 'MISTAKE';
    if (transition === 'draw-loss') return 'BLUNDER';
    if (context.onlyMoveVerified && moveKey(context.studentMove) === moveKey(context.bestMove)) return 'ONLY_MOVE';
    if (moveKey(context.studentMove) && moveKey(context.studentMove) === moveKey(context.bestMove)) return 'BEST';
    if (transition === 'win-win' || transition === 'draw-draw') return 'GOOD';
    const before = cp(context.evaluationBefore), after = cp(context.evaluationAfter);
    if (before !== null && after !== null) {
        const loss = Math.max(0, before - after);
        if (context.resultBefore === 'loss' && context.resultAfter === 'loss') return loss >= 120 ? 'INACCURACY' : 'GOOD';
        if (loss >= 250) return 'BLUNDER';
        if (loss >= 120) return 'MISTAKE';
        if (loss >= 50) return 'INACCURACY';
    }
    return context.moveFeatures?.preservesTechnique === false ? 'INACCURACY' : 'GOOD';
}

function verifiedTheme(context) {
    const features = context.positionFeatures ?? {}, rook = features.rookPawn;
    if (['opposition', 'defensive-opposition'].includes(context.theme)) return features.oppositionPattern && features.oppositionPattern !== 'none';
    const hasPawn = (features.pawnAdvanceDistance?.white?.length ?? 0) + (features.pawnAdvanceDistance?.black?.length ?? 0) > 0;
    if (context.theme === 'key-squares') return features.pieceCount === 3 && hasPawn;
    if (context.theme === 'king-activity') return Number.isFinite(features.kingDistance) && features.kingDistance <= 4;
    if (['promotion-technique', 'passed-pawn'].includes(context.theme)) return features.pieceCount >= 3 && hasPawn;
    if (context.theme === 'stop-promotion') return features.pieceCount >= 3 && hasPawn;
    if (context.theme === 'blockade') return features.blockedPawnCount > 0;
    if (context.theme === 'pawn-breakthrough') return features.categoryId === 'KPKP' || features.pieceCount === 4;
    if (context.theme === 'rook-behind-pawn') return rook?.rookBehindPawn === true;
    if (context.theme === 'king-cut-off') return rook && (rook.kingCutOffFiles >= 2 || rook.kingCutOffRanks >= 2);
    if (context.theme === 'side-check-defense') return rook?.sideCheckAvailability === true;
    if (context.theme === 'lucena-like') return rook?.bridgeBuildingPotential === true;
    if (context.theme === 'philidor-like') return rook?.pawnRankProgress === 4 && rook?.defendingRookActivity >= 3;
    return false;
}

function criticalMessage(context) {
    const transition = `${context.resultBefore}-${context.resultAfter}`;
    if (transition === 'win-draw') return GENERAL_COACHING_MESSAGES.criticalWinDraw;
    if (transition === 'win-loss') return GENERAL_COACHING_MESSAGES.criticalWinLoss;
    if (transition === 'draw-loss') return GENERAL_COACHING_MESSAGES.criticalDrawLoss;
    if (transition === 'loss-loss') return GENERAL_COACHING_MESSAGES.alreadyLost;
    return null;
}

export function createMoveCoaching(rawContext = {}) {
    const context = normalizeCoachingContext(rawContext), classification = classifyStudentMove(context);
    const messages = ENDGAME_COACHING_MESSAGES[context.theme], themeVerified = Boolean(messages && verifiedTheme(context));
    const positive = ['BEST', 'GOOD', 'ONLY_MOVE', 'SUCCESS'].includes(classification);
    const critical = criticalMessage(context);
    const body = critical ?? (themeVerified ? (positive ? messages.success : messages.failure) : (positive ? GENERAL_COACHING_MESSAGES.success : GENERAL_COACHING_MESSAGES.failure));
    const label = ({ BEST: 'Best move.', GOOD: 'Good move.', INACCURACY: 'Inaccuracy.', MISTAKE: 'Mistake.', BLUNDER: 'Blunder.', ONLY_MOVE: 'Only move.', SUCCESS: 'Solved.' })[classification];
    return freeze({ classification, message: `${label} ${body}`, principle: themeVerified ? messages.principle : GENERAL_COACHING_MESSAGES.principle, theme: context.theme, themeVerified, context, version: ENDGAME_COACH_VERSION });
}

export function createProgressiveHint(rawContext = {}, requestedLevel = 1) {
    const context = normalizeCoachingContext(rawContext), level = Math.max(1, Math.min(4, Number(requestedLevel) || 1));
    const messages = ENDGAME_COACHING_MESSAGES[context.theme], themeVerified = Boolean(messages && verifiedTheme(context));
    const source = themeVerified ? messages : GENERAL_COACHING_MESSAGES;
    const move = moveKey(context.bestMove);
    const message = level === 1 ? `Principle: ${source.principle}`
        : level === 2 ? `Focus: ${source.focus}`
        : level === 3 ? `Direction: ${source.direction}`
        : move ? `Move: Consider ${move}.` : 'Move: Compare the legal moves that preserve the position’s critical setup.';
    return freeze({ level, message, suggestedMove: level === 4 ? move || null : null, theme: context.theme, themeVerified, version: ENDGAME_COACH_VERSION });
}

export function createSuccessCoaching(rawContext = {}) {
    const context = normalizeCoachingContext({ ...rawContext, success: true });
    const coaching = createMoveCoaching(context);
    const title = context.theme ? context.theme.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ') : 'Endgame';
    return freeze({ ...coaching, message: `Solved: ${title}. ${coaching.message.replace(/^Solved\.\s*/, '')} Principle: ${coaching.principle}` });
}
