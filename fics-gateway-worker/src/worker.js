import { connect } from 'cloudflare:sockets';
import {
  createRateLimiter,
  isAllowedOrigin,
  isExpectedCloseError,
  parseAllowedOrigins,
  positiveInteger
} from './gateway-utils.js';

const SERVICE = 'caissa-fics-gateway';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function log(sessionId, event, details = '') {
  console.log(`[FICS Gateway] ${sessionId} ${event}${details ? `: ${details}` : ''}`);
}

function closeWebSocket(webSocket, code, reason) {
  try {
    if (webSocket.readyState === WebSocket.OPEN || webSocket.readyState === WebSocket.CONNECTING) {
      webSocket.close(code, reason.slice(0, 120));
    }
  } catch {
    // The peer may already be gone.
  }
}

async function createBridge(request, env, ctx) {
  const origin = request.headers.get('origin');
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return json({ ok: false, error: 'Origin not allowed' }, 403);
  }

  const host = env.FICS_HOST || 'freechess.org';
  const port = positiveInteger(env.FICS_PORT, 5000);
  const maxMessageLength = positiveInteger(env.MAX_MESSAGE_LENGTH, 4096);
  const maxSessionMs = positiveInteger(env.MAX_SESSION_SECONDS, 7200) * 1000;
  const idleTimeoutMs = positiveInteger(env.IDLE_TIMEOUT_SECONDS, 600) * 1000;
  const rateLimiter = createRateLimiter(positiveInteger(env.MAX_MESSAGES_PER_SECOND, 10));
  const sessionId = crypto.randomUUID().slice(0, 8);

  let tcpSocket;
  try {
    tcpSocket = connect({ hostname: host, port }, { secureTransport: 'off', allowHalfOpen: false });
    await tcpSocket.opened;
  } catch (error) {
    log(sessionId, 'TCP error', error.message);
    return json({ ok: false, error: 'Unable to connect to FICS' }, 502);
  }

  const [client, server] = Object.values(new WebSocketPair());
  server.accept();

  const writer = tcpSocket.writable.getWriter();
  const reader = tcpSocket.readable.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let closed = false;
  let cleanupPromise;
  let idleTimer;
  let writeChain = Promise.resolve();

  log(sessionId, 'connection opened', origin);
  log(sessionId, 'TCP connected', `${host}:${port}`);

  const cleanup = (code = 1000, reason = 'Session closed', closePeer = true) => {
    if (cleanupPromise) return cleanupPromise;

    cleanupPromise = (async () => {
      closed = true;
      clearTimeout(idleTimer);
      clearTimeout(maxSessionTimer);
      if (closePeer) closeWebSocket(server, code, reason);

      try {
        await writer.write(encoder.encode('quit\n'));
      } catch (error) {
        if (!isExpectedCloseError(error)) {
          log(sessionId, 'TCP cleanup warning', error.message);
        }
      }
      try {
        await writer.close();
      } catch (error) {
        if (!isExpectedCloseError(error)) {
          log(sessionId, 'TCP cleanup warning', error.message);
        }
      }
    })();

    return cleanupPromise;
  };

  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      server.send('Gateway error: session closed after idle timeout.');
      cleanup(1000, 'Idle timeout');
    }, idleTimeoutMs);
  };

  const maxSessionTimer = setTimeout(() => {
    server.send('Gateway error: maximum session duration reached.');
    cleanup(1000, 'Maximum session duration reached');
  }, maxSessionMs);

  server.addEventListener('message', (event) => {
    resetIdleTimer();
    if (typeof event.data !== 'string') {
      server.send('Gateway error: only text commands are supported.');
      return;
    }
    if (event.data.length > maxMessageLength) {
      server.send('Gateway error: message too long.');
      return;
    }
    if (!rateLimiter.allow()) {
      server.send('Gateway error: rate limit exceeded.');
      return;
    }

    writeChain = writeChain
      .then(() => writer.write(encoder.encode(`${event.data}\n`)))
      .catch((error) => {
        log(sessionId, 'TCP write error', error.message);
        server.send('Gateway error: FICS connection failed.');
        cleanup(1011, 'TCP write failed');
      });
  });

  server.addEventListener('close', (event) => {
    log(sessionId, 'WebSocket closed', `${event.code} ${event.reason || ''}`.trim());
    cleanup(event.code || 1000, event.reason || 'WebSocket closed', false);
  });

  server.addEventListener('error', (event) => {
    log(sessionId, 'WebSocket error', event.message || 'unknown error');
    cleanup(1011, 'WebSocket error');
  });

  const pumpTcpToWebSocket = async () => {
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        resetIdleTimer();
        const text = decoder.decode(value, { stream: true });
        if (text && server.readyState === WebSocket.OPEN) server.send(text);
      }
      const tail = decoder.decode();
      if (tail && server.readyState === WebSocket.OPEN) server.send(tail);
      log(sessionId, 'TCP closed');
      await cleanup(1000, 'FICS connection closed');
    } catch (error) {
      if (closed) {
        log(sessionId, 'TCP closed');
        return;
      }
      log(sessionId, 'TCP read error', error.message);
      if (server.readyState === WebSocket.OPEN) {
        server.send('Gateway error: FICS connection failed.');
      }
      await cleanup(1011, 'TCP read failed');
    }
  };

  resetIdleTimer();
  ctx.waitUntil(pumpTcpToWebSocket());

  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: SERVICE,
        target: `${env.FICS_HOST || 'freechess.org'}:${positiveInteger(env.FICS_PORT, 5000)}`
      });
    }

    if (request.method === 'GET' && url.pathname === '/ws') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return json({ ok: false, error: 'Expected WebSocket upgrade' }, 426);
      }
      return createBridge(request, env, ctx);
    }

    return json({ ok: false, error: 'Not found' }, 404);
  }
};
