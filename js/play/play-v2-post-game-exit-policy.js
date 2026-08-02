(function installPostGameExitPolicy(root) {
    'use strict';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
        return value;
    };
    const inventoryBase = {
        rematch: { owner: 'post-game-core', destination: 'Play-v2-new-lifecycle', completedRecordRequired: true, handoff: 'none', back: 'new-lifecycle-history', classification: 'allowed' },
        'new-game': { owner: 'post-game-core', destination: 'Play-v2-clean-setup', completedRecordRequired: true, handoff: 'none', back: 'setup-state', classification: 'allowed' },
        analyze: { owner: 'post-game-core+analyze-handoff', destination: 'Analyze', completedRecordRequired: true, handoff: 'opaque-local-token', back: 'same-completed-PostGame', classification: 'allowed' },
        'mentor-review': { owner: 'post-game-core+native-mentor-review', destination: 'isolated-review-workspace', completedRecordRequired: true, handoff: 'opaque-128-bit-local-token', back: 'same-completed-PostGame', classification: 'allowed' },
        'copy-pgn': { owner: 'post-game-core', destination: 'remain-PostGame', completedRecordRequired: true, handoff: 'clipboard-only', back: 'unchanged', classification: 'allowed-non-exit' },
        'download-pgn': { owner: 'post-game-core', destination: 'remain-PostGame', completedRecordRequired: true, handoff: 'temporary-object-url', back: 'unchanged', classification: 'allowed-non-exit' },
        'save-game': { owner: 'game-record-persistence', destination: 'remain-PostGame', completedRecordRequired: true, handoff: 'consent-controlled-local', back: 'unchanged', classification: 'allowed-non-exit' },
        'browser-back': { owner: 'play-route-controller+workspace-owner', destination: 'previous-owned-state', completedRecordRequired: false, handoff: 'history-state-only', back: 'deterministic', classification: 'allowed' },
        'browser-forward': { owner: 'play-route-controller+workspace-owner', destination: 'owned-history-state', completedRecordRequired: false, handoff: 'history-state-only', back: 'deterministic', classification: 'allowed' },
        refresh: { owner: 'browser+entry-gate', destination: 'gated-entry', completedRecordRequired: false, handoff: 'bounded-session-resolution', back: 'browser-owned', classification: 'allowed-fail-closed' },
        'route-exit': { owner: 'play-route-controller', destination: 'allowlisted-CAISSA-route', completedRecordRequired: false, handoff: 'none', back: 'route-controller', classification: 'allowed-fail-closed' },
        'gate-disable': { owner: 'play-v2-beta-entry', destination: 'accessible-unavailable-state', completedRecordRequired: false, handoff: 'none', back: 'browser-owned', classification: 'allowed-fail-closed' },
        'invalid-handoff': { owner: 'destination-handoff-owner', destination: 'safe-unavailable-state', completedRecordRequired: false, handoff: 'rejected', back: 'PostGame-where-supported', classification: 'allowed-fail-closed' },
        'legacy-play': { owner: 'product-boundary', destination: 'none', completedRecordRequired: false, handoff: 'prohibited', back: 'unchanged', classification: 'prohibited' },
        fics: { owner: 'fics-isolation', destination: 'none', completedRecordRequired: false, handoff: 'prohibited', back: 'unchanged', classification: 'prohibited' },
        education: { owner: 'product-boundary', destination: 'none', completedRecordRequired: false, handoff: 'prohibited', back: 'unchanged', classification: 'prohibited' }
    };
    const inventory = freeze(Object.fromEntries(Object.entries(inventoryBase).map(([key, value]) => [key, {
        runtimeCleanup: 'owned-bounded-cleanup', failureBehavior: 'retain-safe-owned-state',
        privacyBehavior: 'local-minimum-necessary', ...value
    }])));
    const contract = {
        schemaVersion: '1.0.0', contractId: 'PlayV2PostGameExitPolicy@1.0.0', source: 'finalized-PostGame',
        automaticNavigation: 'prohibited', silentFallback: 'prohibited', legacyPlayFallback: 'prohibited', ficsFallback: 'prohibited',
        rematch: 'internal-new-lifecycle', newGame: 'internal-clean-setup', analyze: 'explicit-external-continuation',
        mentorReview: 'explicit-optional-review', academyRecommendation: 'prohibited', puzzleRecommendation: 'prohibited',
        endgameTrainerRecommendation: 'prohibited', endgameLibraryRecommendation: 'prohibited', courseRecommendation: 'prohibited',
        completedRecordMutation: 'prohibited', pgnInUrl: 'prohibited', fenInUrl: 'prohibited', analyticsTransport: 'disabled',
        returnToPostGame: 'deterministic-where-supported', inventory
    };
    const transitions = new Set(['rematch', 'new-game', 'analyze', 'mentor-review']);
    function authorize(action, record) {
        const entry = inventory[action];
        if (!entry || entry.classification === 'prohibited') return freeze({ ok: false, reasonCode: 'EXIT_PROHIBITED' });
        if (entry.completedRecordRequired && (!record?.result?.complete || !['completed', 'aborted'].includes(record.status)))
            return freeze({ ok: false, reasonCode: 'FINALIZED_RECORD_REQUIRED' });
        return freeze({ ok: true, reasonCode: transitions.has(action) ? 'EXIT_ALLOWED' : 'POSTGAME_ACTION_ALLOWED', value: entry });
    }
    function prepare(action, record) {
        const allowed = authorize(action, record); if (!allowed.ok || !transitions.has(action)) return allowed;
        root.CaissaClockService?.stop?.(`postgame-exit:${action}`);
        root.CaissaEngineRequestIsolation?.cancelSession?.();
        const worker = root.CaissaPlayV2BotWorkerReadiness?.getSnapshot?.();
        if (worker && ['initializing', 'ready', 'playing'].includes(worker.state)) root.CaissaPlayV2BotWorkerReadiness.teardown('route-exit');
        return freeze({ ok: true, reasonCode: 'EXIT_PREPARED', value: freeze({ action, clockStopped: true,
            engineCancelled: true, workerStopped: true, coachAssistanceTerminal: true, completedRecordMutations: 0 }) });
    }
    root.CaissaPlayV2PostGameExitPolicy = freeze({ ...contract, authorize, prepare });
})(typeof window !== 'undefined' ? window : globalThis);
