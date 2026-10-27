import { createClerkClient } from '@clerk/backend';
import {
  REGISTRATION_AGE_POLICY,
  clearRegistrationAgeCookie,
  evaluateNeutralAge,
  issueRegistrationAgeState,
  nonceDigest,
  registrationAbuseDigest,
  registrationAgeCookie,
  registrationAgeStateFromRequest,
  registrationReleaseReady,
  verifyRegistrationAgeState
} from './registration-age-policy.js';
import { createRegistrationAgeGateStore } from './registration-age-gate-store.js';

const ALLOWED_ELIGIBILITY_KEYS = new Set(['birthMonth', 'birthYear']);
const ALLOWED_INVITATION_KEYS = new Set(['emailAddress']);
const LIMITS = Object.freeze({
  eligibilitySource: Object.freeze({ bucket: 'eligibility-source', windowSeconds: 60 * 60, maxAttempts: 12 }),
  invitationSource: Object.freeze({ bucket: 'invitation-source', windowSeconds: 60 * 60, maxAttempts: 5 }),
  invitationRecipient: Object.freeze({ bucket: 'invitation-recipient', windowSeconds: 24 * 60 * 60, maxAttempts: 2 })
});

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function allowedOrigins(env) {
  return new Set([
    'https://www.caissa-chess.org',
    ...String(env.CAISSA_BROWSER_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  ]);
}

function validRequest(req, env) {
  if (req.method !== 'POST') return { ok: false, status: 405 };
  const origin = String(req.headers?.origin || '');
  if (!allowedOrigins(env).has(origin)) return { ok: false, status: 403 };
  const contentType = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return { ok: false, status: 415 };
  const length = Number(req.headers?.['content-length'] || 0);
  if (!Number.isFinite(length) || length < 0 || length > 2048) return { ok: false, status: 413 };
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return { ok: false, status: 400 };
  try {
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > 2048) return { ok: false, status: 413 };
  } catch {
    return { ok: false, status: 400 };
  }
  return { ok: true };
}

function exactKeys(body, allowed) {
  return Object.keys(body).every(key => allowed.has(key)) && Object.keys(body).length === allowed.size;
}

function validEmail(value) {
  return typeof value === 'string' && value === value.trim() && value.length >= 3 && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function makeInviter(env) {
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, telemetry: { disabled: true } });
  return params => clerk.invitations.createInvitation(params);
}

function requestSource(req) {
  const raw = String(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for']
    || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
  const first = raw.split(',')[0].trim();
  return first && first.length <= 256 ? first : 'unknown';
}

export function createRegistrationAgeGateService(dependencies = {}) {
  const env = dependencies.env || process.env;
  const now = dependencies.now || Date.now;
  const store = dependencies.store || createRegistrationAgeGateStore();
  const invite = dependencies.invite || (params => makeInviter(env)(params));

  async function claim(req, res, policy, digestKind, digestValue) {
    let allowed = false;
    try {
      allowed = await store.claim({
        scopeHash: registrationAbuseDigest(digestKind, digestValue, env),
        ...policy
      });
    } catch {
      return { ok: false, response: reply(res, 503, { code: 'REGISTRATION_UNAVAILABLE' }) };
    }
    if (!allowed) {
      res.setHeader('Retry-After', String(policy.windowSeconds));
      return { ok: false, response: reply(res, 429, { code: 'REGISTRATION_UNAVAILABLE' }) };
    }
    return { ok: true };
  }

  return Object.freeze({
    async eligibility(req, res) {
      const request = validRequest(req, env);
      if (!request.ok) return reply(res, request.status, { code: 'REQUEST_REJECTED' });
      if (!registrationReleaseReady(env)) return reply(res, 503, { code: 'REGISTRATION_PAUSED' });
      if (!exactKeys(req.body, ALLOWED_ELIGIBILITY_KEYS)) return reply(res, 400, { code: 'REQUEST_REJECTED' });

      const capacity = await claim(req, res, LIMITS.eligibilitySource, 'source', requestSource(req));
      if (!capacity.ok) return capacity.response;

      const previous = verifyRegistrationAgeState(registrationAgeStateFromRequest(req), { env, now });
      if (previous.ok && !previous.eligible) return reply(res, 403, { code: 'REGISTRATION_UNAVAILABLE' });

      const result = evaluateNeutralAge({ ...req.body, now: new Date(now()) });
      if (!result.eligible) {
        const state = issueRegistrationAgeState({ eligible: false, env, now });
        res.setHeader('Set-Cookie', registrationAgeCookie(state.value, state.maxAge));
        return reply(res, 403, { code: 'REGISTRATION_UNAVAILABLE' });
      }

      const state = issueRegistrationAgeState({ eligible: true, env, now });
      res.setHeader('Set-Cookie', registrationAgeCookie(state.value, state.maxAge));
      return reply(res, 200, { eligible: true, policyVersion: REGISTRATION_AGE_POLICY.version });
    },

    async invitation(req, res) {
      const request = validRequest(req, env);
      if (!request.ok) return reply(res, request.status, { code: 'REQUEST_REJECTED' });
      if (!registrationReleaseReady(env)) return reply(res, 503, { code: 'REGISTRATION_PAUSED' });
      if (!exactKeys(req.body, ALLOWED_INVITATION_KEYS) || !validEmail(req.body.emailAddress)) {
        return reply(res, 400, { code: 'REQUEST_REJECTED' });
      }

      const state = verifyRegistrationAgeState(registrationAgeStateFromRequest(req), { env, now });
      if (!state.ok || !state.eligible) return reply(res, 403, { code: 'ELIGIBILITY_REQUIRED' });

      const sourceCapacity = await claim(req, res, LIMITS.invitationSource, 'source', requestSource(req));
      if (!sourceCapacity.ok) return sourceCapacity.response;
      const recipientCapacity = await claim(
        req,
        res,
        LIMITS.invitationRecipient,
        'recipient',
        req.body.emailAddress.toLowerCase()
      );
      if (!recipientCapacity.ok) return recipientCapacity.response;

      let consumed = false;
      try {
        consumed = await store.consume({
          nonceHash: nonceDigest(state.nonce),
          policyVersion: REGISTRATION_AGE_POLICY.version,
          expiresAt: state.expiresAt
        });
      } catch {
        return reply(res, 503, { code: 'REGISTRATION_UNAVAILABLE' });
      }
      if (!consumed) return reply(res, 409, { code: 'ELIGIBILITY_ALREADY_USED' });

      res.setHeader('Set-Cookie', clearRegistrationAgeCookie());
      try {
        await invite({
          emailAddress: req.body.emailAddress,
          expiresInDays: 1,
          ignoreExisting: false,
          notify: true,
          redirectUrl: new URL('/signup', String(req.headers.origin)).toString(),
          publicMetadata: {
            caissaRegistrationEligibility: {
              policyVersion: REGISTRATION_AGE_POLICY.version,
              method: REGISTRATION_AGE_POLICY.method,
              screenedAt: new Date(state.issuedAt).toISOString()
            }
          }
        });
        return reply(res, 202, { accepted: true, next: 'check_email' });
      } catch {
        return reply(res, 503, { code: 'REGISTRATION_UNAVAILABLE' });
      }
    }
  });
}

export function publicRegistrationCandidate(env = process.env) {
  return Object.freeze({
    enabled: registrationReleaseReady(env),
    policyVersion: REGISTRATION_AGE_POLICY.version,
    input: 'birth_month_year',
    providerMode: 'restricted_invitations'
  });
}
