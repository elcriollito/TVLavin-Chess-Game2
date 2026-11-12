import { WebSocket, WebSocketServer } from 'ws';

export const MOBILE_HQA_FICS_RELAY_PATH = '/__caissa_hqa/fics';
export const CANONICAL_FICS_GATEWAY_URL = 'wss://fics-gateway.caissa-chess.org/ws';
export const CANONICAL_FICS_ORIGIN = 'https://www.caissa-chess.org';

const MAX_MESSAGE_LENGTH = 4096;
const UPSTREAM_HANDSHAKE_TIMEOUT_MS = 7000;

function rejectUpgrade(socket, statusCode, statusText) {
  if (!socket.destroyed) {
    socket.write(
      `HTTP/1.1 ${statusCode} ${statusText}\r\n`
      + 'Connection: close\r\n'
      + 'Content-Type: text/plain; charset=utf-8\r\n'
      + 'Cache-Control: no-store\r\n'
      + '\r\n'
      + `${statusText}\n`
    );
  }
  socket.destroy();
}

function normalizeRemoteAddress(value = '') {
  const address = String(value).split('%')[0];
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

export function isPrivateHqaClientAddress(value = '') {
  const address = normalizeRemoteAddress(value);
  if (address === '::1') return true;
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  return octets[0] === 127
    || octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function isSameOriginHqaUpgrade(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol)
      && !parsed.username
      && !parsed.password
      && parsed.host === host;
  } catch {
    return false;
  }
}

function closeSocket(socket, code, reason) {
  if (!socket || ![WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState)) return;
  try {
    socket.close(code, String(reason).slice(0, 120));
  } catch {
    socket.terminate?.();
  }
}

export function attachMobileHqaFicsRelay(server, options = {}) {
  const enabled = options.enabled === true;
  if (!enabled) return Object.freeze({ enabled: false, path: MOBILE_HQA_FICS_RELAY_PATH });

  const upstreamUrl = options.upstreamUrl || CANONICAL_FICS_GATEWAY_URL;
  const upstreamOrigin = options.upstreamOrigin || CANONICAL_FICS_ORIGIN;
  const websocketServer = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: MAX_MESSAGE_LENGTH
  });

  websocketServer.on('connection', (client) => {
    let settled = false;
    const upstream = new WebSocket(upstreamUrl, {
      origin: upstreamOrigin,
      handshakeTimeout: UPSTREAM_HANDSHAKE_TIMEOUT_MS,
      perMessageDeflate: false,
      maxPayload: MAX_MESSAGE_LENGTH
    });

    const settle = (source, code = 1000, reason = 'Session closed') => {
      if (settled) return;
      settled = true;
      if (source !== client) closeSocket(client, code, reason);
      if (source !== upstream) closeSocket(upstream, code, reason);
    };

    client.on('message', (data, isBinary) => {
      if (isBinary) {
        settle(client, 1003, 'Text messages only');
        return;
      }
      if (upstream.readyState !== WebSocket.OPEN) {
        settle(client, 1013, 'Gateway not ready');
        return;
      }
      upstream.send(data.toString('utf8'));
    });

    upstream.on('message', (data, isBinary) => {
      if (isBinary || client.readyState !== WebSocket.OPEN) return;
      client.send(data.toString('utf8'));
    });

    client.on('close', (code, reason) => settle(client, code || 1000, reason.toString() || 'Client closed'));
    upstream.on('close', (code, reason) => settle(upstream, code || 1000, reason.toString() || 'Gateway closed'));
    client.on('error', () => settle(client, 1011, 'Client transport error'));
    upstream.on('error', () => settle(upstream, 1011, 'Gateway unavailable'));
  });

  server.on('upgrade', (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    if (pathname !== MOBILE_HQA_FICS_RELAY_PATH) {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (request.method !== 'GET'
      || !isPrivateHqaClientAddress(request.socket.remoteAddress)
      || !isSameOriginHqaUpgrade(request)) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request);
    });
  });

  return Object.freeze({ enabled: true, path: MOBILE_HQA_FICS_RELAY_PATH, websocketServer });
}

export function injectMobileHqaFicsRelayMarker(html, enabled) {
  if (!enabled || typeof html !== 'string' || html.includes('name="caissa-fics-hqa-relay"')) return html;
  return html.replace(
    /(<meta\s+charset=[^>]+>)/i,
    `$1\n    <meta name="caissa-fics-hqa-relay" content="${MOBILE_HQA_FICS_RELAY_PATH}">`
  );
}
