import { labelFor } from '../../puzzles/model.js';

export const ENDGAME_ROOT_THEME = 'endgame';

export function discoverEndgameThemes(preview) {
    const phases = Array.isArray(preview?.categories?.Phases) ? preview.categories.Phases : [];
    return Object.freeze(phases
        .filter(theme => theme !== ENDGAME_ROOT_THEME && /Endgame$/u.test(theme))
        .filter(theme => preview.puzzles?.some(puzzle => puzzle.themes?.includes(theme)
            && puzzle.themes.includes(ENDGAME_ROOT_THEME)))
        .map(id => Object.freeze({ id, label: labelFor(id) })));
}

export function endgameSelection({ theme = '', target = 1800, difficulty = 'normal' } = {}) {
    return Object.freeze({
        category: 'Phases',
        theme: theme || ENDGAME_ROOT_THEME,
        requiredThemes: theme ? Object.freeze([ENDGAME_ROOT_THEME]) : Object.freeze([]),
        target,
        difficulty,
    });
}

export function endgameCount(catalog, theme, target, difficulty) {
    return catalog.countFor(
        'Phases',
        theme || ENDGAME_ROOT_THEME,
        target,
        difficulty,
        theme ? [ENDGAME_ROOT_THEME] : [],
    );
}

export function isEndgamePuzzle(puzzle, theme = '') {
    return Boolean(puzzle?.themes?.includes(ENDGAME_ROOT_THEME)
        && (!theme || puzzle.themes.includes(theme)));
}
