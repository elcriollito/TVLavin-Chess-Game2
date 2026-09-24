// EAE-015B limited-production Lc0 relay. Production defaults to DISABLED and
// Stage 1 additionally requires an explicit internal user allowlist.
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { authenticateRequest } from './_lib/auth.js';
import { DurableBroker, RelayError } from '../experiments/lc0-preview-relay/durable-broker.mjs';
import { configuredStore } from '../experiments/lc0-preview-relay/store.mjs';
import { PRODUCTION_POLICY, controlPolicy, nextPollDelay } from
  '../experiments/lc0-preview-relay/production-policy.mjs';
import { normalizeReleaseStage, rolloutEligibility } from
  '../experiments/lc0-preview-relay/rollout-policy.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const allowedActions = Object.freeze({
  create: ['main', 'POST'], inspect: ['main', 'GET'], command: ['main', 'POST'],
  advance: ['main', 'POST'], terminate: ['main', 'POST'], stream_main: ['main', 'GET'],
  heartbeat_main: ['main', 'POST'],
  claim: ['engine', 'POST'], message: ['engine', 'POST'], stream_engine: ['engine', 'GET'],
  engine_state: ['engine', 'GET'], heartbeat_engine: ['engine', 'POST'],
  claim_command: ['engine', 'POST'],
  config: ['main', 'GET'], health: ['either', 'GET'],
  eligibility: ['main', 'GET'], internal_eligibility: ['main', 'GET']
});

export function relayMetrics({ action, messageType, messageCode, status, errorCode, latencyMs,
  dbReads = 0, dbWrites = 0, activeSessions = null }) {
  const metrics = [{ metric: 'relay_request', value: 1, latencyMs }];
  if (dbReads) metrics.push({ metric: 'db_read', value: dbReads });
  if (dbWrites) metrics.push({ metric: 'db_write', value: dbWrites });
  if (Number.isSafeInteger(activeSessions))
    metrics.push({ metric: 'active_sessions', kind: 'gauge', value: activeSessions });
  if (action === 'create') {
    metrics.push({ metric: 'create_attempt', value: 1, latencyMs });
    if (status === 201) metrics.push({ metric: 'create_success', value: 1, latencyMs });
  }
  if (action === 'claim') metrics.push({
    metric: status === 200 ? 'claim_success' : 'claim_failure', value: 1, latencyMs
  });
  if (action === 'message' && messageType === 'READY') metrics.push({
    metric: status === 202 ? 'ready_success' : 'ready_failure', value: 1, latencyMs
  });
  if (action === 'message' && messageType === 'CLEANUP') metrics.push({
    metric: status === 202 ? 'cleanup_success' : 'cleanup_failure', value: 1, latencyMs
  });
  if (['stream_main', 'stream_engine'].includes(action)) metrics.push({
    metric: status === 200 ? 'stream_reconnect' : 'stream_reconnect_failure', value: 1,
    latencyMs
  });
  const code = String(errorCode || messageCode || '');
  // A post-termination owner inspection is the cleanup proof, not an outage.
  // Count SESSION_GONE only when an operational action unexpectedly loses state.
  if (code === 'SESSION_GONE' && action !== 'inspect')
    metrics.push({ metric: 'session_gone', value: 1 });
  if (code.includes('STOP_TIMEOUT') || code === 'STOP_RESULT_TIMEOUT')
    metrics.push({ metric: 'stop_timeout', value: 1 });
  if (code.includes('LEASE_EXPIRED')) metrics.push({ metric: 'lease_expiry', value: 1 });
  if (code.endsWith('_RATE_LIMIT') || status === 429)
    metrics.push({ metric: 'rate_limit_reject', value: 1 });
  if (['AUTH_REQUIRED', 'INVALID_TOKEN', 'BEARER_REQUIRED', 'ENGINE_CREDENTIAL_INVALID']
    .includes(code)) metrics.push({ metric: 'auth_rejection', value: 1 });
  if (['ORIGIN_REJECTED', 'ORIGIN_REQUIRED', 'HOST_REJECTED', 'CROSS_SITE_REJECTED']
    .includes(code)) metrics.push({ metric: 'origin_rejection', value: 1 });
  if (code.includes('FORCED_TERMINATION')) metrics.push({ metric: 'forced_termination', value: 1 });
  if (code.includes('WORKER') || code.includes('RUNTIME_FAILURE'))
    metrics.push({ metric: 'worker_crash', value: 1 });
  if (code.includes('NETWORK') && (code.includes('HASH') || code.includes('INTEGRITY')))
    metrics.push({ metric: 'network_hash_failure', value: 1 });
  if (status >= 500 && !['LC0_DISABLED', 'LC0_DRAINING'].includes(code))
    metrics.push({ metric: 'relay_error', value: 1, latencyMs });
  return metrics;
}

export function crossSiteAllowed(site, origin, pair) {
  return site !== 'cross-site' || (pair.productionShape &&
    [pair.main, pair.engine].includes(origin));
}

function origins(env) {
  const main = new URL(env.EAE011_MAIN_ORIGIN || 'https://invalid.local');
  const engine = new URL(env.EAE011_ENGINE_ORIGIN || 'https://invalid.local');
  const expectedBranches = new Set([
    'experiment/lc0-eae015a-production-infrastructure',
    'integration/lc0-limited-production-rc'
  ]);
  const productionShape = env.EAE015A_PRODUCTION_SHAPE === '1' &&
    (env.VERCEL_ENV === 'production' ||
      expectedBranches.has(env.VERCEL_GIT_COMMIT_REF) ||
      expectedBranches.has(env.EAE015A_BRANCH_GUARD));
  const relay = new URL(productionShape ? env.EAE015A_RELAY_ORIGIN || 'https://invalid.local' : main);
  if (main.protocol !== 'https:' || engine.protocol !== 'https:' || relay.protocol !== 'https:' ||
      main.origin === engine.origin || main.pathname !== '/' || engine.pathname !== '/' ||
      relay.pathname !== '/' || main.origin === relay.origin || engine.origin === relay.origin)
    throw new RelayError('PRODUCTION_ORIGINS_REQUIRED', 503);
  return { main: main.origin, engine: engine.origin, relay: relay.origin, productionShape };
}

function releaseStage(env) {
  return normalizeReleaseStage(env.EAE016_RELEASE_STAGE || env.EAE015B_RELEASE_STAGE);
}

function checkRequest(req, role, pair, method) {
  const host = String(req.headers.host || '').toLowerCase();
  const expected = role === 'main' ? pair.main : pair.engine;
  const expectedHost = new URL(pair.productionShape ? pair.relay : expected).host;
  if (role === 'either') {
    const hosts = pair.productionShape ? [new URL(pair.relay).host] :
      [new URL(pair.main).host, new URL(pair.engine).host];
    if (!hosts.includes(host))
      throw new RelayError('HOST_REJECTED', 403);
  } else if (host !== expectedHost) throw new RelayError('HOST_REJECTED', 403);
  if (req.headers.origin && (role === 'either' ?
      ![pair.main, pair.engine, `https://${host}`].includes(req.headers.origin) :
      req.headers.origin !== expected)) throw new RelayError('ORIGIN_REJECTED', 403);
  if (method === 'POST' && req.headers.origin !== expected) throw new RelayError('ORIGIN_REQUIRED', 403);
  if (!crossSiteAllowed(req.headers['sec-fetch-site'], req.headers.origin, pair))
    throw new RelayError('CROSS_SITE_REJECTED', 403);
}

function input(req) {
  let value;
  try { value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { throw new RelayError('JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Buffer.byteLength(JSON.stringify(value)) > 4096) throw new RelayError('REQUEST_INVALID', 400);
  return value;
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  if (!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(value)) throw new RelayError('BEARER_REQUIRED', 401);
  return value.slice(7);
}

async function mainUser(req) {
  const result = await authenticateRequest(req);
  if (!result.authenticated || !result.userId) throw new RelayError(result.code || 'AUTH_REQUIRED', result.status || 401);
  return result.userId;
}

function cors(req, res, pair) {
  const origin = String(req.headers.origin || '');
  if ([pair.main, pair.engine].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('Vary', 'Origin');
  }
}

function respond(res, status, value, req = null, pair = null) {
  if (req && pair) cors(req, res, pair);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(value);
}

async function stream(req, res, broker, sessionId, role, authority, cursor) {
  const connection = await broker.connect(sessionId, role, authority, cursor);
  const pair = origins(process.env);
  cors(req, res, pair);
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res.write(`event: lease\ndata: ${JSON.stringify({ epoch: connection.epoch })}\n\n`);
  let closed = false;
  res.on('close', () => { closed = true; });
  let currentCursor = cursor;
  let unacknowledgedSince = null;
  let pollDelay = PRODUCTION_POLICY.pollInitialMs;
  let lastCommentAt = Date.now();
  try {
    while (!closed) {
      const next = await broker.poll(sessionId, role, authority, connection.epoch, currentCursor);
      for (const item of next.events) {
        if (!res.write(`id: ${item.id}\ndata: ${JSON.stringify(item.value)}\n\n`))
          await Promise.race([once(res, 'drain'), once(res, 'close')]);
        if (closed) break;
      }
      currentCursor = next.cursor;
      if (next.acknowledgedCursor >= currentCursor) unacknowledgedSince = null;
      else if (unacknowledgedSince === null) unacknowledgedSince = Date.now();
      // res.write() only confirms acceptance by the host response object. A
      // suspended downstream socket can lose that accepted frame without a
      // close/error signal. Rewind to the durable client ACK cursor so command
      // delivery remains at-least-once; claim_command keeps execution exactly-once.
      if (unacknowledgedSince !== null && Date.now() - unacknowledgedSince >= 1_000) {
        currentCursor = next.acknowledgedCursor;
        unacknowledgedSince = Date.now();
      }
      if (next.phase === 'CLEANED' && role === 'main') break;
      if (Date.now() - lastCommentAt >= PRODUCTION_POLICY.streamCommentMs) {
        res.write(': keepalive\n\n');
        lastCommentAt = Date.now();
      }
      pollDelay = nextPollDelay(pollDelay, next.events.length > 0);
      await pause(pollDelay);
    }
  } catch (error) {
    if (!closed) res.write(`data: ${JSON.stringify({ type: 'ERROR', code: error instanceof RelayError ? error.code : 'STREAM_ERROR' })}\n\n`);
  } finally {
    await broker.close(sessionId, role, authority, connection.epoch);
    if (!res.writableEnded) res.end();
  }
}

export default async function handler(req, res) {
  const started = Date.now();
  let store = null, ioBefore = null, action = '', messageType = null, messageCode = null,
    errorCode = null;
  try {
    if (!['preview', 'production'].includes(process.env.VERCEL_ENV) ||
        process.env.EAE015B_PRODUCTION_CANDIDATE !== '1')
      throw new RelayError('LC0_DISABLED', 503);
    const pair = origins(process.env);
    const stage = releaseStage(process.env);
    cors(req, res, pair);
    if (req.method === 'OPTIONS') {
      checkRequest(req, 'either', pair, 'OPTIONS');
      cors(req, res, pair);
      return res.status(204).end();
    }
    action = String(req.query?.action || '');
    const actionPolicy = allowedActions[action];
    if (!actionPolicy || req.method !== actionPolicy[1]) throw new RelayError('ENDPOINT_NOT_FOUND', 404);
    checkRequest(req, actionPolicy[0], pair, req.method);
    store = configuredStore();
    ioBefore = store.stats();
    const mode = await store.getControlMode();
    const broker = new DurableBroker(store, { requestId: randomUUID() });
    const sessionId = String(req.query?.sessionId || '');
    if (action === 'health') return respond(res, 200,
      { ok: true, releaseStage: stage, productionShape: pair.productionShape, mode }, req, pair);
    if (action === 'config') return respond(res, 200,
      { mainOrigin: pair.main, engineOrigin: pair.engine, relayOrigin: pair.relay,
        releaseStage: stage, mode }, req, pair);
    if (action === 'eligibility' || action === 'internal_eligibility') {
      const userId = await mainUser(req);
      const eligibilityStage = action === 'internal_eligibility' ? 'INTERNAL_ONLY' : stage;
      const rollout = rolloutEligibility(userId, eligibilityStage, process.env);
      const enabled = action === 'internal_eligibility'
        ? rollout.eligible : mode === 'ENABLED' && rollout.eligible;
      return respond(res, 200, { eligible: enabled,
        reason: enabled ? null : mode !== 'ENABLED' && action === 'eligibility'
          ? (mode === 'DRAINING' ? 'RELEASE_DRAINING' : 'RELEASE_DISABLED')
          : rollout.reason,
        releaseStage: stage, mode }, req, pair);
    }
    if (action === 'create') {
      const policy = controlPolicy(mode, action);
      if (!policy.allowed) throw new RelayError(policy.code, 503);
      const userId = await mainUser(req);
      const rollout = rolloutEligibility(userId, stage, process.env);
      if (!rollout.eligible) {
        const code = rollout.reason === 'CANARY_ONLY' ? 'LC0_CANARY_ONLY' :
          rollout.reason === 'INTERNAL_ONLY' ? 'LC0_INTERNAL_ONLY' : 'LC0_DISABLED';
        throw new RelayError(code, 403);
      }
      const { participantRole } = input(req);
      // A caller-provided competition label is not authority. Bind each relay
      // session to a server-generated competition identifier instead.
      const competitionId = `competition_${randomUUID().replaceAll('-', '')}`;
      return respond(res, 201, await broker.create({ userId, competitionId, participantRole }), req, pair);
    }
    if (action === 'claim') {
      const { sessionId: id, claimToken } = input(req);
      return respond(res, 200, await broker.claim(id, claimToken), req, pair);
    }
    if (action === 'message') {
      const body = input(req), policy = controlPolicy(mode, action, body.type);
      messageType = body.type; messageCode = body.code || null;
      if (!policy.allowed) throw new RelayError(policy.code, 503);
      return respond(res, 202,
        await broker.engineMessage(sessionId, bearer(req), body), req, pair);
    }
    if (action === 'engine_state') return respond(res, 200,
      await broker.inspectEngine(sessionId, bearer(req)));
    if (action === 'heartbeat_engine') {
      const { epoch, cursor } = input(req);
      return respond(res, 200, await broker.heartbeat(sessionId, 'engine', bearer(req), epoch, cursor));
    }
    if (action === 'claim_command') {
      const { commandSeq } = input(req);
      return respond(res, 200, await broker.claimCommand(sessionId, bearer(req), commandSeq));
    }
    if (action === 'stream_engine') return await stream(req, res, broker, sessionId,
      'engine', bearer(req), Number(req.query?.cursor || 0));
    const userId = await mainUser(req);
    if (action === 'inspect') return respond(res, 200, await broker.inspect(sessionId, userId));
    if (action === 'heartbeat_main') {
      const { epoch, cursor } = input(req);
      return respond(res, 200, await broker.heartbeat(sessionId, 'main', userId, epoch, cursor));
    }
    if (action === 'command') {
      const body = input(req), policy = controlPolicy(mode, action, body.type);
      messageType = body.type;
      if (!policy.allowed) throw new RelayError(policy.code, 503);
      return respond(res, 202, await broker.command(sessionId, userId, body), req, pair);
    }
    if (action === 'advance') {
      const { mode, searchId } = input(req);
      return respond(res, 200, await broker.advance(sessionId, userId, mode, searchId));
    }
    if (action === 'terminate') return respond(res, 200, await broker.terminate(sessionId, userId));
    if (action === 'stream_main') return await stream(req, res, broker, sessionId,
      'main', userId, Number(req.query?.cursor || 0));
    throw new RelayError('ENDPOINT_NOT_FOUND', 404);
  } catch (error) {
    errorCode = error instanceof RelayError ? error.code : 'INTERNAL_ERROR';
    if (res.headersSent) { res.end(); return; }
    return respond(res, error instanceof RelayError ? error.status : 500,
      { error: error instanceof RelayError ? error.code : 'INTERNAL_ERROR' });
  } finally {
    if (store && ioBefore) {
      try {
        let activeSessions = null;
        if (['health', 'create', 'terminate'].includes(action))
          activeSessions = await store.countLive();
        const ioAfter = store.stats();
        const dbReads = Math.max(0, ioAfter.reads - ioBefore.reads);
        const dbWrites = Math.max(0,
          (ioAfter.fullWrites + ioAfter.minimalWrites) -
          (ioBefore.fullWrites + ioBefore.minimalWrites));
        await store.recordMetrics(relayMetrics({ action, messageType, messageCode,
          status: Number(res.statusCode || 500), errorCode,
          latencyMs: Math.max(0, Date.now() - started), dbReads, dbWrites, activeSessions }));
      } catch (metricError) {
        console.error('EAE015A_METRICS_SINK_FAILED',
          String(metricError?.code || metricError?.name || 'ERROR'));
      }
    }
  }
}
