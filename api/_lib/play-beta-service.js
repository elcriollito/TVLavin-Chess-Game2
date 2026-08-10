import {
    PLAY_BETA, applyPrivateHeaders, clearSessionCookie, csrfFor, environmentReady, exactOrigin,
    hashSecret, isJsonRequest, parseBetaPath, parseCookies, randomSecret, sessionCookie
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
            if (env.CAISSA_PLAY_V2_BETA_STAGE !== PLAY_BETA.requiredStage) return stageClosed(res);
            if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
            const session = await validSession(req);
            if (session.reasonCode === 'STORE_UNAVAILABLE') return json(res, 503, { authorized: false, reasonCode: 'SERVICE_UNAVAILABLE' });
            if (!session.ok) return json(res, 401, { authorized: false, reasonCode: session.reasonCode });
            return json(res, 200, { authorized: true, coach: session.coach, expiresAt: session.expiresAt, csrf: session.csrf });
        },
        async logout(req, res) {
            applyPrivateHeaders(res);
            if (env.CAISSA_PLAY_V2_BETA_STAGE !== PLAY_BETA.requiredStage) return stageClosed(res);
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
            if (env.CAISSA_PLAY_V2_BETA_STAGE !== PLAY_BETA.requiredStage) return stageClosed(res);
            if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
            const session = await validSession(req);
            if (session.reasonCode === 'STORE_UNAVAILABLE') return json(res, 503, { enabled: false, reasonCode: 'SERVICE_UNAVAILABLE' });
            return json(res, session.ok ? 200 : 401, { enabled: session.ok, reasonCode: session.ok ? 'AUTHORIZED' : session.reasonCode });
        },
        async feedback(req, res) {
            applyPrivateHeaders(res);
            return json(res, 404, { error: 'FEEDBACK_TRANSPORT_DISABLED' });
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
