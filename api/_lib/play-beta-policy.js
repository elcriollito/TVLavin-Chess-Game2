import crypto from 'node:crypto';

export const PLAY_BETA = Object.freeze({
    contractId: 'PlayV2InviteOnlyPolicy@1.0.0',
    stageEnv: 'CAISSA_PLAY_V2_BETA_STAGE',
    requiredStage: 'invite-only',
    cookieName: '__Host-caissa_play_beta',
    inviteTtlMs: 7 * 24 * 60 * 60 * 1000,
    sessionIdleTtlMs: 24 * 60 * 60 * 1000,
    sessionAbsoluteTtlMs: 7 * 24 * 60 * 60 * 1000,
    storeTimeoutMs: 8 * 1000,
    feedbackRetentionDays: 90,
    maxRedemptions: 3,
    feedback: Object.freeze({ comment: 2000, steps: 2000, device: 160 }),
    modes: Object.freeze(['games', 'bots', 'coach']),
    feedbackCategories: Object.freeze(['Bug', 'Confusing', 'Visual', 'Suggestion', 'Other'])
});

export const JSON_BODY_LIMIT = 8 * 1024;

export const hashSecret = value => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
export const randomSecret = () => crypto.randomBytes(32).toString('base64url');
export const safeEqual = (left, right) => {
    const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export function parseCookies(req) {
    return Object.fromEntries(String(req?.headers?.cookie || '').split(';').map(part => part.trim()).filter(Boolean)
        .map(part => { const at = part.indexOf('='); if (at < 1) return ['', ''];
            try { return [part.slice(0, at), decodeURIComponent(part.slice(at + 1))]; } catch (_) { return ['', '']; } })
        .filter(([key]) => key));
}

export function sessionCookie(value, maxAge = Math.floor(PLAY_BETA.sessionAbsoluteTtlMs / 1000)) {
    return `${PLAY_BETA.cookieName}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}
export const clearSessionCookie = () => `${PLAY_BETA.cookieName}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;

export function applyPrivateHeaders(res, contentType = 'application/json; charset=utf-8') {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
}

export function exactOrigin(req) {
    const host = String(req?.headers?.host || '');
    const origin = String(req?.headers?.origin || '');
    if (!host || !origin) return false;
    try { const parsed = new URL(origin); return parsed.protocol === 'https:' && parsed.host === host; } catch (_) { return false; }
}

export function parseBetaPath(input) {
    let path;
    try { path = new URL(String(input || ''), 'https://caissa.invalid').pathname; } catch (_) { return null; }
    const match = /^\/play\/beta(?:\/(games|bots|coach))?$/.exec(path);
    return match ? { path, mode: match[1] || 'games' } : null;
}

export function sanitizeText(value, limit) {
    return String(value || '').normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/<[^>]*>/g, '').trim().slice(0, limit);
}

export function isJsonRequest(req, maximumBytes = JSON_BODY_LIMIT) {
    const type = String(req?.headers?.['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
    if (type !== 'application/json') return { ok: false, reasonCode: 'CONTENT_TYPE_REQUIRED' };
    const declared = Number(req?.headers?.['content-length']);
    if (Number.isFinite(declared) && declared > maximumBytes) return { ok: false, reasonCode: 'BODY_TOO_LARGE' };
    let bytes;
    try { bytes = Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8'); }
    catch (_) { return { ok: false, reasonCode: 'INVALID_BODY' }; }
    return bytes <= maximumBytes ? { ok: true } : { ok: false, reasonCode: 'BODY_TOO_LARGE' };
}

export function containsProhibitedFeedback(value) {
    const text = String(value || '');
    const labeledSecret = /\b(?:fen|pgn|moves?|cookies?|tokens?|passwords?|passcodes?|secret|api[_ -]?key|authorization|credentials?|fingerprints?|user(?:name)?|account|email|phone|name|ip(?: address)?)\b\s*[:=]/i;
    const fen = /\b(?:[prnbqk1-8]+\/){7}[prnbqk1-8]+\s+[wb]\s+(?:-|[KQkq]{1,4})\s+(?:-|[a-h][36])\s+\d+\s+\d+\b/i;
    const pgn = /(?:^|\s)(?:1\.|\[Event\s+["][^\n]*["]\]|(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?:\s+(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)){1,})/im;
    const identityOrNetwork = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:^|[^A-F0-9:])(?:[A-F0-9]{0,4}:){2,7}[A-F0-9]{0,4}(?:[^A-F0-9:]|$)|\bhttps?:\/\/\S+|\bwww\.\S+|\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sk_(?:live|test)_[A-Za-z0-9]+)\b)/i;
    const credentialValue = /\b(?:authorization\s*:\s*)?bearer\s+[A-Za-z0-9._~-]{6,}|\b(?:password|passphrase|api[_ -]?key|token|secret|cookies?|session(?:[_ -]?id)?|device[_ -]?id|fingerprints?)\s*[:=]\s*\S+/i;
    const csvFormula = /(?:^|[\r\n])\s*[=+@-](?:[A-Za-z]|\d|['"])/;
    const markupOrControl = /<[^>]*>|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
    return labeledSecret.test(text) || fen.test(text) || pgn.test(text) || identityOrNetwork.test(text)
        || credentialValue.test(text) || csvFormula.test(text) || markupOrControl.test(text);
}

export function csrfFor(sessionHash, secret = process.env.CAISSA_PLAY_V2_SESSION_SECRET) {
    if (!secret || !sessionHash) return null;
    return crypto.createHmac('sha256', secret).update(`csrf:${sessionHash}`).digest('base64url');
}

export function environmentReady(env = process.env) {
    return env[PLAY_BETA.stageEnv] === PLAY_BETA.requiredStage
        && Buffer.byteLength(String(env.CAISSA_PLAY_V2_SESSION_SECRET || ''), 'utf8') >= 32
        && Boolean(env.SUPABASE_SERVICE_ROLE_KEY
            && (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL));
}
