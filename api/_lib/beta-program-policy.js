export const BETA_STAGES = Object.freeze([
  'development', 'internal-alpha', 'internal-beta', 'closed-beta', 'public-beta', 'released', 'retired'
]);

export const BETA_ACCESS_POLICIES = Object.freeze([
  'global-beta', 'feature-entitlement', 'global-or-feature', 'public-beta', 'owner-only'
]);

export const BETA_TESTER_ENTITLEMENT = 'beta_tester';
const PRIVILEGED_ROLES = new Set(['owner', 'admin']);
const INACTIVE_STAGES = new Set(['released', 'retired']);

function entitlementsOf(user) {
  return new Set(Array.isArray(user?.entitlements) ? user.entitlements : []);
}

export function isPrivilegedBetaRole(user) {
  return PRIVILEGED_ROLES.has(String(user?.role || '').toLowerCase());
}

export function canAccessBetaProgram(user) {
  if (!user?.authenticated) return false;
  if (isPrivilegedBetaRole(user)) return true;
  const entitlements = entitlementsOf(user);
  return entitlements.has(BETA_TESTER_ENTITLEMENT)
    || [...entitlements].some(value => /_(?:alpha|beta)$/.test(value));
}

export function isExperimentActive(experiment, now = new Date()) {
  if (!experiment || experiment.enabled !== true || INACTIVE_STAGES.has(experiment.stage)) return false;
  const instant = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const started = experiment.startedAt ? new Date(experiment.startedAt).getTime() : null;
  const ends = experiment.endsAt ? new Date(experiment.endsAt).getTime() : null;
  return Number.isFinite(instant)
    && (!Number.isFinite(started) || started <= instant)
    && (!Number.isFinite(ends) || ends > instant);
}

export function experimentEntitlement(experiment) {
  return experiment?.requiredEntitlement || `${experiment?.slug || experiment?.id}_beta`;
}

export function canAccessExperiment(user, experiment, now = new Date()) {
  if (!user?.authenticated || !isExperimentActive(experiment, now)) return false;
  if (isPrivilegedBetaRole(user)) return true;
  const entitlements = entitlementsOf(user);
  const global = entitlements.has(BETA_TESTER_ENTITLEMENT);
  const feature = entitlements.has(experimentEntitlement(experiment));
  switch (experiment.accessPolicy) {
    case 'global-beta': return global;
    case 'feature-entitlement': return feature;
    case 'global-or-feature': return global || feature;
    case 'public-beta': return true;
    case 'owner-only': return false;
    default: return false;
  }
}

export function listAccessibleExperiments(user, experiments, now = new Date()) {
  return [...(experiments || [])]
    .filter(experiment => canAccessExperiment(user, experiment, now))
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.displayName.localeCompare(b.displayName));
}

export function betaStageLabel(stage) {
  return ({
    development: 'Coming Soon',
    'internal-alpha': 'Internal Alpha',
    'internal-beta': 'Internal Beta',
    'closed-beta': 'Closed Beta',
    'public-beta': 'Public Beta'
  })[stage] || 'Beta';
}
