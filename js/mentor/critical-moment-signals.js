(function installCriticalMomentSignals(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const phase = value => ['opening', 'middlegame', 'endgame'].includes(value) ? value : null;
    const cp = evaluation => Number.isFinite(evaluation?.cp) ? Math.round(evaluation.cp) : null;
    const mate = evaluation => Number.isInteger(evaluation?.mate) ? evaluation.mate : null;
    function extract(before, after) {
        const consecutiveMove = after.ply - before.ply === 1;
        const mover = after.mover || (after.sideToMove === 'white' ? 'black' : 'white');
        const beforeCp = cp(before.evaluation); const afterCp = cp(after.evaluation);
        const whiteDelta = beforeCp === null || afterCp === null ? null : afterCp - beforeCp;
        const moverDelta = !consecutiveMove || whiteDelta === null
            ? null : (mover === 'black' ? -whiteDelta : whiteDelta);
        const beforeMate = mate(before.evaluation); const afterMate = mate(after.evaluation);
        const playedUci = typeof after.playedMove?.uci === 'string' ? after.playedMove.uci : null;
        const bestUci = typeof before.bestMove?.uci === 'string' ? before.bestMove.uci : null;
        const phaseBefore = phase(before.phase); const phaseAfter = phase(after.phase);
        const materialBefore = Number.isFinite(before.material?.whiteMinusBlack)
            ? before.material.whiteMinusBlack : null;
        const materialAfter = Number.isFinite(after.material?.whiteMinusBlack)
            ? after.material.whiteMinusBlack : null;
        const materialDelta = materialBefore === null || materialAfter === null
            ? null : materialAfter - materialBefore;
        const terminal = after.terminal === true;
        const mateIntroduced = beforeMate === null && afterMate !== null;
        const mateEscaped = beforeMate !== null && afterMate === null;
        const mateChangedSide = beforeMate !== null && afterMate !== null
            && Math.sign(beforeMate) !== Math.sign(afterMate);
        return freeze({
            schemaVersion: SCHEMA_VERSION, consecutiveMove,
            plySpan: after.ply - before.ply, evaluationBefore: beforeCp, evaluationAfter: afterCp,
            evaluationDeltaCp: whiteDelta, moverRelativeChangeCp: moverDelta,
            playerLossCp: moverDelta === null ? null : Math.max(0, -moverDelta),
            absoluteSwingCp: whiteDelta === null ? null : Math.abs(whiteDelta),
            signTransition: beforeCp !== null && afterCp !== null
                && Math.sign(beforeCp) !== Math.sign(afterCp) ? `${Math.sign(beforeCp)}:${Math.sign(afterCp)}` : null,
            mateBefore: beforeMate, mateAfter: afterMate, mateIntroduced, mateEscaped,
            mateChangedSide, materialDelta, phaseBefore, phaseAfter,
            phaseTransition: !!phaseBefore && !!phaseAfter && phaseBefore !== phaseAfter,
            bestMoveMismatch: consecutiveMove && !!playedUci && !!bestUci
                && playedUci.toLowerCase() !== bestUci.toLowerCase(),
            forcedMove: before.forcedMove === true, terminal
        });
    }
    global.CaissaCriticalMomentSignals = freeze({ schemaVersion: SCHEMA_VERSION, extract });
})(typeof window !== 'undefined' ? window : globalThis);
