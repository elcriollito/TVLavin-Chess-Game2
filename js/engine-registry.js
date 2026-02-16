/*
 * Engine Registry - single source of truth for engine metadata and availability.
 */

(function () {
    const ENGINES = {
        stockfish: {
            id: 'stockfish',
            name: 'Stockfish 16',
            version: '16',
            author: 'Stockfish Team',
            license: 'GPLv3',
            execution: 'wasm',
            workerPath: 'engine/stockfish-working.js',
            wasmPath: 'engine/stockfish-working.wasm',
            defaultOptions: { MultiPV: 1 },
            defaultDepth: 20,
            supportsChess960: false,
            enabled: true,
            notes: 'Bundled WASM build'
        },
        'stockfish-lite': {
            id: 'stockfish-lite',
            name: 'Stockfish Lite',
            version: '16',
            author: 'Stockfish Team',
            license: 'GPLv3',
            execution: 'wasm',
            workerPath: 'engine/stockfish-working.js',
            wasmPath: 'engine/stockfish-working.wasm',
            defaultOptions: { MultiPV: 1 },
            defaultDepth: 12,
            supportsChess960: false,
            enabled: true,
            notes: 'Lightweight config'
        },
        'fairy-stockfish': {
            id: 'fairy-stockfish',
            name: 'Fairy-Stockfish',
            version: 'unknown',
            author: 'Fabian Fichter and contributors',
            license: 'GPLv3',
            execution: 'wasm',
            workerPath: 'public/engines/fairy-stockfish/engine-worker.js',
            wasmPath: 'public/engines/fairy-stockfish/stockfish.wasm',
            defaultOptions: { MultiPV: 1 },
            defaultDepth: 16,
            supportsChess960: true,
            enabled: true,
            notes: 'WASM build (browser)'
        },
        arasan: {
            id: 'arasan',
            name: 'Arasan',
            version: 'unknown',
            author: 'Jon Dart',
            license: 'MIT',
            execution: 'wasm',
            workerPath: 'public/engines/arasan/engine-worker.js',
            wasmPath: 'public/engines/arasan/engine.wasm',
            defaultOptions: { MultiPV: 1 },
            defaultDepth: 16,
            supportsChess960: false,
            enabled: false,
            notes: 'WASM build needed'
        },
        rodent3: {
            id: 'rodent3',
            name: 'Rodent III',
            version: 'unknown',
            author: 'Pawel Koziol',
            license: 'GPLv3',
            execution: 'wasm',
            workerPath: 'public/engines/rodent3/engine-worker.js',
            wasmPath: 'public/engines/rodent3/engine.wasm',
            defaultOptions: { MultiPV: 1 },
            defaultDepth: 16,
            supportsChess960: false,
            enabled: false,
            notes: 'WASM build needed'
        },
        texel: {
            id: 'texel',
            name: 'Texel',
            version: 'unknown',
            author: 'Peter Osterlund',
            license: 'GPLv3',
            execution: 'wasm',
            workerPath: 'public/engines/texel/engine-worker.js',
            wasmPath: 'public/engines/texel/engine.wasm',
            defaultOptions: { MultiPV: 1 },
            defaultDepth: 16,
            supportsChess960: false,
            enabled: false,
            notes: 'WASM build needed'
        }
    };

    const EngineRegistry = {
        ENGINES,
        list() {
            return Object.values(ENGINES);
        },
        get(id) {
            return ENGINES[id] || null;
        },
        getEnabled() {
            return Object.values(ENGINES).filter(e => e.enabled !== false);
        },
        createEngine(id) {
            const config = this.get(id) || this.get('stockfish');
            if (!config) return null;
            if (config.enabled === false) {
                console.warn('[EngineRegistry] Engine disabled:', config.name);
                return null;
            }
            if (typeof window.EngineAdapter !== 'function') {
                console.warn('[EngineRegistry] EngineAdapter not loaded');
                return null;
            }
            return new window.EngineAdapter(config);
        }
    };

    window.EngineRegistry = EngineRegistry;
})();
