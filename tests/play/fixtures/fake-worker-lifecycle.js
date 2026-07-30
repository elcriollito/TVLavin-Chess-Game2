export function createLifecycleTransport(script = {}) {
    const sent = [];
    let hooks = null;
    let terminated = false;
    let detached = false;
    const factory = supplied => {
        hooks = supplied;
        if (script.constructorFailure) throw new Error('fixture constructor failure');
        return {
            send(command) {
                sent.push(command);
                if (command.type === 'uci' && script.autoUci !== false) {
                    queueMicrotask(() => hooks.onMessage({ type: 'uciok' }));
                }
                if (command.type === 'isready' && script.autoReady !== false) {
                    queueMicrotask(() => hooks.onMessage({ type: 'readyok' }));
                }
                if (['move-generation', 'evaluation'].includes(command.type) && script.autoResult) {
                    queueMicrotask(() => hooks.onMessage({
                        type: 'result', requestId: command.requestId, searchId: command.searchId,
                        result: script.result || 'e2e4'
                    }));
                }
            },
            terminate() { terminated = true; },
            detach() { detached = true; }
        };
    };
    return Object.freeze({
        factory, sent, emit(event) { hooks.onMessage(event); },
        error() { hooks.onError(new Error('fixture worker error')); },
        messageError() { hooks.onMessageError(new Error('fixture message error')); },
        status() { return Object.freeze({ terminated, detached }); }
    });
}

export const SCENARIOS = Object.freeze([
    'successful-uci-init', 'delayed-uciok', 'delayed-readyok', 'init-timeout',
    'constructor-failure', 'worker-error', 'messageerror', 'malformed-message',
    'successful-search', 'search-timeout', 'stop-acknowledgment', 'stale-bestmove',
    'stale-info', 'restart-success', 'restart-failure', 'termination-during-search',
    'mode-switch-overlap', 'new-game-overlap', 'rematch-overlap', 'human-fairplay-denial'
]);
