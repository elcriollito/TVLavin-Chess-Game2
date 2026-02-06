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
    console.log(`[FICS Gateway] New client connected: ${clientId}`);

    // Rate limiting
    const rateLimiter = {
        messages: [],
        lastCleanup: Date.now()
    };

    // Connection state
    const state = {
        ws,
        ficsSocket: null,
        connected: false,
        authenticated: false,
        clientId,
        rateLimiter
    };

    connections.set(ws, state);

    // Handle WebSocket messages from browser
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleClientMessage(state, message);
        } catch (error) {
            console.error(`[FICS Gateway] ${clientId} - Invalid JSON:`, error.message);
            sendToClient(state, {
                type: 'error',
                message: 'Invalid message format'
            });
        }
    });

    // Handle WebSocket close
    ws.on('close', () => {
        console.log(`[FICS Gateway] ${clientId} - Client disconnected`);
        cleanupConnection(state);
    });

    // Handle WebSocket error
    ws.on('error', (error) => {
        console.error(`[FICS Gateway] ${clientId} - WebSocket error:`, error.message);
        cleanupConnection(state);
    });

    // Send initial status
    sendToClient(state, {
        type: 'status',
        connected: false,
        message: 'Ready to connect to FICS'
    });
});

function handleClientMessage(state, message) {
    const { type } = message;

    // Rate limiting check
    if (!checkRateLimit(state)) {
        sendToClient(state, {
            type: 'error',
            message: 'Rate limit exceeded. Please slow down.'
        });
        return;
    }

    switch (type) {
        case 'connectGuest':
            connectToFICS(state, message.handlePrefix || 'CAISSA');
            break;

        case 'command':
            if (!state.connected) {
                sendToClient(state, {
                    type: 'error',
                    message: 'Not connected to FICS'
                });
                return;
            }
            sendToFICS(state, message.text);
            break;

        case 'move':
            if (!state.connected) {
                sendToClient(state, {
                    type: 'error',
                    message: 'Not connected to FICS'
                });
                return;
            }
            // Convert UCI to FICS format if needed (FICS uses algebraic like e2e4)
            sendToFICS(state, message.text || message.uci);
            break;

        case 'disconnect':
            cleanupConnection(state);
            break;

        default:
            sendToClient(state, {
                type: 'error',
                message: `Unknown message type: ${type}`
            });
    }
}

function connectToFICS(state, handlePrefix) {
    if (state.connected) {
        sendToClient(state, {
            type: 'error',
            message: 'Already connected to FICS'
        });
        return;
    }

    console.log(`[FICS Gateway] ${state.clientId} - Connecting to FICS...`);

    const socket = new net.Socket();
    state.ficsSocket = socket;

    let buffer = '';
    let loginComplete = false;

    socket.connect(FICS_PORT, FICS_HOST, () => {
        console.log(`[FICS Gateway] ${state.clientId} - TCP connected to FICS`);
        state.connected = true;

        sendToClient(state, {
            type: 'status',
            connected: true,
            message: 'Connected to FICS, logging in as guest...'
        });
    });

    socket.on('data', (data) => {
        const text = data.toString('utf8');
        buffer += text;

        // Process complete lines
        let lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // Send raw line to client
            sendToClient(state, {
                type: 'raw',
                text: line
            });

            // Handle login prompts
            if (!loginComplete) {
                if (line.includes('login:') || line.includes('Press return')) {
                    // Send guest login
                    socket.write('guest\n');
                    console.log(`[FICS Gateway] ${state.clientId} - Sent guest login`);
                } else if (line.includes('Starting FICS session') || line.includes('fics%')) {
                    loginComplete = true;
                    state.authenticated = true;
                    console.log(`[FICS Gateway] ${state.clientId} - Guest login successful`);

                    sendToClient(state, {
                        type: 'authenticated',
                        message: 'Logged in as guest'
                    });

                    // Set some initial preferences
                    socket.write('set style 12\n'); // Use style 12 for board updates
                    socket.write('set interface CAISSA Chess\n');
                }
            }
        }
    });

    socket.on('error', (error) => {
        console.error(`[FICS Gateway] ${state.clientId} - FICS socket error:`, error.message);
        sendToClient(state, {
            type: 'error',
            message: `FICS connection error: ${error.message}`
        });
        cleanupConnection(state);
    });

    socket.on('close', () => {
        console.log(`[FICS Gateway] ${state.clientId} - FICS connection closed`);
        state.connected = false;
        sendToClient(state, {
            type: 'status',
            connected: false,
            message: 'Disconnected from FICS'
        });
    });

    socket.on('timeout', () => {
        console.log(`[FICS Gateway] ${state.clientId} - FICS connection timeout`);
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
        state.ws.send(JSON.stringify(message));
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

    state.connected = false;
    state.authenticated = false;

    connections.delete(state.ws);

    // Try to send final status
    try {
        sendToClient(state, {
            type: 'status',
            connected: false,
            message: 'Disconnected'
        });
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
