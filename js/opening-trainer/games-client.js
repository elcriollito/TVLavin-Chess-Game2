import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

const REMOTE_ROOT = 'https://downloads.caissa-chess.org';
const MAX_PUBLIC_PGN_BYTES = 2 * 1024 * 1024;

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
        .filter(game => game.startsWith('[Event '));
}

function sameMetadata(headers, game) {
    return String(headers.White || '') === game.white
        && String(headers.Black || '') === game.black
        && String(headers.Result || '*') === game.result
        && String(headers.Event || '') === game.event
        && String(headers.Site || '') === game.site
        && String(headers.Date || '') === game.date;
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

export function buildLineKey(moves = [], maxPlies = 10) {
    return (Array.isArray(moves) ? moves : [])
        .map(move => String(move?.uci || `${move?.from || ''}${move?.to || ''}${move?.promotion || ''}`).toLowerCase())
        .filter(uci => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))
        .slice(-Math.max(1, maxPlies))
        .join(' ');
}

export class OpeningGamesClient {
    #fetch;
    #maxPlies = 10;
    #libraryPromise = null;
    #loadedGames = new Map();

    constructor({ fetchFn = globalThis.fetch } = {}) {
        this.#fetch = typeof fetchFn === 'function' ? fetchFn.bind(globalThis) : fetchFn;
    }

    async #json(path, signal) {
        let lastError = null;
        for (const url of [path, `${REMOTE_ROOT}${path}`]) {
            try {
                const response = await this.#fetch(url, { signal, credentials: 'omit', headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (error) {
                lastError = error;
                if (signal?.aborted) throw error;
            }
        }
        throw lastError || new Error('Game search is unavailable.');
    }

    async search(moves, { signal, limit = 10 } = {}) {
        try {
            const manifest = await this.#json('/gamesearch/manifest.json', signal);
            if (Number.isInteger(manifest?.maxPlies)) this.#maxPlies = manifest.maxPlies;
        } catch {
            // The line endpoint is still useful when the manifest is temporarily unavailable.
        }
        const lineKey = buildLineKey(moves, this.#maxPlies);
        if (!lineKey) return Object.freeze({ lineKey: '', total: 0, games: Object.freeze([]) });
        const payload = await this.#json(`/gamesearch/line?lineKey=${encodeURIComponent(lineKey)}`, signal);
        if (!payload?.ok) throw new Error('No indexed game response was returned.');
        const games = (Array.isArray(payload.top) ? payload.top : []).slice(0, Math.min(10, Math.max(1, limit))).map(row => Object.freeze({
            gameId: String(row?.gameId || ''),
            white: String(row?.white || 'Unknown'),
            black: String(row?.black || 'Unknown'),
            result: String(row?.result || '*'),
            event: String(row?.event || row?.site || ''),
            site: String(row?.site || ''),
            date: String(row?.date || ''),
            year: Number(row?.year) || null,
            eco: String(row?.eco || ''),
            whiteElo: Number(row?.whiteElo) || null,
            blackElo: Number(row?.blackElo) || null
        }));
        return Object.freeze({ lineKey, total: Number(payload.games) || games.length, games: Object.freeze(games) });
    }

    async #libraryFiles(signal) {
        if (!this.#libraryPromise) {
            this.#libraryPromise = (async () => {
                const response = await this.#fetch('/pgn/library.json', {
                    signal,
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' }
                });
                if (!response.ok) throw new Error(`CAISSA PGN catalog unavailable (HTTP ${response.status}).`);
                const catalog = await response.json();
                const files = [];
                for (const group of Object.values(catalog || {})) {
                    for (const entries of Object.values(group || {})) {
                        for (const entry of Array.isArray(entries) ? entries : []) {
                            const file = String(entry?.file || '').replace(/^\/+/, '');
                            if (/^pgn\/[A-Za-z0-9_./-]+\.pgn$/i.test(file) && !file.includes('..')) files.push(file);
                        }
                    }
                }
                return Object.freeze([...new Set(files)]);
            })().catch(error => {
                this.#libraryPromise = null;
                throw error;
            });
        }
        return this.#libraryPromise;
    }

    async loadGame(game, { signal } = {}) {
        const gameId = String(game?.gameId || '');
        if (!/^g_[0-9a-f]{16}$/i.test(gameId)) throw new TypeError('Invalid CAISSA game identifier.');
        if (this.#loadedGames.has(gameId)) return this.#loadedGames.get(gameId);
        const files = await this.#libraryFiles(signal);
        for (const file of files) {
            const response = await this.#fetch(`/${file}`, {
                signal,
                credentials: 'same-origin',
                headers: { Accept: 'application/x-chess-pgn,text/plain;q=0.8' }
            });
            if (!response.ok) continue;
            const declared = Number(response.headers?.get?.('content-length') || 0);
            if (declared > MAX_PUBLIC_PGN_BYTES) continue;
            const text = await response.text();
            if (text.length > MAX_PUBLIC_PGN_BYTES) continue;
            for (const pgn of splitPgnGames(text)) {
                const headers = parseHeaders(pgn);
                if (!sameMetadata(headers, game)) continue;
                try {
                    const parsed = parseGame(pgn);
                    const resolved = Object.freeze({ ...parsed, gameId, sourceUrl: `/${file}` });
                    this.#loadedGames.set(gameId, resolved);
                    return resolved;
                } catch {
                    // A malformed catalog entry must not prevent checking the remaining public games.
                }
            }
        }
        throw new Error('The selected game metadata is indexed, but its public PGN could not be resolved.');
    }
}

export default OpeningGamesClient;
