// EAE-011 preview-only dummy relay. No production Arena registration or engine runtime.
import { once } from 'node:events';
import { authenticateRequest } from './_lib/auth.js';
import { DurableBroker, RelayError } from '../experiments/lc0-preview-relay/durable-broker.mjs';
import { configuredStore } from '../experiments/lc0-preview-relay/store.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const allowedActions = Object.freeze({
  create: ['main', 'POST'], inspect: ['main', 'GET'], command: ['main', 'POST'],
  advance: ['main', 'POST'], terminate: ['main', 'POST'], stream_main: ['main', 'GET'],
  heartbeat_main: ['main', 'POST'],
  claim: ['engine', 'POST'], message: ['engine', 'POST'], stream_engine: ['engine', 'GET'],
  engine_state: ['engine', 'GET'], heartbeat_engine: ['engine', 'POST'],
  claim_command: ['engine', 'POST'],
  config: ['main', 'GET'], health: ['either', 'GET']
});

function origins(env) {
  const main = new URL(env.EAE011_MAIN_ORIGIN || 'https://invalid.local');
  const engine = new URL(env.EAE011_ENGINE_ORIGIN || 'https://invalid.local');
  if (main.protocol !== 'https:' || engine.protocol !== 'https:' || main.origin === engine.origin ||
      !main.hostname.endsWith('.vercel.app') || !engine.hostname.endsWith('.vercel.app') ||
      main.pathname !== '/' || engine.pathname !== '/') throw new RelayError('PREVIEW_ORIGINS_REQUIRED', 503);
  return { main: main.origin, engine: engine.origin };
}

function checkRequest(req, role, pair, method) {
  const host = String(req.headers.host || '').toLowerCase();
  const expected = role === 'main' ? pair.main : pair.engine;
  if (role === 'either') {
    if (![new URL(pair.main).host, new URL(pair.engine).host].includes(host))
      throw new RelayError('HOST_REJECTED', 403);
  } else if (host !== new URL(expected).host) throw new RelayError('HOST_REJECTED', 403);
  if (req.headers.origin && req.headers.origin !== (role === 'either' ? `https://${host}` : expected))
    throw new RelayError('ORIGIN_REJECTED', 403);
  if (method === 'POST' && req.headers.origin !== expected) throw new RelayError('ORIGIN_REQUIRED', 403);
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new RelayError('CROSS_SITE_REJECTED', 403);
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

function respond(res, status, value) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(value);
}

async function stream(req, res, broker, sessionId, role, authority, cursor) {
  const connection = await broker.connect(sessionId, role, authority, cursor);
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res.write(`event: lease\ndata: ${JSON.stringify({ epoch: connection.epoch })}\n\n`);
  let closed = false;
  res.on('close', () => { closed = true; });
  let currentCursor = cursor;
  try {
    while (!closed) {
      const next = await broker.poll(sessionId, role, authority, connection.epoch, currentCursor);
      for (const item of next.events) {
        if (!res.write(`id: ${item.id}\ndata: ${JSON.stringify(item.value)}\n\n`))
          await Promise.race([once(res, 'drain'), once(res, 'close')]);
        if (closed) break;
      }
      currentCursor = next.cursor;
      if (next.phase === 'CLEANED' && role === 'main') break;
      await pause(250);
    }
  } catch (error) {
    if (!closed) res.write(`data: ${JSON.stringify({ type: 'ERROR', code: error instanceof RelayError ? error.code : 'STREAM_ERROR' })}\n\n`);
  } finally {
    await broker.close(sessionId, role, authority, connection.epoch);
    if (!res.writableEnded) res.end();
  }
}

export default async function handler(req, res) {
  try {
    if (process.env.VERCEL_ENV !== 'preview') throw new RelayError('PREVIEW_ONLY', 503);
    const pair = origins(process.env);
    const action = String(req.query?.action || '');
    const policy = allowedActions[action];
    if (!policy || req.method !== policy[1]) throw new RelayError('ENDPOINT_NOT_FOUND', 404);
    checkRequest(req, policy[0], pair, req.method);
    const broker = new DurableBroker(configuredStore());
    const sessionId = String(req.query?.sessionId || '');
    if (action === 'health') return respond(res, 200, { ok: true, previewOnly: true });
    if (action === 'config') return respond(res, 200, { mainOrigin: pair.main, engineOrigin: pair.engine });
    if (action === 'create') {
      const userId = await mainUser(req);
      const { competitionId, participantRole } = input(req);
      return respond(res, 201, await broker.create({ userId, competitionId, participantRole }));
    }
    if (action === 'claim') {
      const { sessionId: id, claimToken } = input(req);
      return respond(res, 200, await broker.claim(id, claimToken));
    }
    if (action === 'message') return respond(res, 202,
      await broker.engineMessage(sessionId, bearer(req), input(req)));
    if (action === 'engine_state') return respond(res, 200,
      await broker.inspectEngine(sessionId, bearer(req)));
    if (action === 'heartbeat_engine') {
      const { epoch } = input(req);
      return respond(res, 200, await broker.heartbeat(sessionId, 'engine', bearer(req), epoch));
    }
    if (action === 'claim_command') {
      const { commandSeq } = input(req);
      return respond(res, 200, await broker.claimCommand(sessionId, bearer(req), commandSeq));
    }
    if (action === 'stream_engine') return stream(req, res, broker, sessionId,
      'engine', bearer(req), Number(req.query?.cursor || 0));
    const userId = await mainUser(req);
    if (action === 'inspect') return respond(res, 200, await broker.inspect(sessionId, userId));
    if (action === 'heartbeat_main') {
      const { epoch } = input(req);
      return respond(res, 200, await broker.heartbeat(sessionId, 'main', userId, epoch));
    }
    if (action === 'command') return respond(res, 202,
      await broker.command(sessionId, userId, input(req)));
    if (action === 'advance') {
      const { mode, searchId } = input(req);
      return respond(res, 200, await broker.advance(sessionId, userId, mode, searchId));
    }
    if (action === 'terminate') return respond(res, 200, await broker.terminate(sessionId, userId));
    if (action === 'stream_main') return stream(req, res, broker, sessionId,
      'main', userId, Number(req.query?.cursor || 0));
    throw new RelayError('ENDPOINT_NOT_FOUND', 404);
  } catch (error) {
    if (res.headersSent) { res.end(); return; }
    return respond(res, error instanceof RelayError ? error.status : 500,
      { error: error instanceof RelayError ? error.code : 'INTERNAL_ERROR' });
  }
}
