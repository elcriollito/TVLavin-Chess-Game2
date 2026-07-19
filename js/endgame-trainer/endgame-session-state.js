export const SESSION_STATE_VERSION = '1.0.0';

export const SESSION_STATUSES = Object.freeze([
    'idle', 'preparing', 'ready', 'user-turn', 'engine-thinking',
    'completed', 'resigned', 'error', 'disposed'
]);

function clone(value) {
    if (value === undefined || value === null) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
}

export function createInitialSessionState() {
    return {
        status: 'idle', sessionId: null, categoryId: null, initialFen: null, currentFen: null,
        positionKey: null, userColor: null, engineColor: null, sideToMove: null, orientation: 'white',
        objective: null, classification: null, score: null, moveHistory: [], attemptNumber: 0,
        hintsUsed: 0, undosUsed: 0, engineThinking: false, result: null, error: null,
        versions: { sessionState: SESSION_STATE_VERSION }
    };
}

export function snapshotSessionState(state) {
    return clone(state);
}

export function cloneSessionValue(value) {
    return clone(value);
}
