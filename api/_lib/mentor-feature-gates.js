export function inspectExactBooleanGate(value) {
  const present = value !== undefined && value !== null;
  const valid = value === 'true' || value === 'false';
  return Object.freeze({ present, valid, enabled: value === 'true' });
}

export const exactTrueEnabled = value => value === 'true';

export function sharedMentorGatesEnabled(env = {}) {
  return exactTrueEnabled(env.MENTOR_AI_ENABLED)
    && exactTrueEnabled(env.MENTOR_SHARED_AI_ENABLED);
}
