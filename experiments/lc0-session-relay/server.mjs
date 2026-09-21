import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SessionBroker, RelayError } from './broker.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const host = '127.0.0.1';
const mainPort = Number(process.env.EAE010_MAIN_PORT || 8791);
const isolatedPort = Number(process.env.EAE010_ISOLATED_PORT || 8792);
const mainOrigin = `http://${host}:${mainPort}`;
const isolatedOrigin = `http://${host}:${isolatedPort}`;
const broker = new SessionBroker();
const sweepTimer = setInterval(() => broker.sweep(), 100);
sweepTimer.unref();

const pages = {
  main: { '/': ['main.html', 'text/html; charset=utf-8'],
    '/main.js': ['main.js', 'text/javascript; charset=utf-8'] },
  engine: { '/': ['engine.html', 'text/html; charset=utf-8'],
    '/engine.js': ['engine.js', 'text/javascript; charset=utf-8'] }
};

function headers(kind) {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': kind === 'engine' ? 'same-origin' : 'same-origin-allow-popups',
    ...(kind === 'engine' ? { 'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin' } : {}),
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
  };
}

function respond(res, kind, status, value) {
  res.writeHead(status, { ...headers(kind), 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > 4_096) throw new RelayError('REQUEST_TOO_LARGE', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RelayError('JSON_INVALID'); }
}

function credential(req) {
  const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(req.headers.authorization || '');
  if (!match) throw new RelayError('BEARER_REQUIRED', 401);
  return match[1];
}

function requireOrigin(req, expected, mandatory) {
  if (req.headers.origin !== expected && (mandatory || req.headers.origin))
    throw new RelayError('ORIGIN_REJECTED', 403);
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new RelayError('CROSS_SITE_REJECTED', 403);
}

function makeHandler(kind) {
  const expectedOrigin = kind === 'main' ? mainOrigin : isolatedOrigin;
  const role = kind === 'main' ? 'arena' : 'engine';
  return async (req, res) => {
    try {
      if (req.headers.host !== new URL(expectedOrigin).host) throw new RelayError('HOST_REJECTED', 403);
      const url = new URL(req.url, expectedOrigin);
      if (req.method === 'OPTIONS') throw new RelayError('PREFLIGHT_REJECTED', 403);
      if (req.method === 'GET' && pages[kind][url.pathname]) {
        const [name, contentType] = pages[kind][url.pathname];
        res.writeHead(200, { ...headers(kind), 'Content-Type': contentType });
        res.end(await readFile(path.join(root, name)));
        return;
      }
      if (url.pathname === '/health' && req.method === 'GET') {
        respond(res, kind, 200, { ok: true, origin: expectedOrigin, activeSessions: broker.activeCount() });
        return;
      }
      if (url.pathname === '/api/metrics' && req.method === 'GET' && kind === 'main') {
        requireOrigin(req, expectedOrigin, false);
        respond(res, kind, 200, { activeSessions: broker.activeCount(), ...broker.metrics });
        return;
      }
      if (req.method === 'POST') requireOrigin(req, expectedOrigin, true);
      if (url.pathname === '/api/session' && req.method === 'POST' && kind === 'main') {
        const input = await body(req);
        if (input.userId !== req.headers['x-test-user']) throw new RelayError('TEST_IDENTITY_MISMATCH', 401);
        respond(res, kind, 201, broker.create(input));
        return;
      }
      if (url.pathname === '/api/claim' && req.method === 'POST' && kind === 'engine') {
        respond(res, kind, 200, broker.claim(await body(req)));
        return;
      }
      const match = /^\/api\/session\/([A-Za-z0-9_-]{20,128})\/(stream|command|message|advance|terminate)$/.exec(url.pathname);
      if (!match) throw new RelayError('ENDPOINT_NOT_FOUND', 404);
      const [, sessionId, action] = match;
      if (action === 'stream' && req.method === 'GET') {
        requireOrigin(req, expectedOrigin, false);
        const secret = credential(req);
        broker.auth(sessionId, role, secret);
        res.writeHead(200, { ...headers(kind), 'Content-Type': 'text/event-stream; charset=utf-8',
          Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        broker.connect(sessionId, role, secret, res);
        return;
      }
      if (req.method !== 'POST') throw new RelayError('METHOD_NOT_ALLOWED', 405);
      const secret = credential(req);
      if (action === 'command' && kind === 'main') return respond(res, kind, 202,
        broker.command(sessionId, secret, await body(req)));
      if (action === 'message' && kind === 'engine') return respond(res, kind, 202,
        broker.engineMessage(sessionId, secret, await body(req)));
      if (action === 'advance' && kind === 'main') return respond(res, kind, 200,
        broker.advance(sessionId, secret));
      if (action === 'terminate' && kind === 'main') return respond(res, kind, 200,
        broker.terminate(sessionId, secret));
      throw new RelayError('ROLE_ENDPOINT_REJECTED', 403);
    } catch (error) {
      if (!res.headersSent) respond(res, kind, error.status || 500,
        { error: error instanceof RelayError ? error.code : 'INTERNAL_ERROR' });
      else res.end();
    }
  };
}

const mainServer = http.createServer(makeHandler('main'));
const engineServer = http.createServer(makeHandler('engine'));
mainServer.listen(mainPort, host, () => console.log(`EAE010_MAIN_READY ${mainOrigin}`));
engineServer.listen(isolatedPort, host, () => console.log(`EAE010_ISOLATED_READY ${isolatedOrigin}`));

function shutdown() {
  broker.interrupt();
  mainServer.close();
  engineServer.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
