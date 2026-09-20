/**
 * CAISSA ECO opening resolver.
 *
 * Resolves a played move history against the canonical ECO catalog loaded from
 * /data/eco/eco_codes.json. The catalog remains owned by that JSON resource;
 * this module only builds a normalized in-memory projection.
 */
(function(global) {
    'use strict';

    const CATALOG_URL = '/data/eco/eco_codes.json';
    let catalogPromise = null;

    function stripMoveNumber(value) {
        return String(value || '')
            .trim()
            .replace(/^\d+\.(?:\.\.)?/, '');
    }

    function normalizeSan(value) {
        return stripMoveNumber(value)
            .replace(/^o-o-o$/i, 'O-O-O')
            .replace(/^o-o$/i, 'O-O')
            .replace(/[!?+#]+/g, '')
            .replace(/\s+/g, '')
            .trim();
    }

    function extractCatalogMoves(candidate = {}) {
        const source = Array.isArray(candidate.moves)
            ? candidate.moves
            : String(candidate.moves || candidate.ecoMovesText || candidate.movesText || '').split(/\s+/);
        return source
            .map(stripMoveNumber)
            .filter((move) => move && !/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(move))
            .map(normalizeSan)
            .filter(Boolean);
    }

    function normalizePlayedMoves(moveHistory = [], ChessConstructor = global.Chess) {
        const rawMoves = (Array.isArray(moveHistory) ? moveHistory : [])
            .map((move) => typeof move === 'string' ? move : move?.san || move?.uci || move?.verbose)
            .map(stripMoveNumber)
            .filter((move) => move && !/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(move));
        if (!rawMoves.length) return [];

        if (typeof ChessConstructor !== 'function') return rawMoves.map(normalizeSan).filter(Boolean);

        let game;
        try {
            game = new ChessConstructor();
        } catch {
            return rawMoves.map(normalizeSan).filter(Boolean);
        }

        return rawMoves.map((raw) => {
            let result = null;
            try {
                const coordinate = raw.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
                result = coordinate
                    ? game.move({ from: coordinate[1], to: coordinate[2], promotion: coordinate[3]?.toLowerCase() || 'q' })
                    : game.move(raw, { sloppy: true, strict: false });
            } catch {
                result = null;
            }
            return normalizeSan(result?.san || raw);
        }).filter(Boolean);
    }

    function resolve(moveHistory = [], catalog = [], options = {}) {
        const played = normalizePlayedMoves(moveHistory, options.ChessConstructor);
        if (!played.length) {
            return Object.freeze({ status: 'insufficient', name: 'Detecting…', eco: '', href: null, matchedDepth: 0 });
        }

        let best = null;
        let bestDepth = 0;
        (Array.isArray(catalog) ? catalog : []).forEach((candidate) => {
            const moves = extractCatalogMoves(candidate);
            if (!moves.length || moves.length > played.length || moves.length <= bestDepth) return;
            if (!moves.every((move, index) => move === played[index])) return;
            const eco = String(candidate.code || candidate.eco || '').toUpperCase();
            if (!/^[A-E]\d{2}$/.test(eco)) return;
            bestDepth = moves.length;
            best = {
                status: 'recognized',
                name: candidate.name || candidate.opening || candidate.title || 'Unknown opening',
                eco,
                href: `/eco/${eco}`,
                matchedDepth: bestDepth
            };
        });

        return Object.freeze(best || {
            status: 'unknown', name: 'Unknown opening', eco: '', href: null, matchedDepth: 0
        });
    }

    function loadCatalog(fetchImpl = global.fetch) {
        if (Array.isArray(global.App?.ecoCodeRows) && global.App.ecoCodeRows.length) {
            return Promise.resolve(global.App.ecoCodeRows);
        }
        if (catalogPromise) return catalogPromise;
        if (typeof fetchImpl !== 'function') return Promise.resolve([]);
        catalogPromise = fetchImpl(CATALOG_URL, { cache: 'no-cache' })
            .then((response) => {
                if (!response.ok) throw new Error(`ECO catalog request failed (${response.status})`);
                return response.json();
            })
            .then((rows) => Array.isArray(rows) ? rows : [])
            .catch((error) => {
                catalogPromise = null;
                console.warn('[ECO Resolver] Could not load canonical ECO catalog:', error);
                return [];
            });
        return catalogPromise;
    }

    global.CaissaEcoOpeningResolver = Object.freeze({
        CATALOG_URL,
        normalizeSan,
        normalizePlayedMoves,
        extractCatalogMoves,
        resolve,
        loadCatalog
    });
})(typeof window !== 'undefined' ? window : globalThis);
