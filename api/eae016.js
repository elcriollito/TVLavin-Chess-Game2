import { authenticateBrowserRequest } from './_lib/auth.js';
import { createHmac } from 'node:crypto';
import { configuredStore } from '../experiments/lc0-preview-relay/store.mjs';
import { normalizeReleaseStage, publicRolloutConfigured } from
  '../experiments/lc0-preview-relay/rollout-policy.mjs';

const PROVIDER_ID = 'lc0-maia-1100-preview';
const SOURCE_MANIFEST_SHA256 =
  '492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f';
const DEPLOYMENT_MANIFEST_SHA256 =
  '9980a755a44b3d704f70505a803b6dd112c97a39853260bc648499b5bed4fd45';
const TELEMETRY = new Set([
  'opt_in_viewed', 'opt_in_enabled', 'opt_in_disabled', 'lc0_selector_visible',
  'lc0_session_requested', 'lc0_session_created', 'lc0_ready',
  'lc0_initialization_failed', 'lc0_popup_blocked', 'lc0_unsupported_browser',
  'lc0_match_started', 'lc0_match_completed', 'lc0_user_abort',
  'lc0_stop_completed', 'lc0_cleanup_completed', 'lc0_cleanup_failed',
  'lc0_transport_failed'
]);

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Vary', 'Cookie, Authorization');
}

function expectedOrigin(env) {
  try { return new URL(env.EAE011_MAIN_ORIGIN).origin; } catch { return ''; }
}

function requestAllowed(req, env) {
  const main = expectedOrigin(env);
  const host = String(req.headers.host || '').toLowerCase();
  const origin = String(req.headers.origin || '');
  if (env.VERCEL_ENV === 'development' && /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host))
    return !origin || /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin);
  return main && host === new URL(main).host && (!origin || origin === main);
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
    const contentType = String(response.headers.get('content-type') || '');
    if (!response.ok || !contentType.includes('application/json')) return null;
    return await response.json();
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

async function infrastructureHealth(env, stage, mode) {
  if (stage === 'DISABLED' || stage === 'DRAINING' || mode !== 'ENABLED') {
    return { healthy: false, runtimeHealthy: null, relayHealthy: null };
  }
  let engineOrigin = '', relayOrigin = '', mainOrigin = '';
  try {
    engineOrigin = new URL(env.EAE011_ENGINE_ORIGIN).origin;
    relayOrigin = new URL(env.EAE015A_RELAY_ORIGIN).origin;
    mainOrigin = new URL(env.EAE011_MAIN_ORIGIN).origin;
  } catch { return { healthy: false, runtimeHealthy: false, relayHealthy: false }; }
  const [runtime, relay] = await Promise.all([
    fetchJson(`${engineOrigin}/health.json`),
    fetchJson(`${relayOrigin}/api/eae011?action=health`, {
      headers: { Origin: mainOrigin, 'User-Agent': 'caissa-eae016-gateway/1.0' }
    })
  ]);
  const runtimeHealthy = runtime?.ok === true &&
    runtime.manifestSha256 === DEPLOYMENT_MANIFEST_SHA256;
  const relayHealthy = relay?.ok === true && relay.mode === 'ENABLED' &&
    relay.releaseStage === stage && relay.productionShape === true;
  return { healthy: runtimeHealthy && relayHealthy, runtimeHealthy, relayHealthy };
}

async function relayEligibility(req, env, action = 'eligibility') {
  let relayOrigin = '', mainOrigin = '';
  try {
    relayOrigin = new URL(env.EAE015A_RELAY_ORIGIN).origin;
    mainOrigin = new URL(env.EAE011_MAIN_ORIGIN).origin;
  } catch { return null; }
  const authorization = String(req.headers.authorization || req.headers.Authorization || '');
  if (!authorization.startsWith('Bearer ')) return null;
  return await fetchJson(`${relayOrigin}/api/eae011?action=${action}`, {
    headers: { Origin: mainOrigin, Authorization: authorization,
      'User-Agent': 'caissa-eae016-gateway/1.0' }
  });
}

async function config(req, res) {
  const stage = normalizeReleaseStage(process.env.EAE016_RELEASE_STAGE ||
    process.env.EAE015B_RELEASE_STAGE);
  const store = configuredStore();
  const mode = await store.getControlMode();
  let userId = null;
  let authenticated = false;
  if (!['DISABLED', 'DRAINING'].includes(stage) && mode === 'ENABLED') {
    const auth = await authenticateBrowserRequest(req);
    authenticated = auth.authenticated === true;
    userId = authenticated ? auth.userId : null;
  }
  const cohort = authenticated ? await relayEligibility(req, process.env) :
    { eligible: false, reason: 'AUTH_REQUIRED' };
  const infrastructure = cohort?.eligible
    ? await infrastructureHealth(process.env, stage, mode)
    : { healthy: false, runtimeHealthy: null, relayHealthy: null };
  const deploymentManifest = String(process.env.EAE015A_MANIFEST_SHA256 || '');
  const manifestValid = deploymentManifest === DEPLOYMENT_MANIFEST_SHA256;
  const eligible = mode === 'ENABLED' && cohort?.eligible === true &&
    infrastructure.healthy && manifestValid;
  const reason = eligible ? null : mode !== 'ENABLED' ?
    (mode === 'DRAINING' ? 'RELEASE_DRAINING' : 'RELEASE_DISABLED') :
    cohort?.reason || (!manifestValid ? 'INTEGRITY_UNAVAILABLE' : 'RUNTIME_UNAVAILABLE');
  if (eligible) await store.recordRolloutEvent(actorKey(userId, process.env), 'eligible_user');
  return res.status(200).json({
    enabled: eligible,
    eligible,
    authenticated,
    reason,
    mode,
    releaseStage: stage,
    providerId: PROVIDER_ID,
    mainOrigin: expectedOrigin(process.env),
    engineOrigin: process.env.EAE011_ENGINE_ORIGIN,
    relayOrigin: process.env.EAE015A_RELAY_ORIGIN,
    enginePath: '/',
    sourceManifestSha256: SOURCE_MANIFEST_SHA256,
    manifestSha256: deploymentManifest,
    runtimeHealthy: infrastructure.runtimeHealthy,
    relayHealthy: infrastructure.relayHealthy
  });
}

function actorKey(userId, env) {
  const key = String(env.EAE016_TELEMETRY_HMAC_KEY || '');
  if (key.length < 32) {
    const error = new Error('TELEMETRY_KEY_UNAVAILABLE');
    error.code = 'TELEMETRY_KEY_UNAVAILABLE';
    throw error;
  }
  return createHmac('sha256', key).update(String(userId)).digest('hex');
}

async function dashboard(req, res) {
  const auth = await authenticateBrowserRequest(req);
  if (!auth.authenticated || !auth.userId)
    return res.status(auth.status || 401).json({ error: auth.code || 'AUTH_REQUIRED' });
  const internal = await relayEligibility(req, process.env, 'internal_eligibility');
  if (!internal?.eligible) return res.status(403).json({ error: 'INTERNAL_ONLY' });
  const minutes = Number(req.query?.minutes || 60);
  const store = configuredStore();
  return res.status(200).json(await store.rolloutDashboard(minutes));
}

async function telemetry(req, res) {
  const auth = await authenticateBrowserRequest(req);
  if (!auth.authenticated || !auth.userId)
    return res.status(auth.status || 401).json({ error: auth.code || 'AUTH_REQUIRED' });
  let input;
  try { input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'REQUEST_INVALID' }); }
  if (!input || typeof input !== 'object' || Array.isArray(input) || !TELEMETRY.has(input.event))
    return res.status(400).json({ error: 'EVENT_INVALID' });
  const cohort = await relayEligibility(req, process.env);
  if (!cohort?.eligible) return res.status(403).json({ error: 'ROLLOUT_UNAVAILABLE' });
  const store = configuredStore();
  const actor = actorKey(auth.userId, process.env);
  const bucket = `eae016_telemetry_${actor}`;
  if (!(await store.allowRate(bucket, 'product', Date.now(), 60_000, 60)))
    return res.status(429).json({ error: 'RATE_LIMITED' });
  const latencyMs = Number.isFinite(input.latencyMs)
    ? Math.max(0, Math.min(300_000, Math.round(input.latencyMs))) : null;
  await store.recordRolloutEvent(actor, input.event, latencyMs);
  return res.status(202).json({ accepted: true });
}

export default async function handler(req, res) {
  noStore(res);
  try {
    if (!requestAllowed(req, process.env))
      return res.status(404).json({ error: 'ROLLOUT_UNAVAILABLE' });
    if (!publicRolloutConfigured(process.env)) {
      if (req.method !== 'GET') return res.status(404).json({ error: 'ROLLOUT_UNAVAILABLE' });
      return res.status(200).json({ enabled: false, eligible: false, authenticated: false,
        reason: 'RELEASE_DISABLED', mode: 'DISABLED', releaseStage: 'DISABLED',
        providerId: PROVIDER_ID, mainOrigin: expectedOrigin(process.env),
        engineOrigin: process.env.EAE011_ENGINE_ORIGIN,
        relayOrigin: process.env.EAE015A_RELAY_ORIGIN,
        sourceManifestSha256: SOURCE_MANIFEST_SHA256,
        manifestSha256: process.env.EAE015A_MANIFEST_SHA256 || '',
        runtimeHealthy: null, relayHealthy: null });
    }
    if (req.method === 'GET' && req.query?.view === 'dashboard')
      return await dashboard(req, res);
    if (req.method === 'GET') return await config(req, res);
    if (req.method === 'POST') return await telemetry(req, res);
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    const code = String(error?.code || 'ROLLOUT_UNAVAILABLE');
    const status = code === 'STORE_UNAVAILABLE' || code === 'LC0_STORE_TARGET_REJECTED' ? 503 : 500;
    return res.status(status).json({ error: status === 503 ? 'ROLLOUT_UNAVAILABLE' : 'INTERNAL_ERROR' });
  }
}
