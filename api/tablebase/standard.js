import { Chess } from 'chess.js';
import { createSharedTablebaseLimiter, sharedLimiterConfigured } from './shared-limiter.js';

const PROVIDER = 'https://tablebase.lichess.org/standard';
const CATEGORIES = new Set(['win', 'loss', 'draw', 'cursed-win', 'blessed-loss', 'syzygy-win', 'syzygy-loss', 'maybe-win', 'maybe-loss', 'unknown']);
const SUCCESS_CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
const cache = new Map();
let queue = Promise.resolve();
let blockedUntil = 0;

function noStore(res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

export function publicTablebaseEnabled(env = process.env) {
    if ((env.VERCEL_ENV || env.NODE_ENV) !== 'production') return true;
    return env.CAISSA_TABLEBASE_PUBLIC_ENABLED === '1' && env.CAISSA_TABLEBASE_SHARED_LIMITER_READY === '1'
        && sharedLimiterConfigured(env);
}

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
    const fields = fen.split(' ');
    const previousMoverProbe = [...fields];
    previousMoverProbe[1] = fields[1] === 'w' ? 'b' : 'w';
    previousMoverProbe[3] = '-';
    try {
        if (new Chess(previousMoverProbe.join(' ')).inCheck()) throw new Error('Illegal position');
    } catch (error) {
        if (error.message === 'Illegal position') throw error;
        throw new Error('Invalid FEN');
    }
    return fen;
}

function cacheKey(fen) {
    const fields = fen.split(' ');
    fields[5] = '1';
    return fields.join(' ');
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
            preciseDtz: Number.isInteger(move.precise_dtz) ? move.precise_dtz : null,
            dtm: Number.isInteger(move.dtm) ? move.dtm : null,
            zeroing: move.zeroing === true };
    });
    return { category: body.category, dtz: Number.isInteger(body.dtz) ? body.dtz : null,
        preciseDtz: Number.isInteger(body.precise_dtz) ? body.precise_dtz : null,
        dtm: Number.isInteger(body.dtm) ? body.dtm : null, moves,
        checkmate: body.checkmate === true, stalemate: body.stalemate === true,
        insufficientMaterial: body.insufficient_material === true, source: 'lichess-syzygy' };
}

function retryDelay(upstream, now) {
    const value = upstream.headers?.get?.('retry-after');
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(24 * 60 * 60_000, Math.max(60_000, seconds * 1000));
    const date = Date.parse(value || '');
    if (Number.isFinite(date) && date > now) return Math.min(24 * 60 * 60_000, Math.max(60_000, date - now));
    return 60_000;
}

function serialized(work) {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
}

export default async function handler(req, res, dependencies = {}) {
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('X-CAISSA-Tablebase-Stage', 'review');
    if (req.method !== 'GET') {
        noStore(res);
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!publicTablebaseEnabled(dependencies.env || process.env)) {
        noStore(res);
        return res.status(503).json({ code: 'TABLEBASE_REVIEW_ONLY', error: 'Tablebase is not enabled for public traffic.' });
    }
    let fen;
    try {
        if (Array.isArray(req.query?.fen)) throw new Error('Invalid FEN');
        fen = validatePosition(req.query?.fen);
    } catch (error) { noStore(res); return res.status(400).json({ error: error.message }); }
    const now = dependencies.now || Date.now;
    const env = dependencies.env || process.env;
    const shared = dependencies.sharedLimiter || (env.CAISSA_TABLEBASE_SHARED_LIMITER_READY === '1' && sharedLimiterConfigured(env)
        ? createSharedTablebaseLimiter(dependencies.db) : null);
    const key = cacheKey(fen);
    const hit = cache.get(key);
    if (hit && hit.expires > now()) {
        res.setHeader('Cache-Control', SUCCESS_CACHE_CONTROL);
        return res.status(200).json({ fen, ...hit.data });
    }
    if (now() < blockedUntil) {
        noStore(res);
        res.setHeader('Retry-After', String(Math.ceil((blockedUntil - now()) / 1000)));
        return res.status(503).json({ error: 'Tablebase is temporarily busy. Try again shortly.' });
    }
    try {
        const data = await serialized(async () => {
            const fresh = cache.get(key);
            if (fresh && fresh.expires > now()) return fresh.data;
            if (now() < blockedUntil) throw Object.assign(new Error('busy'), { code: 429 });
            let lease = null;
            let retryAfter = 0;
            if (shared) {
                const claim = await shared.claim();
                if (!claim.allowed) throw Object.assign(new Error('shared-busy'), {
                    code: 'SHARED_BUSY', retryAfter: claim.retryAfter
                });
                lease = claim.leaseId;
            }
            let data;
            try {
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
                    retryAfter = Math.ceil(retryDelay(upstream, now()) / 1000);
                    if (!shared) blockedUntil = now() + retryAfter * 1000;
                    throw Object.assign(new Error('busy'), { code: 429, retryAfter });
                }
                if (upstream.status === 404) throw Object.assign(new Error('unavailable'), { code: 404 });
                if (!upstream.ok) throw new Error('upstream');
                data = sanitize(await upstream.json(), fen);
            } finally {
                if (lease) await shared.release(lease, retryAfter);
            }
            cache.set(key, { data, expires: now() + 86_400_000 });
            if (cache.size > 500) cache.delete(cache.keys().next().value);
            return data;
        });
        res.setHeader('Cache-Control', SUCCESS_CACHE_CONTROL);
        return res.status(200).json({ fen, ...data });
    } catch (error) {
        noStore(res);
        if (error.code === 'LIMITER_UNAVAILABLE') return res.status(503).json({ code: 'TABLEBASE_LIMITER_UNAVAILABLE', error: 'Tablebase is temporarily unavailable.' });
        if (error.code === 'SHARED_BUSY') {
            res.setHeader('Retry-After', String(error.retryAfter));
            return res.status(503).json({ code: 'TABLEBASE_PROVIDER_BUSY', error: 'Tablebase is temporarily busy. Try again shortly.' });
        }
        if (error.code === 404) return res.status(404).json({ error: 'No tablebase data for this position' });
        if (error.code === 429) {
            res.setHeader('Retry-After', String(error.retryAfter || Math.max(1, Math.ceil((blockedUntil - now()) / 1000))));
            return res.status(503).json({ error: 'Tablebase is temporarily busy. Try again shortly.' });
        }
        return res.status(502).json({ error: 'Tablebase is unavailable. Try again shortly.' });
    }
}
