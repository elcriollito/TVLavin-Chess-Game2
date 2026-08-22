(function (global) {
    'use strict';

    const LIMITS = Object.freeze({
        maxBytes: 10 * 1024 * 1024,
        maxGames: 6000,
        maxNodes: 750000,
        maxLinePlies: 1024,
        maxVariationDepth: 24,
        maxCommentBytes: 16 * 1024,
        maxCommentsPerGameBytes: 256 * 1024,
        maxHeaderBytes: 1024
    });
    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    class PgnLimitError extends Error {
        constructor(code, message) {
            super(message);
            this.name = 'PgnLimitError';
            this.code = code;
        }
    }

    function bytes(value) {
        return typeof TextEncoder === 'function'
            ? new TextEncoder().encode(String(value || '')).byteLength
            : Buffer.byteLength(String(value || ''), 'utf8');
    }

    function safeText(value, maxBytes = LIMITS.maxHeaderBytes) {
        const source = value && typeof value === 'object' && 'value' in value ? value.value : value;
        const text = source == null ? '' : String(source);
        if (bytes(text) <= maxBytes) return text;
        let result = text;
        while (result && bytes(result) > maxBytes) result = result.slice(0, -1);
        return result;
    }

    function normalizeHeaders(tags = {}) {
        const headers = {};
        for (const [key, value] of Object.entries(tags)) {
            if (key === 'messages' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) continue;
            headers[key] = safeText(value);
        }
        return headers;
    }

    function commentValues(rawMove, limits = LIMITS) {
        const values = [rawMove?.commentMove, rawMove?.commentBefore, rawMove?.commentAfter]
            .filter(value => typeof value === 'string' && value.trim())
            .map(value => safeText(value.trim(), limits.maxCommentBytes));
        return [...new Set(values)];
    }

    function notationOf(rawMove) {
        return safeText(rawMove?.notation?.notation || rawMove?.notation || '', 128).trim();
    }

    function normalizeNags(value) {
        const list = Array.isArray(value) ? value : value ? [value] : [];
        return list.map(nag => safeText(nag, 16)).filter(nag => /^\$\d{1,3}$|^[!?]{1,2}$/.test(nag));
    }

    function loadFen(chess, fen) {
        try {
            return chess.load(fen) !== false;
        } catch (_) {
            return false;
        }
    }

    function createGame(rawGame, gameIndex, dependencies, totals, limits = LIMITS) {
        const { Chess } = dependencies;
        const headers = normalizeHeaders(rawGame.tags);
        const startFen = headers.SetUp === '1' && headers.FEN ? headers.FEN : START_FEN;
        const initial = new Chess();
        if (startFen !== START_FEN && !loadFen(initial, startFen)) {
            throw new Error('The starting FEN is invalid.');
        }
        let sequence = 0;
        let commentsBytes = 0;

        function buildLine(rawLine, fen, depth, previousId) {
            if (depth > limits.maxVariationDepth) {
                throw new PgnLimitError('VARIATION_DEPTH', `Variation depth exceeds ${limits.maxVariationDepth}.`);
            }
            if (!Array.isArray(rawLine)) return [];
            if (rawLine.length > limits.maxLinePlies) {
                throw new PgnLimitError('LINE_LENGTH', `A line exceeds ${limits.maxLinePlies} plies.`);
            }
            const chess = new Chess();
            if (fen !== START_FEN && !loadFen(chess, fen)) throw new Error('A variation has an invalid starting position.');
            const line = [];
            let priorId = previousId;
            for (const rawMove of rawLine) {
                totals.nodes += 1;
                if (totals.nodes > limits.maxNodes) {
                    throw new PgnLimitError('NODE_COUNT', `The collection exceeds ${limits.maxNodes.toLocaleString()} move nodes.`);
                }
                const sanInput = notationOf(rawMove);
                if (!sanInput) throw new Error('A move is missing notation.');
                const fenBefore = chess.fen();
                let applied = null;
                try { applied = chess.move(sanInput, { sloppy: true, strict: false }); } catch (_) {}
                if (!applied) throw new Error(`Illegal or unsupported move: ${sanInput}`);
                const comments = commentValues(rawMove, limits);
                commentsBytes += comments.reduce((total, comment) => total + bytes(comment), 0);
                if (commentsBytes > limits.maxCommentsPerGameBytes) {
                    throw new PgnLimitError('COMMENT_TOTAL', `Comments exceed ${limits.maxCommentsPerGameBytes / 1024} KiB in one game.`);
                }
                const id = `g${gameIndex + 1}-n${++sequence}`;
                const node = {
                    id,
                    previousId: priorId,
                    nextId: null,
                    ply: line.length + 1,
                    moveNumber: Number(rawMove.moveNumber) || Math.floor((line.length + 2) / 2),
                    turn: rawMove.turn === 'b' ? 'b' : 'w',
                    san: safeText(applied.san || sanInput, 128),
                    fenBefore,
                    fenAfter: chess.fen(),
                    from: safeText(applied.from, 2),
                    to: safeText(applied.to, 2),
                    comments,
                    nags: normalizeNags(rawMove.nag),
                    variations: []
                };
                if (line.length) line[line.length - 1].nextId = id;
                line.push(node);
                const rawVariations = Array.isArray(rawMove.variations) ? rawMove.variations : [];
                node.variations = rawVariations.map(variation => buildLine(variation, fenBefore, depth + 1, priorId));
                priorId = id;
            }
            return line;
        }

        const mainline = buildLine(rawGame.moves || [], startFen, 0, null);
        return {
            id: `game-${gameIndex + 1}`,
            headers,
            startFen,
            mainline,
            nodeCount: sequence,
            result: safeText(headers.Result || '*', 16),
            label: `${safeText(headers.White || 'Unknown')} — ${safeText(headers.Black || 'Unknown')}`
        };
    }

    function parseCollection(text, dependencies, options = {}) {
        if (!dependencies || typeof dependencies.parse !== 'function' || typeof dependencies.Chess !== 'function') {
            throw new TypeError('PGN parser and Chess constructor are required.');
        }
        const source = String(text || '').replace(/^\uFEFF/, '');
        const size = bytes(source);
        const limits = { ...LIMITS, ...(options.limits || {}) };
        if (!source.trim()) throw new Error('The PGN is empty.');
        if (size > limits.maxBytes) throw new PgnLimitError('FILE_SIZE', `The PGN exceeds ${limits.maxBytes / 1024 / 1024} MiB.`);
        let parsed;
        try {
            parsed = dependencies.parse(source, { startRule: 'games' });
        } catch (_) {
            throw new Error('The PGN syntax could not be read. Check the headers and move text.');
        }
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('No chess games were found.');
        if (parsed.length > limits.maxGames) throw new PgnLimitError('GAME_COUNT', `The PGN contains more than ${limits.maxGames.toLocaleString()} games.`);
        const totals = { nodes: 0 };
        const games = [];
        const warnings = [];
        parsed.forEach((rawGame, index) => {
            const nodesBefore = totals.nodes;
            try {
                games.push(createGame(rawGame, index, dependencies, totals, limits));
            } catch (error) {
                if (error instanceof PgnLimitError) throw error;
                totals.nodes = nodesBefore;
                warnings.push({ game: index + 1, message: safeText(error.message || 'Invalid game.', 240) });
            }
        });
        if (!games.length) throw new Error('The PGN did not contain a playable game.');
        return {
            schemaVersion: 'CaissaPgnCollection@1.0.0',
            games,
            warnings,
            summary: { bytes: size, games: games.length, skippedGames: warnings.length, nodes: totals.nodes }
        };
    }

    const api = Object.freeze({ LIMITS, START_FEN, PgnLimitError, parseCollection, normalizeHeaders });
    global.CaissaPgnCore = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);