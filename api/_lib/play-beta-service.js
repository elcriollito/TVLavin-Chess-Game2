import {
    PLAY_BETA, applyPrivateHeaders, clearSessionCookie, csrfFor, environmentReady, exactOrigin,
    containsProhibitedFeedback, hashSecret, isJsonRequest, parseBetaPath, parseCookies, randomSecret, safeEqual,
    sanitizeText, sessionCookie
} from './play-beta-policy.js';
import { createPlayBetaStore } from './play-beta-store.js';

const json = (res, status, body) => res.status(status).json(body);
const stageClosed = (res) => { applyPrivateHeaders(res); return json(res, 404, { available: false, reasonCode: 'BETA_DISABLED' }); };
const bodyOf = req => typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
const bodyPolicyStatus = reason => reason === 'BODY_TOO_LARGE' ? 413 : reason === 'CONTENT_TYPE_REQUIRED' ? 415 : 400;

export function createPlayBetaService({ store = null, env = process.env, now = () => Date.now() } = {}) {
    const data = () => store || createPlayBetaStore();
    async function validSession(req, { touch = true } = {}) {
        if (!environmentReady(env)) return { ok: false, reasonCode: 'BETA_DISABLED' };
        const raw = parseCookies(req)[PLAY_BETA.cookieName];
        if (!raw || raw.length < 32 || raw.length > 128) return { ok: false, reasonCode: 'SESSION_REQUIRED' };
        const sessionHash = hashSecret(raw);
        let value;
        try { value = await data().session({ p_session_hash: sessionHash, p_now: new Date(now()).toISOString(), p_touch: touch }); }
        catch (_) { return { ok: false, reasonCode: 'STORE_UNAVAILABLE' }; }
        if (!value?.authorized || value.program_enabled !== true) return { ok: false, reasonCode: value?.reason_code || 'SESSION_INVALID' };
        return { ok: true, raw, sessionHash, sessionId: value.session_id, coach: value.coach_enabled === true,
            expiresAt: value.expires_at, csrf: csrfFor(sessionHash, env.CAISSA_PLAY_V2_SESSION_SECRET) };
    }

    return Object.freeze({
        async redeem(req, res) {
            applyPrivateHeaders(res);
            if (!environmentReady(env)) return stageClosed(res);
            if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
            if (!exactOrigin(req)) return json(res, 403, { error: 'ORIGIN_REJECTED' });
            const bodyPolicy = isJsonRequest(req);
            if (!bodyPolicy.ok) return json(res, bodyPolicyStatus(bodyPolicy.reasonCode), { error: bodyPolicy.reasonCode });
            let body; try { body = bodyOf(req); } catch (_) { return json(res, 400, { error: 'INVALID_BODY' }); }
            const token = String(body.token || '');
            if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json(res, 404, { error: 'INVITE_INVALID' });
            const rawSession = randomSecret();
            let result;
            try { result = await data().redeem({ p_invite_hash: hashSecret(token), p_session_hash: hashSecret(rawSession),
                p_now: new Date(now()).toISOString(), p_idle_seconds: PLAY_BETA.sessionIdleTtlMs / 1000,
                p_absolute_seconds: PLAY_BETA.sessionAbsoluteTtlMs / 1000 }); }
            catch (_) { return json(res, 503, { error: 'SERVICE_UNAVAILABLE' }); }
            if (!result?.authorized) return json(res, 404, { error: 'INVITE_INVALID' });
            const expiresAt = Date.parse(result.expires_at);
            if (!Number.isFinite(expiresAt) || expiresAt <= now()) return json(res, 503, { error: 'SERVICE_UNAVAILABLE' });
            const cookieAge = Math.max(0, Math.min(PLAY_BETA.sessionAbsoluteTtlMs, expiresAt - now()));
            res.setHeader('Set-Cookie', sessionCookie(rawSession, Math.floor(cookieAge / 1000)));
            return json(res, 200, { ok: true, redirect: '/play/beta', expiresAt: result.expires_at });
        },
        async session(req, res) {
            applyPrivateHeaders(res);
            if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
            const session = await validSession(req);
            if (session.reasonCode === 'STORE_UNAVAILABLE') return json(res, 503, { authorized: false, reasonCode: 'SERVICE_UNAVAILABLE' });
            if (!session.ok) return json(res, 401, { authorized: false, reasonCode: session.reasonCode });
            return json(res, 200, { authorized: true, coach: session.coach, expiresAt: session.expiresAt, csrf: session.csrf });
        },
        async logout(req, res) {
            applyPrivateHeaders(res);
            if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
            if (!exactOrigin(req)) return json(res, 403, { error: 'ORIGIN_REJECTED' });
            const bodyPolicy = isJsonRequest(req);
            if (!bodyPolicy.ok) return json(res, bodyPolicyStatus(bodyPolicy.reasonCode), { error: bodyPolicy.reasonCode });
            const session = await validSession(req, { touch: false });
            res.setHeader('Set-Cookie', clearSessionCookie());
            if (session.reasonCode === 'STORE_UNAVAILABLE') return json(res, 503, { error: 'SERVICE_UNAVAILABLE' });
            if (session.ok) {
                try { await data().revokeSession(session.sessionHash); }
                catch (_) { return json(res, 503, { error: 'SERVICE_UNAVAILABLE' }); }
            }
            return json(res, 200, { ok: true });
        },
        async status(req, res) {
            applyPrivateHeaders(res);
            if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
            const session = await validSession(req);
            if (session.reasonCode === 'STORE_UNAVAILABLE') return json(res, 503, { enabled: false, reasonCode: 'SERVICE_UNAVAILABLE' });
            return json(res, session.ok ? 200 : 401, { enabled: session.ok, reasonCode: session.ok ? 'AUTHORIZED' : session.reasonCode });
        },
        async feedback(req, res) {
            applyPrivateHeaders(res);
            if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
            if (!exactOrigin(req)) return json(res, 403, { error: 'ORIGIN_REJECTED' });
            const bodyPolicy = isJsonRequest(req);
            if (!bodyPolicy.ok) return json(res, bodyPolicyStatus(bodyPolicy.reasonCode), { error: bodyPolicy.reasonCode });
            const session = await validSession(req);
            if (session.reasonCode === 'STORE_UNAVAILABLE') return json(res, 503, { error: 'SERVICE_UNAVAILABLE' });
            if (!session.ok) return json(res, 401, { error: session.reasonCode });
            if (!safeEqual(req.headers['x-caissa-beta-csrf'], session.csrf)) return json(res, 403, { error: 'CSRF_REJECTED' });
            let body; try { body = bodyOf(req); } catch (_) { return json(res, 400, { error: 'INVALID_BODY' }); }
            const category = PLAY_BETA.feedbackCategories.includes(body.category) ? body.category : null;
            const mode = PLAY_BETA.modes.includes(body.mode) ? body.mode : null;
            if (String(body.comment || '').length > PLAY_BETA.feedback.comment
                || String(body.steps || '').length > PLAY_BETA.feedback.steps
                || String(body.device || '').length > PLAY_BETA.feedback.device)
                return json(res, 400, { error: 'FEEDBACK_INVALID' });
            const comment = sanitizeText(body.comment, PLAY_BETA.feedback.comment);
            const steps = sanitizeText(body.steps, PLAY_BETA.feedback.steps);
            const device = sanitizeText(body.device, PLAY_BETA.feedback.device);
            if (!category || !mode || !comment || body.consent !== true) return json(res, 400, { error: 'FEEDBACK_INVALID' });
            if (containsProhibitedFeedback(`${comment}\n${steps}\n${device}`)) return json(res, 400, { error: 'PROHIBITED_DATA' });
            let value;
            try { value = await data().feedback({ p_session_hash: session.sessionHash, p_category: category,
                p_mode: mode, p_comment: comment, p_steps: steps || null, p_device: device || null,
                p_consent_version: 'PlayV2BetaFeedbackConsent@1.0.0', p_now: new Date(now()).toISOString() }); }
            catch (_) { return json(res, 503, { error: 'SERVICE_UNAVAILABLE' }); }
            if (!value?.accepted) return json(res, value?.reason_code === 'RATE_LIMITED' ? 429 : 400, { error: value?.reason_code || 'FEEDBACK_REJECTED' });
            return json(res, 201, { ok: true, reference: value.reference });
        },
        async authorizeEntry(req, requestedPath = req.url) {
            const route = parseBetaPath(requestedPath);
            if (!route) return { authorized: false, reasonCode: 'ROUTE_PROHIBITED' };
            const session = await validSession(req);
            if (!session.ok) return { authorized: false, reasonCode: session.reasonCode };
            if (route.mode === 'coach' && !session.coach) return { authorized: false, reasonCode: 'CAPABILITY_REQUIRED' };
            return { authorized: true, mode: route.mode, coach: session.coach };
        }
    });
}
