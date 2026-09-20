/**
 * FICS Gateway Server
 *
 * WebSocket <-> TCP bridge to connect CAISSA Chess browser client to FICS
 * Handles guest login and message routing
 */

const WebSocket = require('ws');
const net = require('net');

const FICS_HOST = 'freechess.org';
const FICS_PORT = 5000;
const WS_PORT = process.env.FICS_GATEWAY_PORT || 8081;
const MAX_MESSAGES_PER_SECOND = 10;

console.log('[FICS Gateway] Starting...');

// Create WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });

console.log(`[FICS Gateway] WebSocket server listening on port ${WS_PORT}`);

// Track active connections
const connections = new Map();

wss.on('connection', (ws, req) => {
    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    const timestamp = new Date().toISOString();
    console.log(`[FICS Gateway] ${timestamp} - ✅ WS client connected: ${clientId}`);
    console.log(`[FICS Gateway] Active connections: ${connections.size + 1}`);

    // Rate limiting
    const rateLimiter = {
        messages: [],
        lastCleanup: Date.now()
    };

    // Connection state
    const state = {
        ws,
        ficsSocket: null,
        connecting: false,
        connected: false,
        authenticated: false,
        clientId,
        rateLimiter,
        connectedAt: timestamp
    };

    connections.set(ws, state);

    // Handle WebSocket messages from browser
    ws.on('message', (data) => {
        if (!checkRateLimit(state)) {
            sendToClient(state, 'Gateway error: rate limit exceeded.');
            return;
        }

        const command = data.toString('utf8');
        if (!state.connected) {
            sendToClient(state, 'Gateway error: not connected to FICS.');
            return;
        }
        sendToFICS(state, command);
    });

    // Handle WebSocket close
    ws.on('close', (code, reason) => {
        console.log(`[FICS Gateway] ${clientId} - 🔌 WS client disconnected (code: ${code}, reason: ${reason || 'none'})`);
        console.log(`[FICS Gateway] Connection duration: ${Date.now() - new Date(state.connectedAt).getTime()}ms`);
        cleanupConnection(state);
    });

    // Handle WebSocket error
    ws.on('error', (error) => {
        console.error(`[FICS Gateway] ${clientId} - ❌ WebSocket error:`, error.message);
        console.error(`[FICS Gateway] Error code: ${error.code}, errno: ${error.errno}`);
        cleanupConnection(state);
    });

    // Match the production gateway contract: the WebSocket is a transparent
    // text bridge and the FICS TCP session starts immediately.
    connectToFICS(state);
});
function connectToFICS(state) {
    if (state.connected || state.connecting) {
        console.log(`[FICS Gateway] ${state.clientId} - Already connected to FICS`);
        return;
    }

    console.log(`[FICS Gateway] ${state.clientId} - 🔌 Initiating TCP connection to FICS (${FICS_HOST}:${FICS_PORT})...`);

    const socket = new net.Socket();
    state.ficsSocket = socket;
    state.connecting = true;

    socket.connect(FICS_PORT, FICS_HOST, () => {
        console.log(`[FICS Gateway] ${state.clientId} - ✅ TCP connected to FICS successfully`);
        state.connecting = false;
        state.connected = true;
    });

    socket.on('data', (data) => {
        const text = data.toString('utf8');
        sendToClient(state, text);
    });

    socket.on('error', (error) => {
        console.error(`[FICS Gateway] ${state.clientId} - ❌ FICS TCP socket error:`, error.message);
        console.error(`[FICS Gateway] Error code: ${error.code}, errno: ${error.errno}`);
        console.error(`[FICS Gateway] Possible causes:`);
        console.error(`  - FICS server (${FICS_HOST}:${FICS_PORT}) unreachable`);
        console.error(`  - Network/firewall blocking outbound TCP to FICS`);
        console.error(`  - DNS resolution failed for ${FICS_HOST}`);

        sendToClient(state, `Gateway error: unable to connect to FICS (${error.message}).`);
        cleanupConnection(state);
    });

    socket.on('close', () => {
        console.log(`[FICS Gateway] ${state.clientId} - 🔌 FICS TCP connection closed`);
        state.connecting = false;
        state.connected = false;
    });

    socket.on('timeout', () => {
        console.log(`[FICS Gateway] ${state.clientId} - ⏱️  FICS connection timeout (${socket.timeout}ms)`);
        socket.destroy();
    });

    socket.setTimeout(300000); // 5 minute timeout
}

function sendToFICS(state, text) {
    if (!state.ficsSocket || !state.connected) {
        console.warn(`[FICS Gateway] ${state.clientId} - Attempt to send without connection`);
        return;
    }

    console.log(`[FICS Gateway] ${state.clientId} - Send to FICS: ${text}`);
    state.ficsSocket.write(text + '\n');
}

function sendToClient(state, message) {
    if (state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(String(message));
    }
}

function checkRateLimit(state) {
    const now = Date.now();
    const { rateLimiter } = state;

    // Cleanup old messages (older than 1 second)
    if (now - rateLimiter.lastCleanup > 1000) {
        rateLimiter.messages = rateLimiter.messages.filter(t => now - t < 1000);
        rateLimiter.lastCleanup = now;
    }

    // Check if under limit
    if (rateLimiter.messages.length >= MAX_MESSAGES_PER_SECOND) {
        return false;
    }

    rateLimiter.messages.push(now);
    return true;
}

function cleanupConnection(state) {
    console.log(`[FICS Gateway] ${state.clientId} - Cleaning up connection`);

    if (state.ficsSocket) {
        state.ficsSocket.destroy();
        state.ficsSocket = null;
    }

    state.connecting = false;
    state.connected = false;
    state.authenticated = false;

    connections.delete(state.ws);

    // Try to send final status
    try {
        sendToClient(state, 'Gateway status: disconnected.');
    } catch (e) {
        // Ignore if WebSocket already closed
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[FICS Gateway] Shutting down...');

    // Disconnect all clients
    for (const [ws, state] of connections) {
        cleanupConnection(state);
    }

    wss.close(() => {
        console.log('[FICS Gateway] WebSocket server closed');
        process.exit(0);
    });
});

console.log('[FICS Gateway] Ready! Connect via ws://localhost:' + WS_PORT);
console.log('[FICS Gateway] Press Ctrl+C to stop');
