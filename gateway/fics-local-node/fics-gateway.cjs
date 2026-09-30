/**
 * Local FICS WebSocket <-> TCP bridge.
 *
 * This intentionally mirrors the production Worker wire contract:
 * - every FICS TCP chunk is forwarded to the browser as text, unchanged;
 * - every browser text frame is written to FICS with one trailing newline;
 * - authentication remains owned by the browser client state machine.
 */

const WebSocket = require('ws');
const net = require('net');
const { StringDecoder } = require('string_decoder');

const FICS_HOST = process.env.FICS_HOST || 'freechess.org';
const FICS_PORT = positiveInteger(process.env.FICS_PORT, 5000);
const WS_PORT = positiveInteger(process.env.FICS_GATEWAY_PORT, 8081);
const WS_HOST = process.env.FICS_GATEWAY_HOST || '127.0.0.1';
const MAX_MESSAGES_PER_SECOND = positiveInteger(process.env.MAX_MESSAGES_PER_SECOND, 10);
const MAX_MESSAGE_LENGTH = positiveInteger(process.env.MAX_MESSAGE_LENGTH, 4096);
const TRACE_HANDSHAKE = process.env.FICS_GATEWAY_TRACE === '1';

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function timestamp() {
    return new Date().toISOString();
}

console.log('[FICS Gateway] Starting...');

const wss = new WebSocket.Server({ host: WS_HOST, port: WS_PORT, path: '/ws' });
const connections = new Map();

wss.on('listening', () => {
    console.log(`[FICS Gateway] WebSocket server listening on ws://${WS_HOST}:${WS_PORT}/ws`);
});

wss.on('connection', (ws, req) => {
    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    const decoder = new StringDecoder('utf8');
    const tcp = new net.Socket();
    const state = {
        ws,
        tcp,
        clientId,
        connectedAt: Date.now(),
        closed: false,
        rateLimiter: { messages: [], lastCleanup: Date.now() }
    };
    connections.set(ws, state);

    console.log(`[FICS Gateway] ${timestamp()} - WS client connected: ${clientId}`);
    console.log(`[FICS Gateway] Active connections: ${connections.size}`);

    // Attach every TCP listener before connect() so the first banner chunk cannot
    // arrive before the bridge is ready to forward it.
    tcp.on('data', (data) => {
        const text = decoder.write(data);
        if (TRACE_HANDSHAKE) {
            console.log(`[FICS Gateway] ${clientId} - TCP chunk (${data.length} bytes): ${JSON.stringify(text)}`);
        }
        if (text && ws.readyState === WebSocket.OPEN) {
            ws.send(text);
            if (TRACE_HANDSHAKE) {
                console.log(`[FICS Gateway] ${clientId} - Forwarded TCP chunk to browser (${text.length} chars)`);
            }
        }
    });

    tcp.on('error', (error) => {
        console.error(`[FICS Gateway] ${clientId} - FICS TCP error: ${error.message}`);
        if (ws.readyState === WebSocket.OPEN) ws.send('Gateway error: FICS connection failed.');
        cleanupConnection(state, 1011, 'FICS TCP error');
    });

    tcp.on('close', () => {
        const tail = decoder.end();
        if (tail && ws.readyState === WebSocket.OPEN) ws.send(tail);
        console.log(`[FICS Gateway] ${clientId} - FICS TCP connection closed`);
        cleanupConnection(state, 1000, 'FICS connection closed');
    });

    ws.on('message', (data, isBinary) => {
        if (isBinary) {
            ws.send('Gateway error: only text commands are supported.');
            return;
        }
        const command = data.toString('utf8');
        if (command.length > MAX_MESSAGE_LENGTH) {
            ws.send('Gateway error: message too long.');
            return;
        }
        if (!checkRateLimit(state)) {
            ws.send('Gateway error: rate limit exceeded.');
            return;
        }
        if (!tcp.writable) {
            ws.send('Gateway error: FICS connection is not ready.');
            return;
        }
        console.log(`[FICS Gateway] ${clientId} - Browser command: ${JSON.stringify(command)}`);
        tcp.write(`${command}\n`);
    });

    ws.on('close', (code, reason) => {
        console.log(`[FICS Gateway] ${clientId} - WS client disconnected (${code} ${reason || ''})`);
        cleanupConnection(state, code || 1000, reason?.toString() || 'WebSocket closed', false);
    });

    ws.on('error', (error) => {
        console.error(`[FICS Gateway] ${clientId} - WebSocket error: ${error.message}`);
        cleanupConnection(state, 1011, 'WebSocket error');
    });

    tcp.connect(FICS_PORT, FICS_HOST, () => {
        console.log(`[FICS Gateway] ${clientId} - TCP connected to FICS (${FICS_HOST}:${FICS_PORT})`);
    });
});

function checkRateLimit(state) {
    const now = Date.now();
    const limiter = state.rateLimiter;
    if (now - limiter.lastCleanup > 1000) {
        limiter.messages = limiter.messages.filter((seenAt) => now - seenAt < 1000);
        limiter.lastCleanup = now;
    }
    if (limiter.messages.length >= MAX_MESSAGES_PER_SECOND) return false;
    limiter.messages.push(now);
    return true;
}

function cleanupConnection(state, code = 1000, reason = 'Session closed', closePeer = true) {
    if (state.closed) return;
    state.closed = true;
    connections.delete(state.ws);
    if (!state.tcp.destroyed) state.tcp.destroy();
    if (closePeer && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
        state.ws.close(code, String(reason).slice(0, 120));
    }
    console.log(`[FICS Gateway] ${state.clientId} - Session cleaned up after ${Date.now() - state.connectedAt}ms`);
}

function shutdown() {
    console.log('[FICS Gateway] Shutting down...');
    for (const state of connections.values()) cleanupConnection(state, 1001, 'Gateway shutdown');
    wss.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[FICS Gateway] Ready! Connect via ws://${WS_HOST}:${WS_PORT}/ws`);
