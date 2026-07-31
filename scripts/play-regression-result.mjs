const STATUS = Object.freeze(['passed', 'failed']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const PLAY_REGRESSION_RESULT_VERSION = '1.0.0';

export function createPlayRegressionResult(input = {}) {
  const suites = Array.isArray(input.suites) ? input.suites.map(suite => ({
    suiteId: String(suite.suiteId || ''), status: STATUS.includes(suite.status) ? suite.status : 'failed',
    durationMs: Number.isFinite(suite.durationMs) ? Math.max(0, Math.round(suite.durationMs)) : 0
  })) : [];
  const failed = suites.filter(suite => suite.status === 'failed').length;
  const blockers = [...(input.blockers || [])];
  if (failed && blockers.length === 0) blockers.push('required-local-suite-failed');
  return deepFreeze({
    schemaVersion: PLAY_REGRESSION_RESULT_VERSION,
    runId: String(input.runId || 'local-regression'), baseline: String(input.baseline || 'unknown'),
    suites, passed: suites.length - failed, failed, skipped: Number(input.skipped || 0),
    external: [...(input.external || [])], manual: [...(input.manual || [])],
    warnings: [...(input.warnings || [])], blockers,
    durationMs: suites.reduce((sum, suite) => sum + suite.durationMs, 0),
    status: failed || blockers.length ? 'failed' : 'passed'
  });
}
