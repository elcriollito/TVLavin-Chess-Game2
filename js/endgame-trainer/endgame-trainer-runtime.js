import { ChessRulesFacade } from './chess-rules-facade.js';
import { EndgameSessionController } from './endgame-session-controller.js';
import { EndgameBoardView } from './endgame-board-view.js';
import { EndgameSessionBoardBinding } from './endgame-session-board-binding.js';
import { SafeEngineAdapter } from './safe-engine-adapter.js';
import { createStockfishWorker } from './stockfish-worker-factory.js';

export function createEndgameTrainerRuntime(options = {}) {
    if (!options.boardElement) throw new TypeError('invalid-options');
    let binding;
    const workerOptions = { ...(options.workerUrl ? { workerUrl: options.workerUrl } : {}),
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}), ...(options.WorkerConstructor ? { WorkerConstructor: options.WorkerConstructor } : {}) };
    const createEngineAdapter = options.createEngineAdapter || (() => new SafeEngineAdapter({
        createEngine: () => createStockfishWorker(workerOptions),
        defaultTimeoutMs: options.engineOptions?.timeoutMs ?? 10000,
        options: options.engineOptions?.uciOptions ?? {}, logger: options.callbacks?.onEngineLog ?? null
    }));
    const controller = new EndgameSessionController({
        createEngineAdapter, candidateSelector: options.candidateSelector,
        defaultEngineOptions: options.engineOptions ?? {}
    });
    const boardView = new EndgameBoardView({
        element: options.boardElement, createBoard: options.createBoard,
        rulesFactory: (fen) => fen ? ChessRulesFacade.fromFen(fen) : new ChessRulesFacade(),
        promotionResolver: options.promotionResolver,
        onMove: (move) => binding?.handleMoveIntent(move) ?? false,
        onError: options.callbacks?.onBoardError, onAnnouncement: options.callbacks?.onAnnouncement,
        options: options.boardOptions
    });
    binding = new EndgameSessionBoardBinding({ controller, boardView,
        onStateChange: options.callbacks?.onStateChange, onError: options.callbacks?.onError,
        onAnnouncement: options.callbacks?.onAnnouncement });
    return {
        controller, boardView, binding,
        initialize() { binding.initialize(); return this; },
        dispose() { binding.dispose(); }
    };
}
