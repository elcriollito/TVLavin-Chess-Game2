import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { PgnOpeningProxyClient, PGN_OPENING_PROXY_PAGE_SIZE } from '../pgn-replayer/pgn-opening-proxy-client.js';

const RESULT_PAGE_SIZE = 10;

function parseHeaders(pgn) {
    const headers = {};
    for (const line of String(pgn || '').split(/\r?\n/)) {
        const match = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$/);
        if (match) headers[match[1]] = match[2];
    }
    return headers;
}

export function splitPgnGames(text) {
    return String(text || '')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n?/g, '\n')
        .split(/(?=^\[Event\s+")/m)
        .map(game => game.trim())
        .filter(game => game.startsWith('[Event ') && game.includes('[White ') && game.includes('[Black '));
}

function fallbackSanTokens(pgn) {
    let text = String(pgn || '').replace(/\r/g, '\n');
    text = text.replace(/^\[[^\]]*\]\s*$/gm, ' ');
    text = text.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ').replace(/\$\d+/g, ' ');
    for (let index = 0; index < 8; index += 1) {
        const next = text.replace(/\([^()]*\)/g, ' ');
        if (next === text) break;
        text = next;
    }
    const tokens = [];
    for (let token of text.split(/\s+/).filter(Boolean)) {
        if (/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(token)) break;
        token = token.replace(/^\d+\.(?:\.\.)?/, '').replace(/^\.{3}/, '').replace(/[!?]+/g, '').trim();
        if (token) tokens.push(token);
    }
    return tokens;
}

function parseGame(pgn) {
    let sanTokens = [];
    try {
        const parsed = new Chess();
        parsed.loadPgn(pgn, { strict: false });
        sanTokens = parsed.history({ verbose: true }).map(move => move.san);
    } catch {
        sanTokens = fallbackSanTokens(pgn);
    }
    const timeline = new Chess();
    const moves = [];
    for (const san of sanTokens) {
        let applied = null;
        try { applied = timeline.move(san, { strict: false }); } catch { applied = null; }
        if (!applied) break;
        moves.push(Object.freeze({
            from: applied.from,
            to: applied.to,
            promotion: applied.promotion || null,
            uci: `${applied.from}${applied.to}${applied.promotion || ''}`,
            san: applied.san,
            color: applied.color,
            fenAfter: timeline.fen()
        }));
    }
    if (!moves.length) throw new Error('The selected PGN contains no legal moves.');
    return Object.freeze({
        pgn,
        headers: Object.freeze(parseHeaders(pgn)),
        moves: Object.freeze(moves),
        notationComplete: moves.length === sanTokens.length
    });
}

function normalizeSearch(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function searchTokens(values) {
    return [...new Set(values.flatMap(value => normalizeSearch(value).split(/\s+/)).filter(token => token.length >= 2))];
}

export function rankOpeningCollections(catalog, query, aliases = []) {
    const primary = searchTokens([query]);
    const expanded = searchTokens([query, ...aliases]);
    if (!expanded.length) return Object.freeze([]);
    const ranked = catalog.openings.map(opening => {
        const haystack = normalizeSearch(`${opening.title} ${opening.file.replace(/\.zip$/i, '')}`);
        const primaryMatches = primary.filter(token => haystack.includes(token)).length;
        const expandedMatches = expanded.filter(token => haystack.includes(token)).length;
        const exact = normalizeSearch(opening.title) === normalizeSearch(query) ? 1 : 0;
        return { opening, score: exact * 1000 + primaryMatches * 100 + expandedMatches };
    }).filter(item => item.score > 0)
        .sort((left, right) => right.score - left.score || left.opening.title.localeCompare(right.opening.title, 'en'));
    return Object.freeze(ranked.map(item => item.opening));
}

function gameId(opening, proxyPage, index) {
    const stem = opening.id.replace(/[^a-z0-9-]/gi, '').slice(0, 72);
    return `proxy_${stem}_${proxyPage}_${index}`;
}

export class OpeningGamesClient {
    #proxy;
    #loadedGames = new Map();

    constructor({ fetchFn = globalThis.fetch, proxyClient = null } = {}) {
        this.#proxy = proxyClient || new PgnOpeningProxyClient({ fetchFn });
    }

    async search({ query, aliases = [], page = 1, signal, limit = RESULT_PAGE_SIZE } = {}) {
        const safeLimit = Math.min(RESULT_PAGE_SIZE, Math.max(1, Number(limit) || RESULT_PAGE_SIZE));
        if (!Number.isSafeInteger(page) || page < 1) throw new TypeError('Invalid game-results page.');
        const catalog = await this.#proxy.loadCatalog({ signal });
        const matches = rankOpeningCollections(catalog, query, aliases);
        if (!matches.length) {
            return Object.freeze({ query: String(query || ''), collection: null, total: 0, page: 1, pageCount: 0, games: Object.freeze([]) });
        }
        const collection = matches[0];
        const zeroBased = (page - 1) * safeLimit;
        const proxyPage = Math.floor(zeroBased / PGN_OPENING_PROXY_PAGE_SIZE) + 1;
        const offset = zeroBased % PGN_OPENING_PROXY_PAGE_SIZE;
        const payload = await this.#proxy.loadPage(collection.file, proxyPage, { signal });
        const rawGames = splitPgnGames(payload.text);
        if (rawGames.length !== payload.pageGames) throw new Error('The CAISSA PGN proxy page count does not match its payload.');
        const games = [];
        rawGames.slice(offset, offset + safeLimit).forEach((pgn, index) => {
            const headers = parseHeaders(pgn);
            const id = gameId(collection, proxyPage, offset + index);
            const summary = Object.freeze({
                gameId: id,
                white: String(headers.White || 'Unknown'),
                black: String(headers.Black || 'Unknown'),
                result: String(headers.Result || '*'),
                event: String(headers.Event || ''),
                site: String(headers.Site || ''),
                date: String(headers.Date || ''),
                year: Number.parseInt(String(headers.Date || '').slice(0, 4), 10) || null,
                eco: String(headers.ECO || ''),
                whiteElo: Number(headers.WhiteElo) || null,
                blackElo: Number(headers.BlackElo) || null,
                collectionId: collection.id,
                collectionTitle: collection.title,
                collectionFile: collection.file,
                proxyPage
            });
            this.#loadedGames.set(id, Object.freeze({ summary, pgn }));
            games.push(summary);
        });
        const pageCount = Math.ceil(payload.totalGames / safeLimit);
        return Object.freeze({
            query: String(query || ''),
            collection,
            source: payload.source,
            total: payload.totalGames,
            page,
            pageCount,
            games: Object.freeze(games)
        });
    }

    async loadGame(game) {
        const id = String(game?.gameId || '');
        const cached = this.#loadedGames.get(id);
        if (!cached) throw new Error('The selected game is no longer available in this search page.');
        const parsed = parseGame(cached.pgn);
        return Object.freeze({
            ...parsed,
            gameId: id,
            sourceUrl: `/api/pgn/opening?file=${encodeURIComponent(game.collectionFile || '')}&page=${game.proxyPage || 1}`
        });
    }
}

export default OpeningGamesClient;
