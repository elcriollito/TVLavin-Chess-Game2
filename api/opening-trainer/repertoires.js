import { Chess } from 'chess.js';
import { verifyAuth, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { checkRateLimit } from '../_lib/rate-limit.js';

const SCHEMA_VERSION = 'CaissaOpeningRepertoire@1.0.0';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const STAGING_PROJECT_REF = 'aqizagaskicotorfpwfn';
const PRODUCTION_PROJECT_REF = 'jczauvkfkweuvdpurpem';
const integer = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;

export function isOpeningTrainerCloudEnabled(env = process.env) {
    return env.CAISSA_OPENING_TRAINER_STORAGE_MODE === 'cloud-v2'
        && env.CAISSA_OPENING_TRAINER_CLOUD_V2_ENABLED === 'true';
}

function projectRefFromUrl(value) {
    try {
        const host = new URL(String(value || '')).hostname;
        return host.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] || '';
    } catch {
        return '';
    }
}

export function assertOpeningTrainerDatabaseBoundary(env = process.env) {
    const projectRef = projectRefFromUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
    if (env.VERCEL_ENV === 'preview') {
        if (env.CAISSA_OPENING_TRAINER_SUPABASE_REF !== STAGING_PROJECT_REF || projectRef !== STAGING_PROJECT_REF) {
            throw new Error('Opening Trainer preview database boundary is not confirmed.');
        }
        if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Opening Trainer preview database credentials are unavailable.');
    }
    if (env.VERCEL_ENV !== 'production' && projectRef === PRODUCTION_PROJECT_REF) {
        throw new Error('Opening Trainer non-production access to the production database is denied.');
    }
    return projectRef;
}

function iso(value, fallback = null) {
    const parsed = new Date(value || '');
    return Number.isNaN(parsed.valueOf()) ? fallback : parsed.toISOString();
}

function cleanMove(move, replay, ply) {
    const uci = String(move?.uci || '').toLowerCase();
    if (!UCI.test(uci)) throw new TypeError(`Invalid move at ply ${ply + 1}.`);
    const fenBefore = replay.fen();
    let applied = null;
    try {
        applied = replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    } catch {
        applied = null;
    }
    if (!applied) throw new TypeError(`Illegal move at ply ${ply + 1}.`);
    return {
        uci,
        san: applied.san,
        from: applied.from,
        to: applied.to,
        promotion: applied.promotion || null,
        color: applied.color,
        fenBefore,
        fenAfter: replay.fen()
    };
}

export function sanitizeRepertoire(input, now = new Date()) {
    if (!input || input.schemaVersion !== SCHEMA_VERSION || !LOCAL_ID.test(String(input.id || ''))) {
        throw new TypeError('Invalid repertoire identity.');
    }
    const name = String(input.name || '').trim().slice(0, 100);
    const opening = String(input.opening || '').trim().slice(0, 160);
    const initialFen = String(input.initialFen || START_FEN).trim();
    if (!name || !opening) throw new TypeError('Repertoire name and opening are required.');
    try { new Chess(initialFen); } catch { throw new TypeError('Invalid initial position.'); }
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 50) {
        throw new TypeError('A repertoire must contain between 1 and 50 lines.');
    }
    const lines = input.lines.map(line => {
        if (!Array.isArray(line) || !line.length || line.length > 80) throw new TypeError('Invalid repertoire line size.');
        const replay = new Chess(initialFen);
        return line.map((move, ply) => cleanMove(move, replay, ply));
    });
    const timestamp = now.toISOString();
    return Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        id: String(input.id),
        name,
        color: input.color === 'black' ? 'black' : 'white',
        eco: String(input.eco || '').toUpperCase().replace(/[^A-E0-9]/g, '').slice(0, 3),
        opening,
        initialFen,
        lines,
        createdAt: iso(input.createdAt, timestamp),
        updatedAt: iso(input.updatedAt, timestamp),
        progress: {
            sessions: integer(input.progress?.sessions),
            completed: integer(input.progress?.completed),
            attempts: integer(input.progress?.attempts),
            correct: integer(input.progress?.correct),
            hints: integer(input.progress?.hints),
            reveals: integer(input.progress?.reveals),
            lastTrainedAt: iso(input.progress?.lastTrainedAt)
        }
    });
}

function toRow(userId, repertoire) {
    return {
        user_id: userId,
        local_id: repertoire.id,
        schema_version: repertoire.schemaVersion,
        name: repertoire.name,
        color: repertoire.color,
        eco: repertoire.eco,
        opening: repertoire.opening,
        initial_fen: repertoire.initialFen,
        lines: repertoire.lines,
        progress: repertoire.progress,
        local_created_at: repertoire.createdAt,
        local_updated_at: repertoire.updatedAt,
        synced_at: new Date().toISOString()
    };
}

export function fromRow(row) {
    return {
        schemaVersion: row.schema_version,
        id: row.local_id,
        name: row.name,
        color: row.color,
        eco: row.eco,
        opening: row.opening,
        initialFen: row.initial_fen,
        lines: row.lines,
        progress: row.progress,
        createdAt: row.local_created_at,
        updatedAt: row.local_updated_at
    };
}

async function resolveUserId(supabase, clerkId) {
    const { data, error } = await supabase.from('users').select('id').eq('clerk_id', clerkId).single();
    if (error || !data?.id) return null;
    return data.id;
}

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET', 'PUT', 'DELETE'])) return;
    res.setHeader('Cache-Control', 'private, no-store');
    const cloudEnabled = dependencies.isCloudEnabled
        ? dependencies.isCloudEnabled()
        : isOpeningTrainerCloudEnabled();
    if (!cloudEnabled) {
        return res.status(404).json({ code: 'OPENING_TRAINER_CLOUD_DISABLED', error: 'Not found' });
    }
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    const auth = await (dependencies.verifyAuth || verifyAuth)(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);

    const rateLimit = (dependencies.checkRateLimit || checkRateLimit)(auth.userId, {
        windowMs: 60_000,
        max: req.method === 'GET' ? 120 : 60,
        prefix: `opening-trainer-repertoires:${req.method}`
    });
    res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
    if (!rateLimit.allowed) {
        res.setHeader('Retry-After', String(rateLimit.retryAfter || 60));
        return res.status(429).json({ error: 'Too many repertoire requests' });
    }

    try {
        if (!dependencies.getSupabase) {
            (dependencies.assertDatabaseBoundary || assertOpeningTrainerDatabaseBoundary)();
        }
        const supabase = (dependencies.getSupabase || getSupabase)();
        const userId = await resolveUserId(supabase, auth.userId);
        if (!userId) return res.status(404).json({ error: 'User not found' });

        if (req.method === 'GET') {
            const { data, error } = await supabase.from('opening_repertoires').select('*')
                .eq('user_id', userId).order('local_updated_at', { ascending: false }).limit(100);
            if (error) throw error;
            return res.status(200).json({ schemaVersion: 1, repertoires: (data || []).map(fromRow) });
        }

        const localId = String(req.method === 'DELETE' ? req.query?.id || '' : req.body?.id || '');
        if (!LOCAL_ID.test(localId)) return res.status(400).json({ error: 'Invalid repertoire identifier' });
        if (req.method === 'DELETE') {
            const { error } = await supabase.from('opening_repertoires').delete()
                .eq('user_id', userId).eq('local_id', localId);
            if (error) throw error;
            return res.status(200).json({ deleted: true, id: localId });
        }

        if (JSON.stringify(req.body || {}).length > 350000) return res.status(413).json({ error: 'Repertoire exceeds size limit' });
        let repertoire;
        try { repertoire = sanitizeRepertoire(req.body); }
        catch (error) { return res.status(400).json({ error: error.message || 'Invalid repertoire' }); }
        const { data, error } = await supabase.from('opening_repertoires')
            .upsert(toRow(userId, repertoire), { onConflict: 'user_id,local_id' }).select('*').single();
        if (error) throw error;
        return res.status(200).json({ repertoire: fromRow(data) });
    } catch (error) {
        console.error('[opening-trainer-repertoires] request failed', error?.code || error?.message || 'unknown');
        return res.status(503).json({ error: 'Repertoire sync is temporarily unavailable' });
    }
}
