import { authenticateRequest, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

const PUZZLE_ID = /^[A-Za-z0-9]{5}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SOURCE_VERSION = '2026-09-10';

function progressReadOrigin(env = process.env) {
    if (!env.CAISSA_PUZZLE_PROGRESS_READ_ORIGIN) return null;
    try {
        const url = new URL(env.CAISSA_PUZZLE_PROGRESS_READ_ORIGIN);
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') return null;
        return url.origin;
    } catch {
        return null;
    }
}

async function relayProgressRead(req, res, dependencies = {}) {
    const origin = progressReadOrigin(dependencies.env || process.env);
    if (!origin || req.method !== 'GET') return false;
    const authorization = req.headers?.authorization || req.headers?.Authorization;
    const log = dependencies.log || console;
    try {
        log.info?.('puzzles_progress_read_relay_start');
        const response = await (dependencies.fetchFn || fetch)(`${origin}/api/puzzles/progress`, {
            method: 'GET',
            cache: 'no-store',
            headers: { Authorization: authorization, Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
        });
        const payload = await response.json().catch(() => null);
        if (!payload || typeof payload !== 'object') throw new Error('Invalid progress response');
        log.info?.('puzzles_progress_read_relay_response', response.status);
        res.status(response.status).json(payload);
    } catch (error) {
        log.warn?.('puzzles_progress_read_relay_failed', error?.name || 'Error');
        res.status(503).json({ code: 'PROGRESS_UNAVAILABLE', error: 'Account progress is temporarily unavailable.' });
    }
    return true;
}

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET', 'POST'])) return;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
    const auth = await (dependencies.authenticate || authenticateRequest)(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);
    const rate = (dependencies.checkRateLimit || checkRateLimit)(auth.userId, {
        prefix: 'puzzles-progress', windowMs: 60_000, max: 40,
    });
    if (!rate.allowed) return res.status(429).json({ code: 'RATE_LIMITED' });
    if (await relayProgressRead(req, res, dependencies)) return;
    const db = (dependencies.getSupabase || getSupabase)();
    try {
        const { data: user, error: userError } = await db.from('users')
            .select('id').eq('clerk_id', auth.userId).single();
        if (userError || !user?.id) return res.status(409).json({ code: 'ACCOUNT_NOT_READY' });
        if (req.method === 'GET') {
            const { data, error } = await db.from('puzzle_training_progress')
                .select('rating, solved, failed, updated_at').eq('user_id', user.id).maybeSingle();
            if (error) throw error;
            return res.status(200).json({ progress: data || { rating: 1800, solved: 0, failed: 0 }, persistent: true });
        }
        const { operationId, puzzleId, outcome, assisted } = req.body || {};
        if (!UUID.test(operationId || '') || !PUZZLE_ID.test(puzzleId || '')
            || !['solved', 'failed'].includes(outcome) || typeof assisted !== 'boolean') {
            return res.status(400).json({ code: 'INVALID_OUTCOME' });
        }
        const { rating } = await (dependencies.lookupPuzzle || lookupPuzzle)(puzzleId, dependencies);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5000) throw new Error('Invalid catalog rating');
        const { data, error } = await db.rpc('record_puzzle_training_attempt', {
            p_user_id: user.id, p_operation_id: operationId, p_source_version: SOURCE_VERSION,
            p_puzzle_id: puzzleId, p_puzzle_rating: rating, p_outcome: outcome, p_assisted: assisted,
        });
        if (error) throw error;
        return res.status(200).json({ progress: data, persistent: true });
    } catch {
        return res.status(503).json({ code: 'PROGRESS_UNAVAILABLE', error: 'Account progress is temporarily unavailable.' });
    }
}

export async function lookupPuzzle(puzzleId, { fetchFn = fetch, env = process.env } = {}) {
    if (!env.CAISSA_PUZZLE_WORKER_URL || !env.CAISSA_PUZZLE_WORKER_TOKEN) throw new Error('Catalog unavailable');
    const url = new URL(`/v1/puzzle/${puzzleId}`, env.CAISSA_PUZZLE_WORKER_URL);
    const response = await fetchFn(url, {
        headers: { Authorization: `Bearer ${env.CAISSA_PUZZLE_WORKER_TOKEN}` },
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Catalog lookup failed');
    const puzzle = await response.json();
    if (puzzle.puzzleId !== puzzleId || puzzle.sourceVersion !== SOURCE_VERSION) throw new Error('Catalog mismatch');
    return puzzle;
}
