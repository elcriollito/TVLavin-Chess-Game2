import { getClientIP } from './rate-limit.js';
import { sameOrigin } from './scanner-beta-policy.js';

export const SCANNER_PUBLIC = Object.freeze({
  requiredStage: 'public-beta',
  maxJsonBytes: 1_500_000,
  maxImageBytes: 12_000_000,
  imageTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  authenticatedRequestsPerMinute: 12,
  guestRequestsPerMinute: 4,
  authenticatedFeedbackRequestsPerMinute: 12,
  authenticatedImageRequestsPerMinute: 6
});

export function publicScannerEnabled(env = process.env) {
  return env.CAISSA_SCANNER_PUBLIC_STAGE === SCANNER_PUBLIC.requiredStage;
}

function configuredLimit(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 120 ? number : fallback;
}

export function recognitionRatePolicy(identity, req, env = process.env) {
  const authenticated = Boolean(identity?.authenticated && identity.userId);
  return Object.freeze({
    identifier: authenticated ? `user:${identity.userId}` : `guest:${getClientIP(req)}`,
    max: configuredLimit(
      authenticated ? env.CAISSA_SCANNER_PUBLIC_AUTH_RPM : env.CAISSA_SCANNER_PUBLIC_GUEST_RPM,
      authenticated ? SCANNER_PUBLIC.authenticatedRequestsPerMinute : SCANNER_PUBLIC.guestRequestsPerMinute
    ),
    audience: authenticated ? 'authenticated' : 'guest'
  });
}

export function mutationRatePolicy(kind, identity, req, env = process.env) {
  const authenticated = Boolean(identity?.authenticated && identity.id);
  const settings = {
    scan: {
      env: authenticated ? env.CAISSA_SCANNER_PUBLIC_AUTH_RPM : env.CAISSA_SCANNER_PUBLIC_GUEST_RPM,
      fallback: authenticated ? SCANNER_PUBLIC.authenticatedRequestsPerMinute : SCANNER_PUBLIC.guestRequestsPerMinute
    },
    feedback: {
      env: env.CAISSA_SCANNER_PUBLIC_FEEDBACK_RPM,
      fallback: SCANNER_PUBLIC.authenticatedFeedbackRequestsPerMinute
    },
    failure: {
      env: env.CAISSA_SCANNER_PUBLIC_FEEDBACK_RPM,
      fallback: SCANNER_PUBLIC.authenticatedFeedbackRequestsPerMinute
    },
    image: {
      env: env.CAISSA_SCANNER_PUBLIC_IMAGE_RPM,
      fallback: SCANNER_PUBLIC.authenticatedImageRequestsPerMinute
    }
  }[kind];
  if (!settings) throw new Error('RATE_POLICY_INVALID');
  return Object.freeze({
    identifier: authenticated ? `user:${identity.id}` : `guest:${getClientIP(req)}`,
    max: configuredLimit(settings.env, settings.fallback),
    prefix: `scanner-public-${kind}`
  });
}

export function publicHeaders(target) {
  const entries = {
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
  for (const [name, value] of Object.entries(entries)) target.setHeader?.(name, value);
  return entries;
}

export { sameOrigin };
