(function installEducationalEngineAnalysis(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function create(options = {}) {
        const factory = options.engineFactory || (() => global.EngineRegistry?.createEngine?.('stockfish'));
        const setTimer = options.setTimeout || global.setTimeout?.bind(global);
        const clearTimer = options.clearTimeout || global.clearTimeout?.bind(global);
        let engine = null; let generation = 0; let active = null; let disposed = false;
        async function ready() {
            if (!engine) engine = factory?.();
            if (!engine) return false;
            if (engine.isReady?.()) return true;
            const started = Date.now();
            while (!engine.isReady?.() && Date.now() - started < 8000)
                await new Promise(resolve => setTimer(resolve, 25));
            return !!engine.isReady?.();
        }
        async function analyze(position, policy, correlation) {
            if (disposed) return freeze({ ok: false, reasonCode: 'DISPOSED', value: null });
            if (active) return freeze({ ok: false, reasonCode: 'ENGINE_BUSY', value: null });
            if (!await ready()) return freeze({ ok: false, reasonCode: 'ENGINE_UNAVAILABLE', value: null });
            const current = ++generation; const started = Date.now();
            return new Promise(resolve => {
                let latest = null; let settled = false;
                const finish = value => {
                    if (settled) return; settled = true; clearTimer?.(timer);
                    if (active?.generation === current) active = null;
                    engine.onInfo = null; engine.onBestMove = null; resolve(freeze(value));
                };
                const timer = setTimer(() => {
                    engine.stop?.(); finish({ ok: false, reasonCode: 'ENGINE_TIMEOUT', value: null });
                }, policy.perPositionTimeoutMs);
                active = { generation: current, finish };
                engine.stop?.();
                engine.onInfo = info => {
                    if (active?.generation === current) latest = info;
                };
                engine.getBestMove(position.fen, bestMove => {
                    if (active?.generation !== current)
                        return finish({ ok: false, reasonCode: 'STALE_ENGINE_RESPONSE', value: null });
                    finish({ ok: true, reasonCode: 'ENGINE_RESULT', value: {
                        score: latest?.score ?? null, mate: latest?.mate ?? null,
                        pv: latest?.pv || [], depth: latest?.depth ?? null, nodes: latest?.nodes ?? null,
                        bestMove, elapsedMs: Date.now() - started, correlation
                    } });
                }, { depth: policy.perPositionLimit.value });
            });
        }
        function cancel() {
            generation += 1; engine?.stop?.();
            if (active) active.finish({ ok: false, reasonCode: 'RUN_CANCELED', value: null });
            active = null; return freeze({ ok: true, reasonCode: 'RUN_CANCELED' });
        }
        function dispose() {
            if (disposed) return freeze({ ok: true, status: 'unchanged', reasonCode: 'DISPOSED' });
            cancel(); engine?.terminate?.(); engine = null; disposed = true;
            return freeze({ ok: true, status: 'disposed', reasonCode: 'DISPOSED' });
        }
        return freeze({ schemaVersion: SCHEMA_VERSION, analyze, cancel, dispose,
            inspect: () => freeze({ activeSearches: active ? 1 : 0, engineInstances: engine ? 1 : 0,
                workerPoolSize: 0, disposed }) });
    }
    global.CaissaEducationalEngineAnalysis = freeze({ schemaVersion: SCHEMA_VERSION, create });
})(typeof window !== 'undefined' ? window : globalThis);
