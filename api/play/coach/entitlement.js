import { verifyAuth, respondAuthFailure, setCorsHeaders } from '../../_lib/auth.js';
import { getSupabase } from '../../_lib/supabase.js';
import { checkRateLimit } from '../../_lib/rate-limit.js';
import { logError } from '../../_lib/logger.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Temporary Play v3 feedback window. Turn off to restore the preserved Premium/trial boundary.
const TEMPORARY_OPEN_PREVIEW = true;
const noStore = res => res.setHeader('Cache-Control', 'private, no-store, max-age=0');
const openPreviewState = () => ({
    allowed: true, code: 'OPEN_PREVIEW_ACCESS', coachAccess: 'preview',
    coachTrialGamesRemaining: 0, coachGameConsumed: false
});
const state = user => user.is_premium ? {
    allowed: true, code: 'PREMIUM_ACCESS', coachAccess: 'premium', coachTrialGamesRemaining: 0, coachGameConsumed: false
} : user.coach_trial_consumed_at ? {
    allowed: false, code: 'COACH_TRIAL_USED', coachAccess: 'locked', coachTrialGamesRemaining: 0, coachGameConsumed: false
} : {
    allowed: true, code: 'TRIAL_AVAILABLE', coachAccess: 'trial', coachTrialGamesRemaining: 1, coachGameConsumed: false
};

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET', 'POST'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
    if ((dependencies.openPreview ?? TEMPORARY_OPEN_PREVIEW) === true) {
        noStore(res);
        return res.status(200).json(openPreviewState());
    }

    const auth = await (dependencies.verifyAuth || verifyAuth)(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);
    const rl = (dependencies.checkRateLimit || checkRateLimit)(auth.userId, {
        windowMs: 10 * 60 * 1000, max: req.method === 'POST' ? 10 : 30, prefix: 'coach-entitlement'
    });
    if (!rl.allowed) return res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many Coach access requests.', retryAfter: rl.retryAfter });

    try {
        const supabase = (dependencies.getSupabase || getSupabase)();
        noStore(res);
        if (req.method === 'GET') {
            const { data, error } = await supabase.from('users')
                .select('is_premium, coach_trial_consumed_at').eq('clerk_id', auth.userId).single();
            if (error || !data) return res.status(409).json({ code: 'ACCOUNT_SYNC_REQUIRED', error: 'CAISSA account synchronization is required.' });
            return res.status(200).json(state(data));
        }

        const operationId = String(req.headers['idempotency-key'] || '');
        if (!UUID.test(operationId)) return res.status(400).json({ code: 'IDEMPOTENCY_KEY_REQUIRED', error: 'A valid idempotency key is required.' });
        const { data, error } = await supabase.rpc('consume_coach_game_access', {
            p_clerk_id: auth.userId, p_operation_id: operationId
        });
        if (error) throw error;
        const value = data?.[0] || data;
        if (!value || value.code === 'ACCOUNT_SYNC_REQUIRED') {
            return res.status(409).json({ code: 'ACCOUNT_SYNC_REQUIRED', error: 'CAISSA account synchronization is required.' });
        }
        const response = {
            allowed: value.allowed === true,
            code: String(value.code || 'COACH_ACCESS_REJECTED'),
            coachAccess: String(value.coach_access || 'none'),
            coachTrialGamesRemaining: Number(value.coach_trial_games_remaining || 0),
            coachGameConsumed: value.coach_game_consumed === true
        };
        return res.status(response.allowed ? 200 : 403).json(response);
    } catch (error) {
        logError('coach_entitlement', error, { userId: auth.userId });
        noStore(res);
        return res.status(503).json({ code: 'COACH_ACCESS_UNAVAILABLE', error: 'Coach access is temporarily unavailable.' });
    }
}
