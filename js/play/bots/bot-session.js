(function installBotSession(global) {
    'use strict';

    const SCHEMA_VERSION = '1.2.0';
    let pendingId = null;
    let activeId = null;
    let pendingPresentation = null;
    let activePresentation = null;
    let pendingStrengthProfile = null;
    let activeStrengthProfile = null;
    let sessionId = null;
    let gameSeed = null;
    let sequence = 0;
    const diagnostics = { selections: 0, starts: 0, resets: 0, searchReads: 0 };

    function freeze(value) { return Object.freeze(value); }
    function select(id) {
        const profile = global.CaissaBotRegistry?.get?.(id);
        if (!profile?.availability?.enabled) return freeze({ ok: false, reasonCode: 'BOT_UNAVAILABLE' });
        pendingId = id; pendingPresentation = null; pendingStrengthProfile = null; diagnostics.selections += 1;
        return freeze({ ok: true, reasonCode: 'BOT_SELECTED', value: profile });
    }
    function selectPresentation(botId) {
        const resolved = global.CaissaBotCollectionRegistry?.resolveBot?.(botId);
        const bot = resolved?.bot;
        const category = bot ? global.CaissaBotCollections?.category?.(bot.categoryId) : null;
        const engineProfile = bot?.engineProfileId ? global.CaissaBotRegistry?.get?.(bot.engineProfileId) : null;
        const strengthProfile = bot?.strengthProfileId ? global.CaissaBotStrengthLayer?.get?.(bot.strengthProfileId) : null;
        if (!bot || bot.availability !== 'qa-only' || !category || (!engineProfile && !strengthProfile))
            return freeze({ ok: false, reasonCode: 'BOT_UNAVAILABLE' });
        if (engineProfile) {
            const selected = select(bot.engineProfileId); if (!selected.ok) return selected;
        } else {
            pendingId = resolved.reference; pendingStrengthProfile = strengthProfile; diagnostics.selections += 1;
        }
        pendingPresentation = freeze({ id: resolved.reference, botId: bot.id, name: bot.name,
            collectionId: resolved.collection.id, collectionTitle: resolved.collection.title,
            categoryId: bot.categoryId, targetStrength: bot.targetStrength,
            piece: category.piece, symbol: category.symbol });
        return freeze({ ok: true, reasonCode: 'BOT_PRESENTATION_SELECTED', value: pendingPresentation });
    }
    function createSeed() {
        const values = new Uint32Array(2);
        if (global.crypto?.getRandomValues) global.crypto.getRandomValues(values);
        else { values[0] = sequence + 1; values[1] = 0x43414953; }
        return `bot-${values[0].toString(16)}${values[1].toString(16)}`;
    }
    function beginGame(options = {}) {
        const profile = global.CaissaBotRegistry?.get?.(pendingId || activeId);
        const strengthProfile = profile ? null : (pendingStrengthProfile || activeStrengthProfile);
        if (!profile && !strengthProfile) return freeze({ ok: false, reasonCode: 'NO_BOT_SELECTED' });
        activeId = profile?.id || pendingPresentation?.id || activePresentation?.id;
        pendingId = activeId; activeStrengthProfile = strengthProfile; sessionId = `bot-session-${++sequence}`;
        activePresentation = pendingPresentation;
        gameSeed = typeof options.seed === 'string' && /^[a-zA-Z0-9:_-]{1,64}$/.test(options.seed)
            ? options.seed : createSeed();
        diagnostics.starts += 1;
        return freeze({ ok: true, reasonCode: 'BOT_SESSION_STARTED', value: getSnapshot() });
    }
    function resetToFullPower() {
        pendingId = null; activeId = null; pendingPresentation = null; activePresentation = null;
        pendingStrengthProfile = null; activeStrengthProfile = null;
        sessionId = null; gameSeed = null; diagnostics.resets += 1;
        return freeze({ ok: true, reasonCode: 'FULL_POWER_RESTORED' });
    }
    function activeProfile() { return activeId ? global.CaissaBotRegistry?.get?.(activeId) : null; }
    function getSearchOptions() {
        diagnostics.searchReads += 1;
        if (activeStrengthProfile) return freeze({ depth: activeStrengthProfile.search.depth,
            candidateCount: activeStrengthProfile.search.candidateCount,
            personalityPolicyId: activeStrengthProfile.policy.id, seed: gameSeed });
        const profile = activeProfile();
        const policy = profile ? global.CaissaBotPersonalityPolicy?.profiles?.[profile.personalityPolicyId] : null;
        return policy ? freeze({ depth: policy.depth, candidateCount: policy.candidateCount,
            personalityPolicyId: policy.id, seed: gameSeed }) : null;
    }
    function getSnapshot() {
        const selected = pendingId ? global.CaissaBotRegistry?.get?.(pendingId) : null;
        const active = activeProfile();
        const policy = active ? global.CaissaBotPersonalityPolicy?.profiles?.[active.personalityPolicyId] : null;
        const search = activeStrengthProfile ? freeze({ depth: activeStrengthProfile.search.depth,
            candidateCount: activeStrengthProfile.search.candidateCount,
            personalityPolicyId: activeStrengthProfile.policy.id, seed: gameSeed })
            : policy ? freeze({ depth: policy.depth, candidateCount: policy.candidateCount,
                personalityPolicyId: policy.id, seed: gameSeed }) : null;
        return freeze({
            schemaVersion: SCHEMA_VERSION, sessionId, gameSeed, pendingBotId: pendingId, activeBotId: activeId,
            selectedProfile: selected, activeProfile: active,
            selectedPresentation: pendingPresentation, activePresentation,
            selectedStrengthProfile: pendingStrengthProfile, activeStrengthProfile,
            search, fullPower: !active && !activeStrengthProfile, diagnostics: freeze({ ...diagnostics })
        });
    }
    global.CaissaBotSession = Object.freeze({
        schemaVersion: SCHEMA_VERSION, select, selectPresentation, beginGame, resetToFullPower,
        getSearchOptions, getActiveProfile: activeProfile, getSnapshot, inspect: getSnapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
