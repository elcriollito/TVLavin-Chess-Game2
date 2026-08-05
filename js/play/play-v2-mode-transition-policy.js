(function installPlayV2ModeTransitionPolicy(root) {
    'use strict';
    const VERSION = '1.0.0';
    const MODES = Object.freeze(['games', 'bots', 'coach']);
    const STATES = Object.freeze(['setup', 'starting', 'active', 'postgame', 'analyzing', 'reviewing', 'error', 'unavailable']);
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const cleanup = freeze({
        postGame: 'clear-presentation-owner', clock: 'stop', engineRequests: 'cancel-and-rotate',
        worker: 'zero-before-target-play', promotion: 'clear', assistance: 'clear', lifecycle: 'rotate',
        board: 'single-owner-standard-initial-position', record: 'discard-presentation-reference-only'
    });
    const contract = {
        schemaVersion: VERSION, contractId: `PlayV2ModeTransitionPolicy@${VERSION}`,
        sourceState: 'postgame', targetModes: MODES, allowed: 'different-mode-only', cleanup,
        boardResetPolicy: 'legal-standard-initial-position', workerPolicy: 'zero-before-play',
        clockPolicy: 'stopped', recordPolicy: 'no-mutation-no-cross-mode-carry',
        focusDestination: 'target-mode-heading-or-first-setup-control', historyPolicy: 'canonical-router-push',
        prohibitedFallback: ['legacy-play', 'fics', 'external-provider', 'automatic-game-start'],
        sameModePostGame: 'selected-inert-no-transition', analyze: 'exclusive-back-to-postgame',
        mentor: 'exclusive-back-to-postgame', publicReady: false
    };
    function authorize(input = {}) {
        const sourceState = String(input.sourceState || '');
        const sourceMode = String(input.sourceMode || '');
        const targetMode = String(input.targetMode || '');
        if (!STATES.includes(sourceState) || !MODES.includes(sourceMode) || !MODES.includes(targetMode))
            return freeze({ ok: false, reasonCode: 'INVALID_TRANSITION_INPUT' });
        if (sourceState !== 'postgame') return freeze({ ok: false, reasonCode: 'SOURCE_STATE_PROTECTED' });
        if (sourceMode === targetMode) return freeze({ ok: false, reasonCode: 'SAME_MODE_POSTGAME' });
        return freeze({ ok: true, reasonCode: 'POSTGAME_MODE_TRANSITION_ALLOWED', value: freeze({
            sourceState, sourceMode, targetMode, cleanup, boardResetPolicy: contract.boardResetPolicy,
            workerPolicy: contract.workerPolicy, clockPolicy: contract.clockPolicy,
            recordPolicy: contract.recordPolicy, focusDestination: contract.focusDestination,
            historyPolicy: contract.historyPolicy
        }) });
    }
    root.CaissaPlayV2ModeTransitionPolicy = freeze({ ...contract, states: STATES, authorize });
})(typeof window !== 'undefined' ? window : globalThis);
