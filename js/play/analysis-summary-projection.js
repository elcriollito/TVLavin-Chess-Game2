(function installAnalysisSummaryProjection(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const QUALITY_ORDER = Object.freeze(['Book', 'Best', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const CLASSIFICATIONS = Object.freeze(['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']);
    const freeze = value => Object.freeze(value);
    const result = (ok, status, reasonCode, value = null) => freeze({ ok, status, reasonCode, value });

    function sideReview(results) {
        const counts = Object.fromEntries(CLASSIFICATIONS.map(quality => [quality, 0]));
        let best = 0;
        results.forEach(item => {
            if (CLASSIFICATIONS.includes(item.quality)) counts[item.quality] += 1;
            if (item.isBestMove === true) best += 1;
        });
        const accuracy = root.CaissaAnalyzeReviewPolicy?.accuracy?.(results);
        return freeze({ accuracy: accuracy?.ok ? accuracy.value : null, counts: freeze(counts), best });
    }

    function create(input = {}) {
        const analyze = input.analyze;
        const handoff = input.handoff;
        const phase = analyze?.analysisPhase || 'idle';
        if (!analyze || !handoff?.payload) return result(false, 'rejected', 'INVALID_ANALYSIS_EVIDENCE');
        const progress = analyze.totalPositions > 0
            ? Math.max(0, Math.min(100, Math.round((analyze.analyzedPositions / analyze.totalPositions) * 100))) : 0;
        if (phase !== 'complete') return result(true, 'accepted', 'ANALYSIS_PENDING', freeze({
            phase: phase === 'failed' || phase === 'cancelled' ? 'unavailable' : 'loading',
            progress,
            progressText: analyze.totalPositions > 0
                ? `Reviewing move ${Math.min(analyze.analyzedPositions + 1, analyze.totalPositions)} of ${analyze.totalPositions}`
                : 'Preparing your review'
        }));
        const analyzed = Array.isArray(analyze.analysisResults)
            ? analyze.analysisResults.filter(item => item && !item.unavailable) : [];
        if (!analyzed.length) return result(true, 'accepted', 'ANALYSIS_PENDING',
            freeze({ phase: 'unavailable', progress: 100 }));
        const white = sideReview(analyzed.filter(item => item.moveIndex % 2 === 0));
        const black = sideReview(analyzed.filter(item => item.moveIndex % 2 === 1));
        const playerColor = handoff.payload.playerColor === 'black' ? 'black' : 'white';
        const player = playerColor === 'white' ? white : black;
        const opponent = playerColor === 'white' ? black : white;
        const playerLabel = playerColor === 'white' ? handoff.payload.whiteLabel : handoff.payload.blackLabel;
        const opponentLabel = playerColor === 'white' ? handoff.payload.blackLabel : handoff.payload.whiteLabel;
        const rows = QUALITY_ORDER.map(quality => freeze({
            quality,
            label: quality === 'Acceptable' && input.acceptableLabel ? input.acceptableLabel : quality,
            player: quality === 'Best' ? player.best : player.counts[quality],
            opponent: quality === 'Best' ? opponent.best : opponent.counts[quality]
        })).filter(row => row.player + row.opponent > 0);
        return result(true, 'accepted', 'ANALYSIS_SUMMARY_READY', freeze({
            phase: 'summary',
            playerLabel: String(input.playerLabel || playerLabel || 'You').slice(0, 48),
            opponentLabel: String(input.opponentLabel || opponentLabel || 'CAISSA').slice(0, 48),
            playerAccuracy: player.accuracy,
            opponentAccuracy: opponent.accuracy,
            rows: freeze(rows)
        }));
    }

    root.CaissaAnalysisSummaryProjection = freeze({
        schemaVersion: SCHEMA_VERSION, qualityOrder: QUALITY_ORDER, classifications: CLASSIFICATIONS, create
    });
})(typeof window !== 'undefined' ? window : globalThis);
