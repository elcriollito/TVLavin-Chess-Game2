import { authenticateBrowserRequest } from './auth.js';
import { betaEnabled, privateHeaders } from './scanner-beta-policy.js';
import { canAccessBetaProgram, canAccessExperiment, listAccessibleExperiments } from './beta-program-policy.js';
import { createBetaProgramStore } from './beta-program-store.js';
import { getBetaActivitySummary } from './beta-activity-summary.js';

export function scannerInfrastructureEnabled(env = process.env) {
  return betaEnabled(env);
}

export function createBetaProgramService({ store = null, authenticate = authenticateBrowserRequest, env = process.env, now = () => new Date() } = {}) {
  const data = () => store || createBetaProgramStore();

  async function identity(req) {
    const auth = await authenticate(req);
    if (!auth.authenticated) return { ok: false, ...auth };
    const user = await data().getUserByClerkId(auth.userId);
    if (!user) return { ok: false, authenticated: true, status: 403, code: 'BETA_ACCESS_DENIED' };
    return { ok: true, user };
  }

  async function authorizeProgram(req) {
    try {
      const resolved = await identity(req);
      if (!resolved.ok) return resolved;
      if (!canAccessBetaProgram(resolved.user)) {
        return { ok: false, authenticated: true, status: 403, code: 'BETA_ACCESS_DENIED' };
      }
      return resolved;
    } catch (_) {
      return { ok: false, authenticated: false, status: 503, code: 'BETA_ACCESS_UNAVAILABLE' };
    }
  }

  async function authorizeExperiment(req, experimentId) {
    let access;
    try { access = await identity(req); }
    catch (_) { return { ok: false, authenticated: false, status: 503, code: 'BETA_ACCESS_UNAVAILABLE' }; }
    if (!access.ok) return access;
    try {
      const experiment = await data().getExperiment(experimentId);
      const infrastructureEnabled = experimentId !== 'scanner' || scannerInfrastructureEnabled(env);
      if (!infrastructureEnabled) {
        return { ok: false, authenticated: true, status: 404, code: 'BETA_DISABLED' };
      }
      if (!canAccessExperiment(access.user, experiment, now())) {
        return { ok: false, authenticated: true, status: 403, code: 'EXPERIMENT_ACCESS_DENIED' };
      }
      return { ...access, experiment };
    } catch (_) {
      return { ok: false, authenticated: true, status: 503, code: 'BETA_ACCESS_UNAVAILABLE' };
    }
  }

  async function listForRequest(req) {
    let access;
    try { access = await identity(req); }
    catch (_) { return { ok: false, authenticated: false, status: 503, code: 'BETA_ACCESS_UNAVAILABLE' }; }
    if (!access.ok) return access;
    try {
      const experiments = listAccessibleExperiments(access.user, await data().listExperiments(), now())
        .filter(experiment => experiment.id !== 'scanner' || scannerInfrastructureEnabled(env));
      if (!canAccessBetaProgram(access.user) && experiments.length === 0) {
        return { ok: false, authenticated: true, status: 403, code: 'BETA_ACCESS_DENIED' };
      }
      const activitySummaries = {};
      if (typeof data().getBetaActivitySummary === 'function') {
        await Promise.all(experiments.filter(experiment => experiment.feedbackEnabled).map(async experiment => {
          const summary = await getBetaActivitySummary(access.user.id, experiment.id,
            (userId, experimentId) => data().getBetaActivitySummary(userId, experimentId));
          if (summary) activitySummaries[experiment.id] = summary;
        }));
      }
      return { ...access, experiments, activitySummaries };
    } catch (_) {
      return { ok: false, authenticated: true, status: 503, code: 'BETA_ACCESS_UNAVAILABLE' };
    }
  }

  function audit(event) {
    try { Promise.resolve(data().recordEvent(event)).catch(() => {}); }
    catch (_) { /* audit failure never changes access */ }
  }

  return Object.freeze({ authorizeProgram, authorizeExperiment, listForRequest, audit });
}

export function betaPrivateHeaders(target) {
  privateHeaders(target);
  target.setHeader?.('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}

export function safeBetaReturnPath(req, fallback = '/beta') {
  const url = new URL(req.url || fallback, 'https://www.caissa-chess.org');
  const value = url.pathname.startsWith('/beta') || url.pathname.startsWith('/scanner/beta') ? `${url.pathname}${url.search}` : fallback;
  return value;
}
