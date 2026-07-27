const GUIDED_KEYS = new Set(['studyUnit', 'release', 'activity', 'reviewFrom']);
const TECHNICAL_KEYS = new Set(['multiMovePilot', 'pilot', 'objectiveArtifact', 'endgameRun', 'privateEndgameRun', 'previewEntry']);
const PRIVATE_MODES = ['objectiveArtifact', 'endgameRun', 'privateEndgameRun'];
const PILOT_IDS = new Set([
    'kp-coordinate-support-promote@1.0.0',
    'rule-square-a-pawn-catch-stop-promotion@1.0.0'
]);
const OBJECTIVE_ARTIFACT_IDS = new Set([
    'convert-material-advantage@1.0.0',
    'hold-draw@1.0.0',
    'activate-king@1.0.0'
]);

function one(params, key, expected) {
    const values = params.getAll(key);
    return values.length === 1 && values[0] === expected;
}

function optionalV2Alias(params) {
    return !params.has('trainerV2') || one(params, 'trainerV2', '1');
}

function only(params, allowed) {
    return [...params.keys()].every(key => allowed.has(key));
}

const result = (mode, reason = null) => Object.freeze({ mode, reason });

export function resolveEndgameTrainerRoute(search = '') {
    if (typeof search !== 'string' || search.length > 2048) return result('technical-unavailable', 'selector-invalid');
    const params = new URLSearchParams(search);
    if ([...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) {
        return result('technical-unavailable', 'duplicate-selector');
    }

    const hasGuided = [...GUIDED_KEYS].some(key => params.has(key));
    if (hasGuided) {
        const guidedAllowed = new Set([...GUIDED_KEYS, 'trainerV2']);
        return only(params, guidedAllowed) && optionalV2Alias(params) &&
            params.has('studyUnit') && params.has('release')
            ? result('guided-legacy')
            : result('technical-unavailable', 'guided-selector-invalid');
    }

    if (params.has('legacy')) {
        return only(params, new Set(['legacy'])) && one(params, 'legacy', '1')
            ? result('legacy')
            : result('technical-unavailable', 'legacy-conflict');
    }

    if (!optionalV2Alias(params)) return result('technical-unavailable', 'v2-alias-invalid');
    const modeCount = PRIVATE_MODES.filter(key => params.has(key)).length;
    if (modeCount > 1) return result('technical-unavailable', 'private-mode-conflict');

    if (params.has('objectiveArtifact')) {
        const allowed = new Set(['trainerV2', 'multiMovePilot', 'objectiveArtifact']);
        return only(params, allowed) && one(params, 'multiMovePilot', '1') &&
            OBJECTIVE_ARTIFACT_IDS.has(params.get('objectiveArtifact'))
            ? result('objective-artifact')
            : result('technical-unavailable', 'objective-selector-invalid');
    }
    if (params.has('endgameRun')) {
        const allowed = new Set(['trainerV2', 'multiMovePilot', 'endgameRun']);
        return only(params, allowed) && one(params, 'multiMovePilot', '1') && one(params, 'endgameRun', '1')
            ? result('historical-run')
            : result('technical-unavailable', 'run-selector-invalid');
    }
    if (params.has('privateEndgameRun')) {
        const allowed = new Set(['trainerV2', 'multiMovePilot', 'privateEndgameRun', 'previewEntry']);
        const previewValid = !params.has('previewEntry') || one(params, 'previewEntry', 'endgame-practice');
        return only(params, allowed) && one(params, 'multiMovePilot', '1') &&
            one(params, 'privateEndgameRun', 'five-item') && previewValid
            ? result('private-run')
            : result('technical-unavailable', 'private-run-selector-invalid');
    }
    if (params.has('multiMovePilot') || params.has('pilot')) {
        const allowed = new Set(['trainerV2', 'multiMovePilot', 'pilot']);
        return only(params, allowed) && one(params, 'multiMovePilot', '1') &&
            (!params.has('pilot') || PILOT_IDS.has(params.get('pilot')))
            ? result('multi-move-pilot')
            : result('technical-unavailable', 'pilot-selector-invalid');
    }
    if ([...TECHNICAL_KEYS].some(key => params.has(key))) {
        return result('technical-unavailable', 'technical-selector-invalid');
    }
    return only(params, new Set(['trainerV2'])) ? result('public-v2')
        : result('technical-unavailable', 'unknown-selector');
}

export function isPublicEndgameV2(search = '') {
    return resolveEndgameTrainerRoute(search).mode === 'public-v2';
}
