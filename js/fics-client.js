/**
 * CAISSA FICS Client
 *
 * Frontend module to connect to FICS via WebSocket gateway
 * Handles game state, board updates, and commands
 */

console.log('[FICS Client] Module loaded');

const CaissaFICSClient = {
    // WebSocket connection
    ws: null,
    connected: false,
    authenticated: false,
    connectionState: 'disconnected',
    rawBuffer: '',
    guestLoginSent: false,
    guestReturnSent: false,
    connectionStartedAt: 0,
    latencyMs: null,
    manualDisconnect: false,
    reconnectAttempts: 0,
    reconnectTimer: null,

    // Game state
    chess: null, // chess.js instance
    board: null, // chessboard.js instance
    gameActive: false,
    myColor: null,
    gameNumber: null,
    opponent: null,

    // UI elements
    elements: {},

    // Message buffer for console
    messageBuffer: [],
    maxBufferSize: 500,

    // Local development may use ws://. Production requires an explicitly
    // configured secure endpoint via window.CAISSA_FICS_GATEWAY_URL.
    gatewayUrl: null,
    gatewayMode: 'unconfigured',

    // ===== INITIALIZATION =====
    init() {
        console.log('[FICS Client] Initializing...');
        this.cacheElements();
        this.configureGateway();
        this.bindEvents();
        this.initChessEngine();
        this.setConnectionState('disconnected');
        this.updateGatewayStatus();
    },

    cacheElements() {
        this.elements = {
            // Connection
            connectBtn: document.getElementById('ficsConnectBtn'),
            disconnectBtn: document.getElementById('ficsDisconnectBtn'),
            testGatewayBtn: document.getElementById('ficsTestGatewayBtn'),
            connectionStatus: document.getElementById('ficsConnectionStatus'),
            gatewayStatus: document.getElementById('ficsGatewayStatus'),
            gatewayUrl: document.getElementById('ficsGatewayUrl'),
            gatewayLatency: document.getElementById('ficsGatewayLatency'),

            // Seek buttons
            seekBlitz1: document.getElementById('ficsSeek1_0'),
            seekBlitz3: document.getElementById('ficsSeek3_0'),
            seekBlitz5: document.getElementById('ficsSeek5_0'),
            seekRapid10: document.getElementById('ficsSeek10_0'),
            customSeekBtn: document.getElementById('ficsCustomSeekBtn'),
            customTimeInput: document.getElementById('ficsCustomTime'),
            customIncInput: document.getElementById('ficsCustomInc'),

            // Game info
            gameStatus: document.getElementById('ficsGameStatus'),
            opponentInfo: document.getElementById('ficsOpponentInfo'),
            gameControls: document.getElementById('ficsGameControls'),
            resignBtn: document.getElementById('ficsResignBtn'),
            drawBtn: document.getElementById('ficsDrawBtn'),
            abortBtn: document.getElementById('ficsAbortBtn'),

            // Board
            boardContainer: document.getElementById('ficsBoardContainer'),

            // Console
            console: document.getElementById('ficsConsole'),
            consoleToggle: document.getElementById('ficsConsoleToggle'),
            consoleContainer: document.getElementById('ficsConsoleContainer'),
            commandInput: document.getElementById('ficsCommandInput'),
            sendCommandBtn: document.getElementById('ficsSendCommandBtn')
        };
    },

    configureGateway() {
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const configuredUrl = typeof window.CAISSA_FICS_GATEWAY_URL === 'string'
            ? window.CAISSA_FICS_GATEWAY_URL.trim()
            : '';

        if (isLocal) {
            this.gatewayUrl = configuredUrl || 'ws://localhost:8081';
            this.gatewayMode = this.gatewayUrl.startsWith('wss://') ? 'local wss' : 'local ws';
        } else {
            this.gatewayUrl = configuredUrl.startsWith('wss://')
                ? configuredUrl
                : 'wss://fics-gateway.caissa-chess.org/ws';
            this.gatewayMode = 'production wss';
        }
    },

    isGatewayConfigured() {
        return !!this.gatewayUrl
            && (window.location.protocol !== 'https:' || this.gatewayUrl.startsWith('wss://'));
    },

    updateGatewayStatus() {
        const configured = this.isGatewayConfigured();
        const message = configured
            ? `Gateway ready (${this.gatewayMode})`
            : 'FICS gateway requires a secure WSS endpoint in production.';

        if (this.elements.gatewayStatus) {
            this.elements.gatewayStatus.textContent = message;
            this.elements.gatewayStatus.className = configured
                ? 'fics-gateway-status fics-gateway-ready'
                : 'fics-gateway-status fics-gateway-unconfigured';
        }
        if (this.elements.gatewayUrl) {
            this.elements.gatewayUrl.textContent = this.gatewayUrl || 'Not configured';
        }
        this.updateLatency();
        if (!configured) {
            this.elements.connectBtn?.setAttribute('disabled', 'true');
            this.elements.testGatewayBtn?.setAttribute('disabled', 'true');
            this.updateGameStatus(message, 'error');
        }
    },

    bindEvents() {
        // Connection
        this.elements.connectBtn?.addEventListener('click', () => this.connect());
        this.elements.disconnectBtn?.addEventListener('click', () => this.disconnect());
        this.elements.testGatewayBtn?.addEventListener('click', () => this.testGateway());

        // Seek buttons
        this.elements.seekBlitz1?.addEventListener('click', () => this.seek(1, 0));
        this.elements.seekBlitz3?.addEventListener('click', () => this.seek(3, 0));
        this.elements.seekBlitz5?.addEventListener('click', () => this.seek(5, 0));
        this.elements.seekRapid10?.addEventListener('click', () => this.seek(10, 0));
        this.elements.customSeekBtn?.addEventListener('click', () => {
            const time = parseInt(this.elements.customTimeInput.value) || 5;
            const inc = parseInt(this.elements.customIncInput.value) || 0;
            this.seek(time, inc);
        });

        // Game controls
        this.elements.resignBtn?.addEventListener('click', () => this.resign());
        this.elements.drawBtn?.addEventListener('click', () => this.offerDraw());
        this.elements.abortBtn?.addEventListener('click', () => this.abort());

        // Console
        this.elements.consoleToggle?.addEventListener('click', () => this.toggleConsole());
        this.elements.sendCommandBtn?.addEventListener('click', () => this.sendCommand());
        this.elements.commandInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendCommand();
            }
        });
    },

    initChessEngine() {
        // Initialize chess.js for move validation
        if (typeof Chess !== 'undefined') {
            this.chess = new Chess();
            console.log('[FICS Client] Chess.js initialized');
        } else {
            console.error('[FICS Client] Chess.js not found!');
        }
    },

    // ===== CONNECTION MANAGEMENT =====
    connect() {
        if (this.ws && this.connected) {
            this.logToConsole('Already connected to FICS');
            return;
        }

        if (!this.isGatewayConfigured()) {
            const errorMsg = 'FICS gateway requires a secure WSS endpoint in production.';
            this.logToConsole(errorMsg);
            this.updateGameStatus(errorMsg, 'error');
            this.updateConnectionStatus(false, 'Gateway not configured');
            this.updateGatewayStatus();
            return;
        }

        this.logToConsole('Connecting to FICS gateway...');
        this.manualDisconnect = false;
        clearTimeout(this.reconnectTimer);
        this.setConnectionState('connecting');
        this.updateGameStatus('Connecting to gateway...', '');
        this.rawBuffer = '';
        this.guestLoginSent = false;
        this.guestReturnSent = false;
        this.connectionStartedAt = performance.now();

        try {
            this.ws = new WebSocket(this.gatewayUrl);

            // Set timeout for connection attempt
            const connectionTimeout = setTimeout(() => {
                if (!this.connected) {
                    this.logToConsole('❌ Connection timeout');
                    this.handleConnectionFailure('timeout');
                    if (this.ws) {
                        this.ws.close();
                    }
                }
            }, 5000);

            this.ws.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('[FICS Client] WebSocket connected');
                this.connected = true;
                this.latencyMs = Math.round(performance.now() - this.connectionStartedAt);
                this.updateLatency();
                this.logToConsole('✅ Connected to gateway, authenticating...');
                this.updateGameStatus('Authenticating...', '');

            };

            this.ws.onmessage = (event) => {
                this.handleRawGatewayData(String(event.data));
            };

            this.ws.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.error('[FICS Client] WebSocket error:', error);
                this.logToConsole('❌ Connection error');
                this.handleConnectionFailure('error');
            };

            this.ws.onclose = (event) => {
                clearTimeout(connectionTimeout);
                console.log('[FICS Client] WebSocket closed', event.code, event.reason);
                const shouldReconnect = !this.manualDisconnect
                    && event.code !== 1000
                    && this.reconnectAttempts < 3;

                if (this.connected && !shouldReconnect) {
                    // Was connected, now disconnected
                    this.logToConsole('Disconnected from FICS');
                    this.updateGameStatus('Disconnected', '');
                } else if (!shouldReconnect && !this.manualDisconnect) {
                    // Failed to connect
                    this.logToConsole('❌ Failed to connect to gateway');
                    this.handleConnectionFailure('close');
                }

                this.connected = false;
                this.authenticated = false;
                if (shouldReconnect) {
                    this.reconnectAttempts += 1;
                    this.setConnectionState('reconnecting');
                    this.updateGameStatus('Connection interrupted. Reconnecting...', '');
                    this.reconnectTimer = setTimeout(() => this.connect(), 1500);
                } else {
                    this.reconnectAttempts = 0;
                    this.setConnectionState(event.code === 1000 ? 'disconnected' : 'error');
                }
            };

        } catch (error) {
            console.error('[FICS Client] Connection failed:', error);
            this.logToConsole(`❌ Failed to connect: ${error.message}`);
            this.handleConnectionFailure('exception');
        }
    },

    handleConnectionFailure(reason) {
        let errorMsg = '❌ Gateway unreachable\n\n';
        let tips = '';

        switch (reason) {
            case 'timeout':
                tips = '• Gateway may not be running\n' +
                       '• Check if port 8081 is accessible\n' +
                       '• Firewall may be blocking connection';
                break;
            case 'error':
            case 'close':
                tips = '• Is the gateway running?\n' +
                       '  Run: npm run fics:gateway\n\n' +
                       '• Check gateway URL: ' + this.gatewayUrl + '\n\n' +
                       '• Firewall or antivirus blocking port 8081?';
                break;
            case 'exception':
                tips = '• Invalid gateway URL\n' +
                       '• Check fics-client.js configuration';
                break;
        }

        const fullMsg = errorMsg + tips;
        this.updateGameStatus(fullMsg, 'error');
        this.setConnectionState('error', 'Failed');
    },

    async testGateway() {
        this.logToConsole('🔍 Testing gateway connection...');
        this.updateGameStatus('Testing gateway...', '');

        if (!this.isGatewayConfigured()) {
            const msg = 'FICS gateway requires a secure WSS endpoint in production.';
            this.logToConsole(msg);
            this.updateGameStatus(msg, 'error');
            this.updateGatewayStatus();
            return;
        }

        try {
            const testWs = new WebSocket(this.gatewayUrl);
            const startedAt = performance.now();
            let receivedBanner = false;

            const timeout = setTimeout(() => {
                testWs.close();
                this.logToConsole('❌ Test failed: Connection timeout');
                this.updateGameStatus('❌ Gateway unreachable (timeout)\n\nRun: npm run fics:gateway', 'error');
            }, 5000);

            testWs.onopen = () => {
                this.logToConsole('✅ Gateway test successful!');
                this.updateGameStatus('✅ Gateway is reachable!\n\nYou can now connect.', 'active');
            };

            testWs.onmessage = () => {
                if (receivedBanner) return;
                receivedBanner = true;
                clearTimeout(timeout);
                this.latencyMs = Math.round(performance.now() - startedAt);
                this.updateLatency();
                this.logToConsole('Gateway test successful; FICS banner received.');
                this.updateGameStatus('Gateway and FICS are reachable. You can now connect.', 'active');
                testWs.close(1000, 'Gateway test complete');
            };

            testWs.onerror = () => {
                clearTimeout(timeout);
                this.logToConsole('❌ Test failed: Cannot reach gateway');
                this.updateGameStatus(
                    '❌ Gateway unreachable\n\n' +
                    'Is it running?\n' +
                    'Run: npm run fics:gateway\n\n' +
                    'URL: ' + this.gatewayUrl,
                    'error'
                );
            };

            testWs.onclose = (event) => {
                if (event.code === 1000) {
                    // Normal close after successful test
                    return;
                }
                clearTimeout(timeout);
            };

        } catch (error) {
            console.error('[FICS Client] Test failed:', error);
            this.logToConsole(`❌ Test failed: ${error.message}`);
            this.updateGameStatus('❌ Test failed: ' + error.message, 'error');
        }
    },

    disconnect() {
        this.manualDisconnect = true;
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.send('quit');
            this.ws.close(1000, 'User disconnected');
            this.ws = null;
        }
        this.connected = false;
        this.authenticated = false;
        this.setConnectionState('disconnected');
        this.logToConsole('Disconnected');
    },

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const command = typeof message === 'string' ? message : message?.text;
            if (command !== undefined) this.ws.send(command);
        } else {
            console.warn('[FICS Client] Cannot send, not connected');
        }
    },

    handleRawGatewayData(text) {
        this.rawBuffer = `${this.rawBuffer}${text}`.slice(-16384);
        this.logToConsole(text.replace(/\r/g, '').trimEnd());

        if (!this.guestLoginSent && /login:/i.test(this.rawBuffer)) {
            this.guestLoginSent = true;
            this.rawBuffer = '';
            this.send('guest');
            return;
        }
        if (!this.guestReturnSent && /Press return to enter the server/i.test(this.rawBuffer)) {
            this.guestReturnSent = true;
            this.rawBuffer = '';
            this.send('');
            return;
        }
        if (!this.authenticated && /Starting FICS session|fics%/i.test(this.rawBuffer)) {
            this.authenticated = true;
            this.reconnectAttempts = 0;
            this.setConnectionState('connected');
            this.updateGameStatus('Connected as FICS guest', 'active');
            this.logToConsole('Connected as guest. You can now seek games or enter commands.');
            this.send('set style 12');
            this.send('set interface CAISSA Chess');
        }

        text.replace(/\r/g, '').split('\n').forEach((line) => {
            if (line.trim()) this.parseGameLine(line.trim());
        });
    },

    // ===== MESSAGE HANDLING =====
    handleServerMessage(message) {
        const { type } = message;

        switch (type) {
            case 'status':
                this.handleStatus(message);
                break;

            case 'authenticated':
                this.handleAuthenticated(message);
                break;

            case 'raw':
                this.handleRawMessage(message);
                break;

            case 'error':
                this.handleError(message);
                break;

            default:
                console.log('[FICS Client] Unknown message type:', type);
        }
    },

    handleStatus(message) {
        this.connected = message.connected;
        this.updateConnectionStatus(message.connected, message.message);
        if (message.message) {
            this.logToConsole(`ℹ️ ${message.message}`);
        }
    },

    handleAuthenticated(message) {
        this.authenticated = true;
        this.updateConnectionStatus(true, 'Connected as Guest');
        this.logToConsole('✅ ' + message.message);
        this.logToConsole('You can now seek games or type FICS commands');
    },

    handleRawMessage(message) {
        const line = message.text;
        this.logToConsole(line);

        // Basic parsing for game events
        this.parseGameLine(line);
    },

    handleError(message) {
        console.error('[FICS Client] Error:', message.message);
        this.logToConsole(`❌ ${message.message}`);
    },

    // ===== GAME PARSING (Basic) =====
    parseGameLine(line) {
        // Detect game start
        if (line.includes('Creating:') || line.includes('Game ') && line.includes('(') && line.includes(')')) {
            this.handleGameStart(line);
        }

        // Detect game end
        if (line.includes('Game ') && (line.includes('resigns') || line.includes('checkmated') ||
            line.includes('Game drawn') || line.includes('forfeits'))) {
            this.handleGameEnd(line);
        }

        // Detect moves (very basic - FICS uses various formats)
        // Style 12 parsing would be more reliable but more complex
        const moveMatch = line.match(/^(\d+)\.\s+([a-h][1-8]-[a-h][1-8]|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8])/);
        if (moveMatch) {
            this.handleMove(line);
        }
    },

    handleGameStart(line) {
        this.gameActive = true;
        this.updateGameStatus('Game started!', 'active');

        // Try to detect color (very basic)
        if (line.toLowerCase().includes('white')) {
            this.myColor = 'white';
        } else if (line.toLowerCase().includes('black')) {
            this.myColor = 'black';
        }

        // Reset board
        if (this.chess) {
            this.chess.reset();
        }
        this.initBoard();

        this.logToConsole('🎮 Game started!');
    },

    handleGameEnd(line) {
        this.gameActive = false;
        this.updateGameStatus('Game ended', 'ended');
        this.logToConsole('🏁 ' + line);
    },

    handleMove(line) {
        // This is very basic - in production you'd parse style 12 output
        this.logToConsole('♟️ ' + line);
    },

    // ===== BOARD MANAGEMENT =====
    initBoard() {
        if (!this.elements.boardContainer) return;

        // Clear existing board
        this.elements.boardContainer.innerHTML = '';

        // Create new board
        const config = {
            draggable: true,
            position: 'start',
            onDragStart: (source, piece) => this.onDragStart(source, piece),
            onDrop: (source, target) => this.onDrop(source, target),
            onSnapEnd: () => this.onSnapEnd()
        };

        // Flip board if playing black
        if (this.myColor === 'black') {
            config.orientation = 'black';
        }

        if (typeof Chessboard !== 'undefined') {
            this.board = Chessboard(this.elements.boardContainer, config);
            console.log('[FICS Client] Chessboard initialized');
        } else {
            console.error('[FICS Client] Chessboard.js not found!');
            this.elements.boardContainer.innerHTML = '<p>Board library not loaded</p>';
        }
    },

    onDragStart(source, piece) {
        // Don't allow moves if game not active
        if (!this.gameActive) return false;

        // Don't allow picking up pieces if game is over
        if (this.chess.game_over()) return false;

        // Only allow moving own pieces
        if ((this.myColor === 'white' && piece.search(/^b/) !== -1) ||
            (this.myColor === 'black' && piece.search(/^w/) !== -1)) {
            return false;
        }

        return true;
    },

    onDrop(source, target) {
        // Try to make the move
        const move = this.chess.move({
            from: source,
            to: target,
            promotion: 'q' // Always promote to queen for simplicity
        });

        // Illegal move
        if (move === null) return 'snapback';

        // Send move to FICS
        const moveStr = source + target;
        this.sendMove(moveStr);
    },

    onSnapEnd() {
        if (this.board) {
            this.board.position(this.chess.fen());
        }
    },

    // ===== GAME COMMANDS =====
    seek(time, inc) {
        if (!this.authenticated) {
            this.logToConsole('❌ Not connected to FICS');
            return;
        }

        const command = `seek ${time} ${inc}`;
        this.logToConsole(`> ${command}`);
        this.send({
            type: 'command',
            text: command
        });
    },

    sendMove(move) {
        if (!this.authenticated) {
            this.logToConsole('❌ Not connected to FICS');
            return;
        }

        console.log('[FICS Client] Sending move:', move);
        this.send({
            type: 'move',
            text: move
        });
    },

    resign() {
        if (!this.gameActive) return;
        this.send({ type: 'command', text: 'resign' });
        this.logToConsole('> resign');
    },

    offerDraw() {
        if (!this.gameActive) return;
        this.send({ type: 'command', text: 'draw' });
        this.logToConsole('> draw');
    },

    abort() {
        if (!this.gameActive) return;
        this.send({ type: 'command', text: 'abort' });
        this.logToConsole('> abort');
    },

    sendCommand() {
        const command = this.elements.commandInput?.value.trim();
        if (!command) return;

        this.logToConsole(`> ${command}`);
        this.send({
            type: 'command',
            text: command
        });

        this.elements.commandInput.value = '';
    },

    // ===== UI UPDATES =====
    updateConnectionStatus(connected, message = null) {
        if (!this.elements.connectionStatus) return;

        if (connected) {
            this.elements.connectionStatus.textContent = message || 'Connected';
            this.elements.connectionStatus.className = 'fics-status fics-status-connected';
            this.elements.connectBtn?.setAttribute('disabled', 'true');
            this.elements.disconnectBtn?.removeAttribute('disabled');
        } else {
            this.elements.connectionStatus.textContent = message || 'Not connected';
            this.elements.connectionStatus.className = 'fics-status fics-status-disconnected';
            if (this.isGatewayConfigured()) {
                this.elements.connectBtn?.removeAttribute('disabled');
            } else {
                this.elements.connectBtn?.setAttribute('disabled', 'true');
            }
            this.elements.disconnectBtn?.setAttribute('disabled', 'true');
        }
    },

    setConnectionState(state, message = null) {
        this.connectionState = state;
        const labels = {
            disconnected: 'Disconnected',
            connecting: 'Connecting',
            connected: 'Connected',
            reconnecting: 'Reconnecting',
            error: 'Error'
        };
        if (this.elements.connectionStatus) {
            this.elements.connectionStatus.textContent = message || labels[state] || state;
            this.elements.connectionStatus.className = `fics-status fics-status-${state}`;
        }
        const active = state === 'connecting' || state === 'connected' || state === 'reconnecting';
        this.elements.connectBtn?.toggleAttribute('disabled', active || !this.isGatewayConfigured());
        this.elements.disconnectBtn?.toggleAttribute('disabled', !active);
    },

    updateLatency() {
        if (this.elements.gatewayLatency) {
            this.elements.gatewayLatency.textContent = this.latencyMs === null
                ? 'Not measured'
                : `${this.latencyMs} ms`;
        }
    },

    updateGameStatus(status, className = '') {
        if (this.elements.gameStatus) {
            // Handle multiline status messages
            if (status.includes('\n')) {
                // Convert newlines to <br> for proper display
                const lines = status.split('\n').map(line => line.trim()).filter(Boolean);
                this.elements.gameStatus.innerHTML = lines.join('<br>');
            } else {
                this.elements.gameStatus.textContent = status;
            }
            this.elements.gameStatus.className = `fics-game-status ${className}`;
        }

        // Show/hide game controls
        if (this.elements.gameControls) {
            this.elements.gameControls.style.display = this.gameActive ? 'flex' : 'none';
        }
    },

    logToConsole(message) {
        this.messageBuffer.push(message);

        // Trim buffer if too large
        if (this.messageBuffer.length > this.maxBufferSize) {
            this.messageBuffer.shift();
        }

        // Update console UI
        if (this.elements.console) {
            this.elements.console.textContent = this.messageBuffer.join('\n');
            this.elements.console.scrollTop = this.elements.console.scrollHeight;
        }
    },

    toggleConsole() {
        if (this.elements.consoleContainer) {
            const isHidden = this.elements.consoleContainer.style.display === 'none';
            this.elements.consoleContainer.style.display = isHidden ? 'block' : 'none';
            if (this.elements.consoleToggle) {
                this.elements.consoleToggle.textContent = isHidden ? '▼ Hide Console' : '▶ Show Console';
            }
        }
    },

    // ===== LIFECYCLE =====
    onEnter() {
        console.log('[FICS Client] Section entered');
    },

    onExit() {
        console.log('[FICS Client] Section exited');
        // Don't disconnect automatically - let user decide
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        CaissaFICSClient.init();
    });
} else {
    CaissaFICSClient.init();
}

// Make globally accessible
window.CaissaFICSClient = CaissaFICSClient;
