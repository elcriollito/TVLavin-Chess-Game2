(function installCoachSession(global) {
    'use strict';
    const SCHEMA_VERSION = '1.3.0';
    const HISTORY_LIMIT = 8;
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
            interventionCount: 0, lastInterventionPly: null, interventionHistory: freeze([]),
            cooldowns: freeze({}), evaluationMode: profile.evaluationPolicy });
        diagnostics.starts += 1; return freeze({ ok: true, reasonCode: 'COACH_SESSION_STARTED', value: getSnapshot() });
    }
    function recordObservation() { diagnostics.observations += 1; }
    function recordIntervention(candidateOrPly) {
        if (!active) return false;
        const candidate = typeof candidateOrPly === 'object' ? candidateOrPly : null;
        const ply = candidate?.ply ?? candidateOrPly;
        const entry = freeze({ triggerCode: candidate?.triggerCode || candidate?.trigger || 'legacy',
            category: candidate?.category || null, ply, messageTemplateId: candidate?.messageTemplateId || null,
            confidence: candidate?.confidence || null, severity: candidate?.severity || null,
            conceptId: candidate?.evidence?.conceptId || null, shownAtSequence: diagnostics.interventions + 1 });
        const history = [...(active.interventionHistory || []), entry].slice(-HISTORY_LIMIT);
        const cooldowns = { ...(active.cooldowns || {}) };
        if (candidate?.cooldownGroup) cooldowns[candidate.cooldownGroup] = ply;
        active = freeze({ ...active, interventionCount: active.interventionCount + 1, lastInterventionPly: ply,
            interventionHistory: freeze(history), cooldowns: freeze(cooldowns) });
        diagnostics.interventions += 1; return true;
    }
    const getInterventionHistory = () => freeze([...(active?.interventionHistory || [])]);
    function getSummary() {
        const history = active?.interventionHistory || []; const counts = {};
        history.forEach(item => { if (item.category) counts[item.category] = (counts[item.category] || 0) + 1; });
        const frequentCategory = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0] || null;
        const conceptIds = [...new Set(history.map(item => item.conceptId).filter(Boolean))];
        return freeze({ schemaVersion: SCHEMA_VERSION, coachId: active?.coachId || null,
            focus: active?.teachingFocus || null, assistanceLevel: active?.assistanceLevel || null,
            interventionCount: history.length, frequentCategory, conceptIds: freeze(conceptIds),
            conceptCount: conceptIds.length,
            practicedHabit: frequentCategory === 'tactical' ? 'Scan checks, captures, and threats.'
                : frequentCategory === 'king-safety' ? 'Reassess king safety as lines open.'
                : frequentCategory === 'development' ? 'Bring new pieces into the game.'
                : frequentCategory === 'opposition' ? 'Check king geometry and the side to move.'
                : frequentCategory === 'passed-pawn' ? 'Coordinate the king with passed pawns.'
                : frequentCategory === 'pawn-race' ? 'Use pawn-square geometry before calculating.'
                : frequentCategory === 'king-activity' ? 'Use the king actively in reduced material.' : null,
            quiet: history.length === 0 });
    }
    function reset() { pending = null; active = null; diagnostics.resets += 1; return freeze({ ok: true, reasonCode: 'COACH_RESET' }); }
    const activeProfile = () => active ? global.CaissaCoachRegistry.get(active.coachId) : null;
    const getSearchOptions = () => active ? global.CaissaBotPresets.toEngineSearch(active.enginePresetId) : null;
    function getSnapshot() { return freeze({ schemaVersion: SCHEMA_VERSION, pending, active, activeProfile: activeProfile(),
        search: getSearchOptions(), diagnostics: freeze({ ...diagnostics }) }); }
    global.CaissaCoachSession = freeze({ schemaVersion: SCHEMA_VERSION, select, beginGame, reset, recordObservation,
        recordIntervention, getInterventionHistory, getSummary, getActiveProfile: activeProfile,
        getSearchOptions, getSnapshot, inspect: getSnapshot });
})(typeof window !== 'undefined' ? window : globalThis);
