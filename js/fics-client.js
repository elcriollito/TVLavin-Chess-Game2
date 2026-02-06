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

    // Gateway URL (configurable)
    gatewayUrl: 'ws://localhost:8081',

    // ===== INITIALIZATION =====
    init() {
        console.log('[FICS Client] Initializing...');
        this.cacheElements();
        this.bindEvents();
        this.initChessEngine();
        this.updateConnectionStatus(false);
    },

    cacheElements() {
        this.elements = {
            // Connection
            connectBtn: document.getElementById('ficsConnectBtn'),
            disconnectBtn: document.getElementById('ficsDisconnectBtn'),
            connectionStatus: document.getElementById('ficsConnectionStatus'),

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

    bindEvents() {
        // Connection
        this.elements.connectBtn?.addEventListener('click', () => this.connect());
        this.elements.disconnectBtn?.addEventListener('click', () => this.disconnect());

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

        this.logToConsole('Connecting to FICS gateway...');
        this.updateConnectionStatus(false, 'Connecting...');

        try {
            this.ws = new WebSocket(this.gatewayUrl);

            this.ws.onopen = () => {
                console.log('[FICS Client] WebSocket connected');
                this.logToConsole('Connected to gateway, authenticating...');

                // Send guest login request
                this.send({
                    type: 'connectGuest',
                    handlePrefix: 'CAISSA'
                });
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleServerMessage(message);
                } catch (error) {
                    console.error('[FICS Client] Failed to parse message:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[FICS Client] WebSocket error:', error);
                this.logToConsole('❌ Connection error');
                this.updateConnectionStatus(false, 'Error');
            };

            this.ws.onclose = () => {
                console.log('[FICS Client] WebSocket closed');
                this.logToConsole('Disconnected from FICS');
                this.connected = false;
                this.authenticated = false;
                this.updateConnectionStatus(false);
            };

        } catch (error) {
            console.error('[FICS Client] Connection failed:', error);
            this.logToConsole(`❌ Failed to connect: ${error.message}`);
            this.updateConnectionStatus(false, 'Failed');
        }
    },

    disconnect() {
        if (this.ws) {
            this.send({ type: 'disconnect' });
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.authenticated = false;
        this.updateConnectionStatus(false);
        this.logToConsole('Disconnected');
    },

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('[FICS Client] Cannot send, not connected');
        }
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
            this.elements.connectBtn?.removeAttribute('disabled');
            this.elements.disconnectBtn?.setAttribute('disabled', 'true');
        }
    },

    updateGameStatus(status, className = '') {
        if (this.elements.gameStatus) {
            this.elements.gameStatus.textContent = status;
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
