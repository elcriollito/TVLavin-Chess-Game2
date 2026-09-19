export const BETA_ACTIVITY_TARGET = 100;
export const BETA_ACTIVITY_MILESTONES = Object.freeze([
  Object.freeze({ value: 30, label: 'Minimum useful checkpoint reached' }),
  Object.freeze({ value: 50, label: 'Strong initial field sample' }),
  Object.freeze({ value: 100, label: 'Recommended first certification target reached' })
]);

const COUNT_KEYS = Object.freeze([
  'attempted', 'completed', 'confirmedCorrect', 'corrected', 'localizationFailures',
  'scanFailures', 'pending', 'completedToday', 'completedThisWeek', 'completedAllTime'
]);

export function emptyBetaActivitySummary(experimentId) {
  return Object.freeze({ experimentId, target: BETA_ACTIVITY_TARGET,
    attempted: 0, completed: 0, confirmedCorrect: 0, corrected: 0,
    localizationFailures: 0, scanFailures: 0, pending: 0,
    completedToday: 0, completedThisWeek: 0, completedAllTime: 0,
    milestone: null });
}

export function reachedBetaMilestone(completed) {
  return [...BETA_ACTIVITY_MILESTONES].reverse().find(item => completed >= item.value) || null;
}

export function normalizeBetaActivitySummary(experimentId, raw = {}) {
  const summary = { experimentId, target: BETA_ACTIVITY_TARGET };
  for (const key of COUNT_KEYS) {
    const value = Number(raw[key] ?? 0);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('BETA_ACTIVITY_COUNT_INVALID');
    summary[key] = value;
  }
  if (summary.completed !== summary.confirmedCorrect + summary.corrected
      + summary.localizationFailures + summary.scanFailures) throw new Error('BETA_ACTIVITY_TOTAL_MISMATCH');
  if (summary.completedAllTime !== summary.completed
      || summary.completedToday > summary.completed || summary.completedThisWeek > summary.completed) {
    throw new Error('BETA_ACTIVITY_TIME_TOTAL_MISMATCH');
  }
  summary.milestone = reachedBetaMilestone(summary.completed);
  return Object.freeze(summary);
}

export async function getBetaActivitySummary(userId, experimentId, loadSummary) {
  if (!userId || !/^[a-z][a-z0-9-]{1,63}$/.test(experimentId || '') || typeof loadSummary !== 'function') {
    throw new Error('BETA_ACTIVITY_SCOPE_INVALID');
  }
  const raw = await loadSummary(userId, experimentId);
  return raw == null ? null : normalizeBetaActivitySummary(experimentId, raw);
}
