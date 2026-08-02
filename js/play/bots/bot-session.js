(function installBotSession(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    let pendingId = null;
    let activeId = null;
    let sessionId = null;
    let gameSeed = null;
    let sequence = 0;
    const diagnostics = { selections: 0, starts: 0, resets: 0, searchReads: 0 };

    function freeze(value) { return Object.freeze(value); }
    function select(id) {
        const profile = global.CaissaBotRegistry?.get?.(id);
        if (!profile?.availability?.enabled) return freeze({ ok: false, reasonCode: 'BOT_UNAVAILABLE' });
        pendingId = id; diagnostics.selections += 1;
        return freeze({ ok: true, reasonCode: 'BOT_SELECTED', value: profile });
    }
    function createSeed() {
        const values = new Uint32Array(2);
        if (global.crypto?.getRandomValues) global.crypto.getRandomValues(values);
        else { values[0] = sequence + 1; values[1] = 0x43414953; }
        return `bot-${values[0].toString(16)}${values[1].toString(16)}`;
    }
    function beginGame(options = {}) {
        const profile = global.CaissaBotRegistry?.get?.(pendingId || activeId);
        if (!profile) return freeze({ ok: false, reasonCode: 'NO_BOT_SELECTED' });
        activeId = profile.id; pendingId = profile.id; sessionId = `bot-session-${++sequence}`;
        gameSeed = typeof options.seed === 'string' && /^[a-zA-Z0-9:_-]{1,64}$/.test(options.seed)
            ? options.seed : createSeed();
        diagnostics.starts += 1;
        return freeze({ ok: true, reasonCode: 'BOT_SESSION_STARTED', value: getSnapshot() });
    }
    function resetToFullPower() {
        pendingId = null; activeId = null; sessionId = null; gameSeed = null; diagnostics.resets += 1;
        return freeze({ ok: true, reasonCode: 'FULL_POWER_RESTORED' });
    }
    function activeProfile() { return activeId ? global.CaissaBotRegistry?.get?.(activeId) : null; }
    function getSearchOptions() {
        diagnostics.searchReads += 1;
        const profile = activeProfile();
        const policy = profile ? global.CaissaBotPersonalityPolicy?.profiles?.[profile.personalityPolicyId] : null;
        return policy ? freeze({ depth: policy.depth, candidateCount: policy.candidateCount,
            personalityPolicyId: policy.id, seed: gameSeed }) : null;
    }
    function getSnapshot() {
        const selected = pendingId ? global.CaissaBotRegistry?.get?.(pendingId) : null;
        const active = activeProfile();
        const policy = active ? global.CaissaBotPersonalityPolicy?.profiles?.[active.personalityPolicyId] : null;
        return freeze({
            schemaVersion: SCHEMA_VERSION, sessionId, gameSeed, pendingBotId: pendingId, activeBotId: activeId,
            selectedProfile: selected, activeProfile: active,
            search: policy ? freeze({ depth: policy.depth, candidateCount: policy.candidateCount,
                personalityPolicyId: policy.id, seed: gameSeed }) : null,
            fullPower: !active, diagnostics: freeze({ ...diagnostics })
        });
    }
    global.CaissaBotSession = Object.freeze({
        schemaVersion: SCHEMA_VERSION, select, beginGame, resetToFullPower,
        getSearchOptions, getActiveProfile: activeProfile, getSnapshot, inspect: getSnapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
