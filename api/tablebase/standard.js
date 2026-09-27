import { Chess } from 'chess.js';

const PROVIDER = 'https://tablebase.lichess.ovh/standard';
const CATEGORIES = new Set(['win', 'loss', 'draw', 'cursed-win', 'blessed-loss', 'syzygy-win', 'syzygy-loss', 'maybe-win', 'maybe-loss', 'unknown']);
const cache = new Map();
let queue = Promise.resolve();
let blockedUntil = 0;

export function validatePosition(raw) {
    if (typeof raw !== 'string' || raw.length > 110) throw new Error('Invalid FEN');
    let game;
    try { game = new Chess(raw.trim()); } catch { throw new Error('Invalid FEN'); }
    const fen = game.fen();
    const pieces = game.board().flat().filter(Boolean).length;
    if (pieces < 2 || pieces > 7) throw new Error('Use a position with 2 to 7 pieces');
    if (fen.split(' ')[2] !== '-') {
        throw new Error('Castling rights are not supported in tablebases');
    }
    return fen;
}

function sanitize(body, fen) {
    if (!body || !CATEGORIES.has(body.category) || !Array.isArray(body.moves)) throw new Error('Invalid tablebase response');
    const game = new Chess(fen);
    const legal = new Map(game.moves({ verbose: true }).map(move => [move.lan, move.san]));
    if (body.moves.length !== legal.size) throw new Error('Incomplete tablebase response');
    const seen = new Set();
    const moves = body.moves.map(move => {
        if (!move || typeof move.uci !== 'string' || !legal.has(move.uci) || seen.has(move.uci) ||
            move.san !== legal.get(move.uci) || !CATEGORIES.has(move.category)) throw new Error('Invalid tablebase move');
        seen.add(move.uci);
        return { uci: move.uci, san: move.san, category: move.category,
            dtz: Number.isInteger(move.dtz) ? move.dtz : null,
            dtm: Number.isInteger(move.dtm) ? move.dtm : null,
            zeroing: move.zeroing === true };
    });
    return { fen, category: body.category, dtz: Number.isInteger(body.dtz) ? body.dtz : null,
        dtm: Number.isInteger(body.dtm) ? body.dtm : null, moves,
        checkmate: body.checkmate === true, stalemate: body.stalemate === true,
        insufficientMaterial: body.insufficient_material === true, source: 'lichess-syzygy' };
}

function serialized(work) {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
}

export default async function handler(req, res, dependencies = {}) {
    res.setHeader('X-Robots-Tag', 'noindex');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    let fen;
    try {
        if (Array.isArray(req.query?.fen)) throw new Error('Invalid FEN');
        fen = validatePosition(req.query?.fen);
    } catch (error) { return res.status(400).json({ error: error.message }); }
    const now = dependencies.now || Date.now;
    const hit = cache.get(fen);
    if (hit && hit.expires > now()) {
        res.setHeader('Cache-Control', 'public, s-maxage=300');
        return res.status(200).json(hit.data);
    }
    if (now() < blockedUntil) {
        res.setHeader('Retry-After', String(Math.ceil((blockedUntil - now()) / 1000)));
        return res.status(503).json({ error: 'Tablebase is temporarily busy. Try again shortly.' });
    }
    try {
        const data = await serialized(async () => {
            const fresh = cache.get(fen);
            if (fresh && fresh.expires > now()) return fresh.data;
            if (now() < blockedUntil) throw Object.assign(new Error('busy'), { code: 429 });
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            let upstream;
            try {
                const url = new URL(PROVIDER);
                url.searchParams.set('fen', fen);
                upstream = await (dependencies.fetch || fetch)(url, { signal: controller.signal,
                    headers: { Accept: 'application/json', 'User-Agent': 'CAISSA-Chess/1.0 (+https://www.caissa-chess.org/)' } });
            } finally { clearTimeout(timeout); }
            if (upstream.status === 429) {
                blockedUntil = now() + 60_000;
                throw Object.assign(new Error('busy'), { code: 429 });
            }
            if (upstream.status === 404) throw Object.assign(new Error('unavailable'), { code: 404 });
            if (!upstream.ok) throw new Error('upstream');
            const data = sanitize(await upstream.json(), fen);
            cache.set(fen, { data, expires: now() + 300_000 });
            if (cache.size > 500) cache.delete(cache.keys().next().value);
            return data;
        });
        res.setHeader('Cache-Control', 'public, s-maxage=300');
        return res.status(200).json(data);
    } catch (error) {
        if (error.code === 404) return res.status(404).json({ error: 'No tablebase data for this position' });
        if (error.code === 429) {
            res.setHeader('Retry-After', String(Math.max(1, Math.ceil((blockedUntil - now()) / 1000))));
            return res.status(503).json({ error: 'Tablebase is temporarily busy. Try again shortly.' });
        }
        return res.status(502).json({ error: 'Tablebase is unavailable. Try again shortly.' });
    }
}
