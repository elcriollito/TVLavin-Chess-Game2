/**
 * Browser-side preview of the neutral age calculation.
 * The server repeats the decision and is always authoritative.
 */

export const AGE_POLICY_VERSION = 'caissa-account-16-plus-v1';
export const MINIMUM_ACCOUNT_AGE = 16;

export function evaluateRegistrationEligibility({ birthMonth, birthYear, now = new Date() } = {}) {
  const month = typeof birthMonth === 'string' && /^\d{1,2}$/.test(birthMonth) ? Number(birthMonth) : birthMonth;
  const year = typeof birthYear === 'string' && /^\d{4}$/.test(birthYear) ? Number(birthYear) : birthYear;
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  if (!Number.isInteger(month) || month < 1 || month > 12
      || !Number.isInteger(year) || year < currentYear - 120 || year > currentYear) {
    return Object.freeze({ eligible: false, reason: 'answer_required' });
  }

  const thresholdYear = currentYear - MINIMUM_ACCOUNT_AGE;
  const eligible = year < thresholdYear || (year === thresholdYear && month < currentMonth);
  return Object.freeze({ eligible, reason: eligible ? 'eligible' : 'registration_unavailable' });
}
