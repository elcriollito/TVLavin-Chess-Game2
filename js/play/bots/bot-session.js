(function installBotSession(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    let pendingId = null;
    let activeId = null;
    let sessionId = null;
    let sequence = 0;
    const diagnostics = { selections: 0, starts: 0, resets: 0, searchReads: 0 };

    function freeze(value) { return Object.freeze(value); }
    function select(id) {
        const profile = global.CaissaBotRegistry?.get?.(id);
        if (!profile?.availability?.enabled) return freeze({ ok: false, reasonCode: 'BOT_UNAVAILABLE' });
        pendingId = id; diagnostics.selections += 1;
        return freeze({ ok: true, reasonCode: 'BOT_SELECTED', value: profile });
    }
    function beginGame() {
        const profile = global.CaissaBotRegistry?.get?.(pendingId || activeId);
        if (!profile) return freeze({ ok: false, reasonCode: 'NO_BOT_SELECTED' });
        activeId = profile.id; pendingId = profile.id; sessionId = `bot-session-${++sequence}`;
        diagnostics.starts += 1;
        return freeze({ ok: true, reasonCode: 'BOT_SESSION_STARTED', value: getSnapshot() });
    }
    function resetToFullPower() {
        pendingId = null; activeId = null; sessionId = null; diagnostics.resets += 1;
        return freeze({ ok: true, reasonCode: 'FULL_POWER_RESTORED' });
    }
    function activeProfile() { return activeId ? global.CaissaBotRegistry?.get?.(activeId) : null; }
    function getSearchOptions() {
        diagnostics.searchReads += 1;
        const profile = activeProfile();
        return profile ? global.CaissaBotPresets.toEngineSearch(profile.enginePresetId) : null;
    }
    function getSnapshot() {
        const selected = pendingId ? global.CaissaBotRegistry?.get?.(pendingId) : null;
        const active = activeProfile();
        return freeze({
            schemaVersion: SCHEMA_VERSION, sessionId, pendingBotId: pendingId, activeBotId: activeId,
            selectedProfile: selected, activeProfile: active,
            search: active ? global.CaissaBotPresets.toEngineSearch(active.enginePresetId) : null,
            fullPower: !active, diagnostics: freeze({ ...diagnostics })
        });
    }
    global.CaissaBotSession = Object.freeze({
        schemaVersion: SCHEMA_VERSION, select, beginGame, resetToFullPower,
        getSearchOptions, getActiveProfile: activeProfile, getSnapshot, inspect: getSnapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
