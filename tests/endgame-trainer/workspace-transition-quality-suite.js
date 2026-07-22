import { EndgameSessionBoardBinding } from '../../js/endgame-trainer/endgame-session-board-binding.js';

class Controller {
    constructor() { this.state = { status: 'idle', sessionId: null, currentFen: null, orientation: 'white', engineThinking: false, sideToMove: null, moveHistory: [], result: null, error: null }; this.listeners = new Set(); this.sequence = 0; }
    getState() { return structuredClone(this.state); } subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(patch) { Object.assign(this.state, patch); for (const listener of this.listeners) listener(this.getState()); }
    async prepareSession() { this.emit({ status: 'preparing' }); this.emit({ status: 'ready', sessionId: `session-${++this.sequence}`, currentFen: `fen-${this.sequence}` }); return this.getState(); }
    async startSession() { this.emit({ status: 'user-turn' }); return this.getState(); }
    async newPosition() { this.emit({ status: 'preparing' }); this.emit({ status: 'ready', sessionId: `session-${++this.sequence}`, currentFen: `fen-${this.sequence}` }); return this.getState(); }
    async restart() { this.emit({ status: 'preparing' }); this.emit({ status: 'user-turn' }); return this.getState(); }
    dispose() { this.listeners.clear(); }
}
class Board {
    constructor() { this.initializeCount = 0; this.disposeCount = 0; this.positionUpdates = 0; this.fen = null; this.orientation = 'white'; }
    initialize() { this.initializeCount += 1; } getPosition() { return this.fen; } getState() { return { orientation: this.orientation }; }
    setPosition(fen) { this.fen = fen; this.positionUpdates += 1; } setOrientation(value) { this.orientation = value; }
    setThinking() {} setInteractive() {} setLastMove() {} setCheckSquare() {} dispose() { this.disposeCount += 1; }
}
const controller = new Controller(), board = new Board(), binding = new EndgameSessionBoardBinding({ controller, boardView: board, rulesFactory: () => ({ isCheck: () => false, pieces: () => [], sideToMove: () => 'white' }) }).initialize();
await binding.prepare({});
for (let index = 0; index < 100; index += 1) { await binding.start(); await binding.restart(); await binding.newPosition({}); }
const report = { starts: 100, newPositions: controller.sequence - 1, restarts: 100, boardInitializations: board.initializeCount, boardDisposals: board.disposeCount, subscriptions: controller.listeners.size, positionUpdates: board.positionUpdates, finalFen: board.fen };
console.log(JSON.stringify(report, null, 2));
if (report.starts !== 100 || report.newPositions !== 100 || report.restarts !== 100 || report.boardInitializations !== 1 || report.boardDisposals !== 0 || report.subscriptions !== 1 || report.positionUpdates !== 101) process.exitCode = 1;
