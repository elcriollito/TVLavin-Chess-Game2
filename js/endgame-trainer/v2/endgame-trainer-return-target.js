const CANONICAL_TRAINER_ROUTE = '/endgame-trainer';
const LEGACY_TRAINER_ROUTE = '/endgame-trainer?legacy=1';
const ENDGAME_PRACTICE_ROUTE = '/endgame-practice';

const CANONICAL_MODES = new Set([
    'public-v2',
    'explicit-v2',
    'private-objective',
    'historical-run',
    'multi-move-pilot'
]);

export function getTrainerReturnTarget(currentMode, { fromPractice = false } = {}) {
    if (currentMode === 'explicit-legacy') return LEGACY_TRAINER_ROUTE;
    if (currentMode === 'private-five-item-run') {
        return fromPractice ? ENDGAME_PRACTICE_ROUTE : CANONICAL_TRAINER_ROUTE;
    }
    if (CANONICAL_MODES.has(currentMode)) return CANONICAL_TRAINER_ROUTE;
    throw new Error('trainer-return-mode-invalid');
}

export function navigateToTrainerTarget(win, currentMode, options = {}) {
    const navigationWindow = win?.__caissaRealWindow ?? win;
    const target = getTrainerReturnTarget(currentMode, options);
    if (options.replace) navigationWindow.location.replace(target);
    else navigationWindow.location.assign(target);
    return target;
}

export const TRAINER_RETURN_TARGETS = Object.freeze({
    canonical: CANONICAL_TRAINER_ROUTE,
    legacy: LEGACY_TRAINER_ROUTE,
    practice: ENDGAME_PRACTICE_ROUTE
});
