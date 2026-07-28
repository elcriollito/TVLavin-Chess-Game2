(function installCoachSession(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    let pending = null; let active = null; let sequence = 0;
    const diagnostics = { selections: 0, starts: 0, resets: 0, observations: 0, interventions: 0 };
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
        return value;
    };
    function select(input = {}) {
        const profile = global.CaissaCoachRegistry.get(input.coachId);
        if (!profile || !global.CaissaCoachInterventionPolicy.assistanceLevels.includes(input.assistanceLevel))
            return freeze({ ok: false, reasonCode: 'INVALID_SELECTION' });
        pending = freeze({ coachId: profile.id, learnerLevel: input.learnerLevel || profile.learnerLevel,
            teachingFocus: input.teachingFocus || profile.teachingFocus, assistanceLevel: input.assistanceLevel,
            playerColor: input.playerColor === 'black' ? 'black' : 'white',
            timeControl: Number.isFinite(input.timeControl) ? Math.max(0, input.timeControl) : 0 });
        diagnostics.selections += 1; return freeze({ ok: true, reasonCode: 'COACH_SELECTED', value: pending });
    }
    function beginGame() {
        if (!pending && active) pending = freeze({ ...active, sessionId: undefined, interventionCount: undefined, lastInterventionPly: undefined });
        const profile = global.CaissaCoachRegistry.get(pending?.coachId);
        if (!profile) return freeze({ ok: false, reasonCode: 'NO_COACH_SELECTED' });
        active = freeze({ schemaVersion: SCHEMA_VERSION, ...pending, coachVersion: profile.version,
            enginePresetId: profile.engineFoundation.presetId, lifecycleSessionId: null,
            sessionId: `coach-session-${++sequence}`, createdAt: sequence,
            interventionCount: 0, lastInterventionPly: null, evaluationMode: profile.evaluationPolicy });
        diagnostics.starts += 1; return freeze({ ok: true, reasonCode: 'COACH_SESSION_STARTED', value: getSnapshot() });
    }
    function recordObservation() { diagnostics.observations += 1; }
    function recordIntervention(ply) {
        if (!active) return false;
        active = freeze({ ...active, interventionCount: active.interventionCount + 1, lastInterventionPly: ply });
        diagnostics.interventions += 1; return true;
    }
    function reset() { pending = null; active = null; diagnostics.resets += 1; return freeze({ ok: true, reasonCode: 'COACH_RESET' }); }
    const activeProfile = () => active ? global.CaissaCoachRegistry.get(active.coachId) : null;
    const getSearchOptions = () => active ? global.CaissaBotPresets.toEngineSearch(active.enginePresetId) : null;
    function getSnapshot() { return freeze({ schemaVersion: SCHEMA_VERSION, pending, active, activeProfile: activeProfile(),
        search: getSearchOptions(), diagnostics: freeze({ ...diagnostics }) }); }
    global.CaissaCoachSession = freeze({ schemaVersion: SCHEMA_VERSION, select, beginGame, reset, recordObservation,
        recordIntervention, getActiveProfile: activeProfile, getSearchOptions, getSnapshot, inspect: getSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
