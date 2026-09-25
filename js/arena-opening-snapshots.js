(function installArenaOpeningSnapshots(globalScope) {
    'use strict';

    const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    function cloneValue(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    function splitName(candidate = {}) {
        const raw = String(candidate.name || candidate.opening || candidate.title || 'Unnamed opening').trim();
        const separator = raw.indexOf(':');
        return separator < 0
            ? { openingName: raw, variationName: null }
            : {
                openingName: raw.slice(0, separator).trim(),
                variationName: raw.slice(separator + 1).trim() || null
            };
    }

    function extractMoveTokens(candidate = {}) {
        const values = Array.isArray(candidate.moves)
            ? candidate.moves
            : String(candidate.moves || candidate.ecoMovesText || candidate.movesText || '').split(/\s+/);
        return values.flatMap(value => String(value || '').trim().split(/\s+/))
            .map(value => value.replace(/^\d+\.(?:\.\.)?/, ''))
            .filter(value => value && !/^(?:\d+\.{1,3}|1-0|0-1|1\/2-1\/2|\*)$/.test(value));
    }

    function assertSixFieldFen(fen, ChessConstructor = globalScope.Chess) {
        const input = String(fen || '').trim();
        if (input.split(/\s+/).length !== 6 || typeof ChessConstructor !== 'function') {
            throw new Error('Starting position is invalid.');
        }
        try {
            const game = new ChessConstructor();
            if (game.load(input) === false) throw new Error('invalid');
            return game.fen();
        } catch (_) {
            throw new Error('Starting position is invalid.');
        }
    }

    function createStandardSnapshot() {
        return deepFreeze({
            type: 'standard',
            eco: null,
            openingName: 'Standard Position',
            variationName: null,
            sanMoves: Object.freeze([]),
            resultingFen: STANDARD_START_FEN,
            sourceId: 'standard'
        });
    }

    function createFenSnapshot(fen, ChessConstructor = globalScope.Chess) {
        return deepFreeze({
            type: 'fen',
            eco: null,
            openingName: 'Custom FEN',
            variationName: null,
            sanMoves: Object.freeze([]),
            resultingFen: assertSixFieldFen(fen, ChessConstructor),
            sourceId: null
        });
    }

    function createEcoSnapshot(candidate, ChessConstructor = globalScope.Chess) {
        const eco = String(candidate?.code || candidate?.eco || '').toUpperCase().trim();
        if (!/^[A-E]\d{2}$/.test(eco) || typeof ChessConstructor !== 'function') {
            throw new Error('Opening could not be loaded.');
        }
        const tokens = extractMoveTokens(candidate);
        if (!tokens.length) throw new Error('Selected line contains an invalid move.');
        const game = new ChessConstructor();
        const sanMoves = [];
        for (const token of tokens) {
            let move = null;
            try {
                const coordinate = token.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
                move = coordinate
                    ? game.move({ from: coordinate[1], to: coordinate[2], promotion: coordinate[3]?.toLowerCase() || 'q' })
                    : game.move(token, { sloppy: true, strict: false });
            } catch (_) {
                move = null;
            }
            if (!move) throw new Error('Selected line contains an invalid move.');
            sanMoves.push(move.san);
        }
        const names = splitName(candidate);
        return deepFreeze({
            type: 'eco',
            eco,
            openingName: names.openingName,
            variationName: names.variationName,
            sanMoves,
            resultingFen: assertSixFieldFen(game.fen(), ChessConstructor),
            sourceId: String(candidate.id || eco),
            setId: null
        });
    }

    function searchCatalog(catalog, query = '', ChessConstructor = globalScope.Chess) {
        const needle = String(query || '').trim().toLocaleLowerCase();
        const rows = [];
        const seen = new Set();
        for (const candidate of Array.isArray(catalog) ? catalog : []) {
            const names = splitName(candidate);
            const haystack = `${candidate.code || candidate.eco || ''} ${names.openingName} ${names.variationName || ''}`.toLocaleLowerCase();
            if (needle && !haystack.includes(needle)) continue;
            try {
                const snapshot = createEcoSnapshot(candidate, ChessConstructor);
                const key = `${snapshot.eco}|${snapshot.resultingFen}`;
                if (seen.has(key)) continue;
                seen.add(key);
                rows.push(Object.freeze({ candidate: deepFreeze(cloneValue(candidate)), snapshot }));
            } catch (_) {
                // Malformed catalog rows are intentionally unavailable to Match Lab.
            }
        }
        return Object.freeze(rows);
    }

    function createOpeningSet({ id, title = 'Balanced Opening Set', positions = [], playBothColors = true } = {}) {
        if (!Array.isArray(positions) || positions.length < 1) {
            throw new Error('Add at least one opening position.');
        }
        const normalized = positions.map((position, index) => {
            const snapshot = position?.resultingFen ? position : createEcoSnapshot(position);
            return {
                ...cloneValue(snapshot),
                type: snapshot.type === 'fen' ? 'fen' : 'eco',
                order: index + 1,
                setId: String(id || 'session-balanced-set')
            };
        });
        return deepFreeze({
            type: 'set',
            id: String(id || 'session-balanced-set'),
            title: String(title || 'Balanced Opening Set').trim(),
            positions: normalized,
            playBothColors: playBothColors !== false,
            gameCount: normalized.length * (playBothColors !== false ? 2 : 1)
        });
    }

    globalScope.CaissaArenaOpeningSnapshots = Object.freeze({
        STANDARD_START_FEN,
        assertSixFieldFen,
        createEcoSnapshot,
        createFenSnapshot,
        createOpeningSet,
        createStandardSnapshot,
        deepFreeze,
        extractMoveTokens,
        searchCatalog,
        splitName
    });
})(globalThis);
