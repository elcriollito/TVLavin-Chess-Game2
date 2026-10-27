/**
 * Data-minimizing registration eligibility candidate.
 *
 * This module deliberately accepts only an age band. It must run before any
 * Clerk sign-up request and its result must not be treated as proof of age.
 * Production registration remains paused until the owner approves a policy
 * and the server/provider boundary is certified.
 */

export const AGE_BANDS = Object.freeze({
  UNDER_13: 'under_13',
  AGE_13_TO_15: '13_to_15',
  AGE_16_PLUS: '16_plus',
  UNDISCLOSED: 'undisclosed'
});

export const AGE_ELIGIBILITY_REASONS = Object.freeze({
  ELIGIBLE: 'eligible',
  BELOW_CANDIDATE_MINIMUM: 'below_candidate_minimum',
  ANSWER_REQUIRED: 'answer_required',
  REGISTRATION_PAUSED: 'registration_paused'
});

const KNOWN_BANDS = new Set(Object.values(AGE_BANDS));

export function evaluateRegistrationEligibility({
  ageBand,
  registrationEnabled = false
} = {}) {
  const normalizedBand = KNOWN_BANDS.has(ageBand) ? ageBand : AGE_BANDS.UNDISCLOSED;

  if (!registrationEnabled) {
    return Object.freeze({
      eligible: false,
      reason: AGE_ELIGIBILITY_REASONS.REGISTRATION_PAUSED
    });
  }

  if (normalizedBand === AGE_BANDS.UNDISCLOSED) {
    return Object.freeze({
      eligible: false,
      reason: AGE_ELIGIBILITY_REASONS.ANSWER_REQUIRED
    });
  }

  if (normalizedBand !== AGE_BANDS.AGE_16_PLUS) {
    return Object.freeze({
      eligible: false,
      reason: AGE_ELIGIBILITY_REASONS.BELOW_CANDIDATE_MINIMUM
    });
  }

  return Object.freeze({
    eligible: true,
    reason: AGE_ELIGIBILITY_REASONS.ELIGIBLE
  });
}
