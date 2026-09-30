(function installAnalyzeLocalBranchSession(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    if (root.CaissaAnalyzeLocalBranchSession?.schemaVersion === SCHEMA_VERSION) return;

    const snapshot = value => Object.freeze({ ...value,
        sourceMoves: Object.freeze([...(value.sourceMoves || [])]),
        localMoves: Object.freeze([...(value.localMoves || [])]) });

    function create({ handoffId = null, recordId = null, initialFen = null,
        sourceMoves = [], selectedPly = sourceMoves.length } = {}) {
        const state = {
            active: true,
            handoffId,
            recordId,
            initialFen,
            sourceMoves: [...sourceMoves],
            selectedPly: Number.isSafeInteger(selectedPly) ? selectedPly : sourceMoves.length,
            branchStartPly: null,
            localMoves: [],
            currentFen: null,
            networkPolicy: 'local-only'
        };

        return Object.freeze({
            schemaVersion: SCHEMA_VERSION,
            beginBranch({ currentMoveIndex, fen } = {}) {
                if (!state.active) return Object.freeze({ ok: false, status: 'disposed' });
                if (state.branchStartPly === null) {
                    state.branchStartPly = Math.max(0, Math.min(
                        Number.isSafeInteger(currentMoveIndex) ? currentMoveIndex + 1 : state.sourceMoves.length,
                        state.sourceMoves.length
                    ));
                }
                state.currentFen = fen || state.currentFen;
                return Object.freeze({
                    ok: true,
                    status: 'local-branch-ready',
                    branchStartPly: state.branchStartPly,
                    sourcePrefix: Object.freeze(state.sourceMoves.slice(0, state.branchStartPly))
                });
            },
            recordMove({ line = [], fen = null } = {}) {
                if (!state.active || state.branchStartPly === null) {
                    return Object.freeze({ ok: false, status: state.active ? 'branch-required' : 'disposed' });
                }
                state.localMoves = line.slice(state.branchStartPly);
                state.currentFen = fen || state.currentFen;
                return Object.freeze({ ok: true, status: 'local-move-recorded' });
            },
            inspect() { return snapshot(state); },
            dispose() {
                state.active = false;
                state.localMoves = [];
                state.currentFen = null;
                return Object.freeze({ ok: true, status: 'disposed' });
            }
        });
    }

    root.CaissaAnalyzeLocalBranchSession = Object.freeze({ schemaVersion: SCHEMA_VERSION, create });
})(window);
