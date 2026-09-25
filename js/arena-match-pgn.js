(function installArenaMatchPgn(globalScope) {
    'use strict';

    const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const VALID_RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
    const HEADER_ORDER = Object.freeze([
        'Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result', 'TimeControl',
        'CaissaDepth', 'ECO', 'Opening', 'Variation', 'SetUp', 'FEN',
        'CaissaTermination', 'CaissaSeriesId', 'CaissaGame', 'CaissaSeriesGames',
        'CaissaOpeningSet', 'CaissaOpeningIndex'
    ]);

    function text(value, fallback = '') {
        const normalized = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        return normalized || fallback;
    }

    function escapeHeader(value) {
        return text(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function normalizeFen(value) {
        const fen = text(value);
        return fen.split(/\s+/).length === 6 ? fen : STANDARD_START_FEN;
    }

    function pgnDate(value) {
        const date = value instanceof Date ? value : new Date(Number(value) || value || Date.now());
        if (Number.isNaN(date.getTime())) return '????.??.??';
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('.');
    }

    function normalizeResult(value) {
        return VALID_RESULTS.has(value) ? value : '*';
    }

    function timeControlHeaders(control = {}) {
        const mode = text(control.mode).toLowerCase();
        const preset = text(control.preset);
        if (mode === 'fixed-depth') {
            const depth = Number.parseInt(preset || control.depth, 10);
            return { TimeControl: '-', ...(Number.isInteger(depth) && depth > 0 ? { CaissaDepth: String(depth) } : {}) };
        }
        const match = preset.match(/^(\d+)\s*\+\s*(\d+)$/);
        if (match) return { TimeControl: `${Number(match[1]) * 60}+${Number(match[2])}` };
        if (Number.isFinite(control.initialMs)) {
            return { TimeControl: `${Math.max(0, Math.round(control.initialMs / 1000))}+${Math.max(0, Math.round((control.incrementMs || 0) / 1000))}` };
        }
        return { TimeControl: '-' };
    }

    function openingHeaders(opening = {}, series = {}) {
        const headers = {};
        const eco = text(opening.eco).toUpperCase();
        const openingName = text(opening.openingName);
        const variation = text(opening.variationName);
        if (/^[A-E]\d{2}$/.test(eco)) headers.ECO = eco;
        if (openingName && opening.type !== 'standard' && openingName !== 'Custom FEN') {
            headers.Opening = variation && !openingName.includes(variation)
                ? `${openingName}: ${variation}` : openingName;
        }
        if (variation) headers.Variation = variation;
        const setName = text(series.opening?.title || opening.setTitle || opening.setId);
        if (opening.setId || series.opening?.type === 'set') {
            headers.CaissaOpeningSet = setName || 'Balanced Opening Set';
            const index = Number(opening.order || opening.positionIndex);
            if (Number.isInteger(index) && index > 0) headers.CaissaOpeningIndex = String(index);
        }
        return headers;
    }

    function moveSan(move) {
        return text(move?.move || move?.san);
    }

    function serializeMovetext(game, result) {
        const fenParts = normalizeFen(game.startingFen || game.startFen).split(/\s+/);
        let side = fenParts[1] === 'b' ? 'b' : 'w';
        let moveNumber = Number.parseInt(fenParts[5], 10) || 1;
        const tokens = [];
        (Array.isArray(game.moves) ? game.moves : []).forEach((move, index) => {
            const san = moveSan(move);
            if (!san) return;
            if (side === 'w') tokens.push(`${moveNumber}.`);
            else if (index === 0 || !tokens.length) tokens.push(`${moveNumber}...`);
            tokens.push(san);
            if (side === 'b') moveNumber += 1;
            side = side === 'w' ? 'b' : 'w';
        });
        tokens.push(result);
        return tokens.join(' ');
    }

    function buildHeaders(game = {}, options = {}) {
        const series = options.series || {};
        const config = series.config || options.config || {};
        const result = normalizeResult(game.result);
        const startingFen = normalizeFen(game.startingFen || game.startFen || config.startingFen);
        const round = Number.parseInt(game.round, 10) || Number.parseInt(options.index, 10) + 1 || 1;
        const opening = game.opening || config.opening || {};
        const headers = {
            Event: text(config.title || options.event || game.event, 'CAISSA Engine Arena Match'),
            Site: 'CAISSA Chess',
            Date: pgnDate(game.startedAt || game.startTime || game.endedAt || game.endTime || options.date),
            Round: String(round),
            White: text(game.white?.name || game.whiteName, 'White'),
            Black: text(game.black?.name || game.blackName, 'Black'),
            Result: result,
            ...timeControlHeaders(game.timeControl || config.timeControl),
            ...openingHeaders(opening, config),
            CaissaTermination: text(game.termination, result === '*' ? 'unterminated' : 'other-existing-reason')
        };
        if (startingFen !== STANDARD_START_FEN || opening.type && opening.type !== 'standard') {
            headers.SetUp = '1';
            headers.FEN = startingFen;
        }
        const seriesId = text(series.seriesId || options.seriesId);
        const seriesGames = Number(config.gameCount || options.seriesGames);
        if (seriesId) headers.CaissaSeriesId = seriesId;
        if (Number.isInteger(round) && (seriesId || seriesGames > 1)) headers.CaissaGame = String(round);
        if (Number.isInteger(seriesGames) && seriesGames > 0) headers.CaissaSeriesGames = String(seriesGames);
        return headers;
    }

    function serializeGamePgn(game, options = {}) {
        if (!game || typeof game !== 'object') throw new TypeError('A Match Lab game record is required.');
        const result = normalizeResult(game.result);
        const headers = buildHeaders(game, options);
        const lines = HEADER_ORDER.filter(key => headers[key] !== undefined)
            .map(key => `[${key} "${escapeHeader(headers[key])}"]`);
        return `${lines.join('\n')}\n\n${serializeMovetext(game, result)}\n`;
    }

    function serializeSeriesPgn(series, options = {}) {
        const games = (Array.isArray(series?.games) ? series.games : [])
            .filter(game => game && (game.result != null || game.moves?.length));
        if (!games.length) throw new Error('No Match Lab games are available for export.');
        return games.slice(0, 100).map((game, index) => serializeGamePgn(game, {
            ...options, series, index
        }).trim()).join('\n\n') + '\n';
    }

    function sanitizeFilename(value, fallback = 'caissa-match') {
        const safe = text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
        return `${safe || fallback}.pgn`;
    }

    const api = Object.freeze({
        STANDARD_START_FEN, HEADER_ORDER, buildHeaders, escapeHeader, normalizeResult,
        pgnDate, sanitizeFilename, serializeGamePgn, serializeMovetext, serializeSeriesPgn,
        timeControlHeaders
    });
    globalScope.CaissaArenaMatchPgn = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
