export const DEFAULT_ENGINE_SCENARIO = Object.freeze({
    bestMove: 'e7e5',
    cp: 34,
    depth: 12,
    delayMs: 10,
    autoReply: true
});

// This function is serialized by Playwright and runs before any application script.
export function installPlayHarness(scenario) {
    const config = { ...scenario };
    const state = {
        workersCreated: 0,
        workersTerminated: 0,
        workerMessages: [],
        workers: [],
        boardConstructions: 0,
        listenerRegistrations: Object.create(null),
        rafCreated: 0,
        rafCancelled: 0,
        activeRafs: new Set()
    };

    const emit = (worker, data, delay = 0) => {
        const deliver = () => {
            if (!worker.terminated) worker.onmessage?.({ data });
        };
        delay ? setTimeout(deliver, delay) : queueMicrotask(deliver);
    };

    class DeterministicWorker {
        constructor(url) {
            this.url = String(url);
            this.terminated = false;
            this.onmessage = null;
            this.onerror = null;
            this.onmessageerror = null;
            this.messages = [];
            this.multiPv = 1;
            state.workersCreated += 1;
            state.workers.push(this);
        }

        postMessage(message) {
            const command = String(message);
            this.messages.push(command);
            state.workerMessages.push(command);
            const multiPv = command.match(/^setoption name MultiPV value (\d+)$/);
            if (multiPv) this.multiPv = Number(multiPv[1]);
            if (command === 'uci') emit(this, 'id name CAISSA deterministic fixture');
            if (command === 'uci') emit(this, 'uciok');
            if (command === 'isready' && config.autoReady !== false) emit(this, 'readyok');
            if (command.startsWith('go') && config.autoReply !== false) {
                const score = config.mate == null ? `cp ${config.cp ?? 34}` : `mate ${config.mate}`;
                const moves = config.candidateMoves || [config.bestMove ?? 'e7e5', 'c7c5', 'd7d5', 'g8f6', 'b8c6'];
                for (let index = 0; index < this.multiPv; index += 1) {
                    const candidateScore = config.mate == null ? `cp ${(config.cp ?? 34) - index * 10}` : score;
                    emit(this, `info depth ${config.depth ?? 12} multipv ${index + 1} score ${candidateScore} nodes 128 time 1 pv ${moves[index]}`, config.delayMs ?? 10);
                }
                emit(this, `bestmove ${config.bestMove ?? 'e7e5'}`, (config.delayMs ?? 10) + 1);
            }
            if (command === '__fixture_error__') {
                setTimeout(() => this.onerror?.(new Error('deterministic worker failure')), config.delayMs ?? 0);
            }
        }

        terminate() {
            if (this.terminated) return;
            this.terminated = true;
            state.workersTerminated += 1;
        }
    }

    window.Worker = DeterministicWorker;

    let chessboard;
    Object.defineProperty(window, 'Chessboard', {
        configurable: true,
        get: () => chessboard,
        set: (factory) => {
            const wrapped = (...args) => {
                state.boardConstructions += 1;
                return factory(...args);
            };
            Object.assign(wrapped, factory);
            chessboard = wrapped;
        }
    });

    const originalAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        const key = `${this === window ? 'window' : this === document ? 'document' : this.id || this.tagName || 'target'}:${type}`;
        state.listenerRegistrations[key] = (state.listenerRegistrations[key] || 0) + 1;
        return originalAdd.call(this, type, listener, options);
    };

    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalCancelRaf = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
        state.rafCreated += 1;
        let id;
        id = originalRaf((time) => {
            state.activeRafs.delete(id);
            callback(time);
        });
        state.activeRafs.add(id);
        return id;
    };
    window.cancelAnimationFrame = (id) => {
        if (state.activeRafs.delete(id)) state.rafCancelled += 1;
        return originalCancelRaf(id);
    };

    window.__caissaPlayHarness = {
        state,
        configure(next) {
            Object.assign(config, next);
        },
        emit(workerIndex, line, delay = 0) {
            emit(state.workers[workerIndex], line, delay);
        },
        fail(workerIndex = 0) {
            state.workers[workerIndex]?.onerror?.(new Error('deterministic worker failure'));
        },
        snapshot() {
            return {
                workersCreated: state.workersCreated,
                workersTerminated: state.workersTerminated,
                workerMessages: [...state.workerMessages],
                boardConstructions: state.boardConstructions,
                listenerRegistrations: { ...state.listenerRegistrations },
                rafCreated: state.rafCreated,
                rafCancelled: state.rafCancelled,
                activeRafs: state.activeRafs.size
            };
        }
    };
}
