(function installBotPersonalityPolicy(global) {
    'use strict';

    const SCHEMA_VERSION = '1.1.0';
    const CONTRACT_ID = 'PlayV2BotPersonalityPolicy@1.1.0';
    const POLICIES = Object.freeze({
        beginner: Object.freeze({ id: 'beginner', candidateCount: 5, depth: 3, lossBoundaryCp: 260,
            errorRatePercent: 60, tacticalPreference: 0, stabilityPreference: 0 }),
        casual: Object.freeze({ id: 'casual', candidateCount: 4, depth: 7, lossBoundaryCp: 100,
            errorRatePercent: 10, tacticalPreference: 0, stabilityPreference: 0 }),
        tactical: Object.freeze({ id: 'tactical', candidateCount: 5, depth: 9, lossBoundaryCp: 70,
            errorRatePercent: 0, tacticalPreference: 3, stabilityPreference: 0 }),
        solid: Object.freeze({ id: 'solid', candidateCount: 5, depth: 9, lossBoundaryCp: 55,
            errorRatePercent: 0, tacticalPreference: 0, stabilityPreference: 3 })
    });
    const GLOBAL_POLICIES = Object.freeze({ legalMovesOnly: true, realPersonSimulation: 'prohibited',
        certifiedEloClaim: 'prohibited', numericRatingUntilCalibrated: 'prohibited', modelledTargetLabelRequired: true,
        ficsFallback: 'prohibited',
        remoteProvider: 'prohibited', arbitraryQueryConfiguration: 'prohibited', workerOwner: 'existing-single-owner',
        gameCommitOwner: 'existing-lifecycle', analyticsTransport: 'disabled' });
    const THRESHOLDS = Object.freeze({ legalMoveRate: 1, staleCommits: 0, duplicateCommits: 0,
        beginnerErrorRateMinimum: 0.35, casualErrorRateMaximum: 0.3,
        tacticalForcingAdvantageMinimum: 0.2, solidStabilityAdvantageMinimum: 0.2, mateCorrectness: 1 });

    function hash(value) {
        let result = 2166136261;
        for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
        return result >>> 0;
    }
    function uci(move) { return `${move.from}${move.to}${move.promotion || ''}`; }
    function quality(candidate, turn) {
        const direction = turn === 'b' ? -1 : 1;
        if (Number.isInteger(candidate.mate)) {
            const mate = candidate.mate * direction;
            return mate > 0 ? 100000 - Math.abs(mate) : -100000 + Math.abs(mate);
        }
        return Number.isFinite(candidate.score) ? Math.round(candidate.score * 100 * direction) : -200000;
    }
    function normalize(fen, candidates) {
        if (typeof global.Chess !== 'function' || typeof fen !== 'string' || !Array.isArray(candidates)) return [];
        let game;
        try { game = new global.Chess(fen); } catch (_) { return []; }
        const turn = game.turn();
        const legal = new Map(game.moves({ verbose: true }).map(move => [uci(move), move]));
        return candidates.slice(0, 5).map((candidate, index) => {
            const move = legal.get(candidate?.move);
            if (!move) return null;
            const after = new global.Chess(fen); after.move({ from: move.from, to: move.to, promotion: move.promotion });
            const replies = after.moves({ verbose: true });
            const exposure = replies.filter(reply => /[+#]/.test(reply.san) || reply.captured).length;
            return Object.freeze({ move: candidate.move, rank: Number(candidate.multipv) || index + 1,
                score: Number.isFinite(candidate.score) ? candidate.score : null,
                mate: Number.isInteger(candidate.mate) ? candidate.mate : null, quality: quality(candidate, turn),
                forcing: Number(/[+#]/.test(move.san)) * 2 + Number(Boolean(move.captured)) + Number(Boolean(move.promotion)) * 2,
                promotion: Boolean(move.promotion), exposure, san: move.san });
        }).filter(Boolean).sort((a, b) => b.quality - a.quality || a.rank - b.rank);
    }
    function policyFor(id) { return POLICIES[id] || global.CaissaBotStrengthLayer?.getPolicy?.(id) || null; }
    function select(input = {}) {
        const policy = policyFor(input.profileId);
        const normalized = normalize(input.fen, input.candidates);
        if (!policy || !normalized.length || typeof input.seed !== 'string' || !input.seed) {
            return Object.freeze({ ok: false, reasonCode: 'NO_SAFE_CANDIDATE', move: null });
        }
        const winningMate = normalized.filter(item => item.quality > 90000);
        if (winningMate.length) return Object.freeze({ ok: true, reasonCode: 'MATE_PRIORITY', move: winningMate[0].move });
        const nonMated = normalized.filter(item => item.quality > -90000);
        const viable = nonMated.length ? nonMated : normalized;
        const best = viable[0];
        if (best.promotion || best.san.includes('#'))
            return Object.freeze({ ok: true, reasonCode: 'FORCED_SAFETY_PRIORITY', move: best.move });
        const safe = viable.filter(item => best.quality - item.quality <= policy.lossBoundaryCp);
        let chosen = best; let reasonCode = 'BEST_SAFE_FALLBACK';
        if (policy.selectionStyle === 'strength-model') {
            const roll = hash(`${input.seed}|${input.fen}|${policy.id}`) % 100;
            if (roll < policy.errorRatePercent && safe.length > 1) {
                const spread = Math.min(safe.length - 1, Math.max(1, Math.ceil(policy.errorRatePercent / 25)));
                chosen = safe[1 + (hash(`${input.seed}|${input.fen}|candidate`) % spread)];
                reasonCode = 'MODELLED_STRENGTH_VARIATION';
            }
        } else if (policy.id === 'beginner' || policy.id === 'casual') {
            const roll = hash(`${input.seed}|${input.fen}|${policy.id}`) % 100;
            if (roll < policy.errorRatePercent && safe.length > 1) {
                chosen = safe[1 + (hash(`${input.seed}|candidate`) % (safe.length - 1))]; reasonCode = 'CONTROLLED_VARIATION';
            }
        } else if (policy.id === 'tactical') {
            chosen = [...safe].sort((a, b) => b.forcing - a.forcing || b.quality - a.quality || a.rank - b.rank)[0];
            reasonCode = chosen.forcing > best.forcing ? 'TACTICAL_PREFERENCE' : 'BEST_SAFE_FALLBACK';
        } else if (policy.id === 'solid') {
            chosen = [...safe].sort((a, b) => a.exposure - b.exposure || b.quality - a.quality || a.rank - b.rank)[0];
            reasonCode = chosen.exposure < best.exposure ? 'STABILITY_PREFERENCE' : 'BEST_SAFE_FALLBACK';
        }
        return Object.freeze({ ok: true, reasonCode, move: chosen.move, evidence: Object.freeze({
            candidateCount: normalized.length, safeCandidateCount: safe.length, lossCp: best.quality - chosen.quality,
            forcing: chosen.forcing, exposure: chosen.exposure }) });
    }

    global.CaissaBotPersonalityPolicy = Object.freeze({ schemaVersion: SCHEMA_VERSION, contractId: CONTRACT_ID,
        profiles: POLICIES, getProfile: policyFor, globalPolicies: GLOBAL_POLICIES, thresholds: THRESHOLDS,
        normalizeCandidates: normalize, select });
})(typeof window !== 'undefined' ? window : globalThis);
