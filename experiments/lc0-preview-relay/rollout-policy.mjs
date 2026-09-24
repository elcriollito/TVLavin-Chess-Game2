export const RELEASE_STAGES = Object.freeze([
  'DISABLED',
  'INTERNAL_ONLY',
  'CANARY_OPT_IN',
  'EXPERIMENTAL_OPT_IN',
  'DRAINING'
]);

const ids = value => new Set(String(value || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean));

export function normalizeReleaseStage(value, fallback = 'DISABLED') {
  const stage = String(value || '').toUpperCase();
  return RELEASE_STAGES.includes(stage) ? stage : fallback;
}

export function rolloutEligibility(userId, stageValue, env = {}) {
  const stage = normalizeReleaseStage(stageValue);
  if (stage === 'DISABLED') return Object.freeze({ eligible: false, stage,
    reason: 'RELEASE_DISABLED' });
  if (stage === 'DRAINING') return Object.freeze({ eligible: false, stage,
    reason: 'RELEASE_DRAINING' });
  if (!userId) return Object.freeze({ eligible: false, stage,
    reason: 'AUTH_REQUIRED' });

  const internal = ids(env.EAE015B_INTERNAL_USER_IDS);
  if (stage === 'INTERNAL_ONLY') return Object.freeze({
    eligible: internal.has(userId),
    stage,
    reason: internal.has(userId) ? null : 'INTERNAL_ONLY'
  });

  if (stage === 'CANARY_OPT_IN') {
    const canary = ids(env.EAE016_CANARY_USER_IDS);
    const eligible = internal.has(userId) || canary.has(userId);
    return Object.freeze({ eligible, stage, reason: eligible ? null : 'CANARY_ONLY' });
  }

  return Object.freeze({ eligible: true, stage, reason: null });
}

export function publicRolloutConfigured(env = {}) {
  return env.EAE016_PUBLIC_ROLLOUT === '1' &&
    ['preview', 'production'].includes(env.VERCEL_ENV) &&
    env.EAE015B_PRODUCTION_CANDIDATE === '1';
}
