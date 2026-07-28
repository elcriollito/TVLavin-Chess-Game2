/**
 * Independent Analyze chess-state session 1.0.0.
 */
(function installAnalyzeSession(global) {
    'use strict';
    const VERSION = '1.0.0';
    if (global.CaissaAnalyzeSession?.schemaVersion === VERSION) return;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    function createSession({ ChessFactory = global.Chess, initialFen = null, pgn = null, selectedPly = null } = {}) {
        if (typeof ChessFactory !== 'function') return null;
        const game = new ChessFactory();
        try {
            if (pgn) {
                const loadPgn = game.load_pgn || game.loadPgn;
                if (typeof loadPgn !== 'function') return null;
                const loaded = loadPgn.call(game, pgn);
                if (loaded === false) return null;
            } else if (initialFen) {
                const loaded = game.load(initialFen);
                if (loaded === false) return null;
            }
        } catch (_) { return null; }
        const startFen = game.header?.().SetUp === '1' ? game.header().FEN : initialFen;
        const moves = game.history();
        const target = Number.isSafeInteger(selectedPly) ? Math.max(-1, Math.min(selectedPly - 1, moves.length - 1)) : moves.length - 1;
        function jumpTo(index) {
            const safe = Math.max(-1, Math.min(index, moves.length - 1));
            try {
                if (startFen) game.load(startFen); else game.reset();
            } catch (_) { return freeze({ ok: false, status: 'invalid-position' }); }
            for (let i = 0; i <= safe; i += 1) {
                if (!game.move(moves[i])) return freeze({ ok: false, status: 'invalid-move' });
            }
            return freeze({ ok: true, status: 'selected', selectedPly: safe, fen: game.fen() });
        }
        jumpTo(target);
        return { schemaVersion: VERSION, game, moves: moves.slice(), initialFen: startFen || null,
            selectedPly: target, jumpTo, dispose() { return freeze({ ok: true, status: 'disposed' }); } };
    }
    global.CaissaAnalyzeSession = freeze({ schemaVersion: VERSION, createSession });
})(window);
