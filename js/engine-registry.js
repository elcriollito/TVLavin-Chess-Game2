/*
 * Engine Registry - single source of truth for engine metadata and availability.
 */

(function () {
    const ENGINES = {
        stockfish: {
            id: 'stockfish',
            name: 'Stockfish 2019 MV',
            version: '2019-08-15-multi-variant',
            author: 'D. Dugovic, F. Fichter et al.',
            license: 'GPLv3',
            execution: 'asm-js',
            workerPath: '/engine/stockfish-working.js',
            wasmPath: '',
            defaultOptions: { MultiPV: 1 },
            defaultDepth: 20,
            supportsChess960: false,
            enabled: true,
            notes: 'Legacy multi-variant browser build'
        },
        'stockfish-lite': {
            id: 'stockfish-lite',
            name: 'Stockfish 2019 MV (Lite profile)',
            version: '2019-08-15-multi-variant',
            author: 'D. Dugovic, F. Fichter et al.',
            license: 'GPLv3',
            execution: 'asm-js',
            workerPath: '/engine/stockfish-working.js',
            wasmPath: '',
            defaultOptions: { MultiPV: 1 },
            defaultDepth: 12,
            supportsChess960: false,
            enabled: true,
            notes: 'Legacy multi-variant build with lightweight search profile'
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

    // Analyze-only providers are intentionally excluded from list()/getEnabled().
    // Arena and legacy consumers therefore retain their existing engine route.
    const ANALYZE_ENGINES = {
        'stockfish-18-lite': {
            id: 'stockfish-18-lite',
            name: 'Stockfish 18 Lite WASM',
            version: '18.0.0',
            author: 'the Stockfish developers (see AUTHORS file)',
            license: 'GPLv3',
            execution: 'wasm',
            workerPath: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js',
            wasmPath: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.wasm',
            expectedUci: {
                name: 'Stockfish 18 Lite WASM',
                author: 'the Stockfish developers (see AUTHORS file)'
            },
            defaultOptions: { MultiPV: 1, Hash: 16 },
            defaultDepth: 20,
            supportsChess960: false,
            enabled: true,
            notes: 'Analyze V2 isolated single-threaded WASM/NNUE provider'
        }
    };

    function createConfiguredEngine(config, options = {}) {
        if (!config) return null;
        if (config.enabled === false) {
            console.warn('[EngineRegistry] Engine disabled:', config.name);
            return null;
        }
        if (typeof window.EngineAdapter !== 'function') {
            console.warn('[EngineRegistry] EngineAdapter not loaded');
            return null;
        }
        return new window.EngineAdapter({
            ...config,
            ...options,
            workerPath: config.workerPath,
            wasmPath: config.wasmPath,
            expectedUci: config.expectedUci
        });
    }

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
        createEngine(id, options = {}) {
            const config = this.get(id) || this.get('stockfish');
            return createConfiguredEngine(config, options);
        },
        getAnalyze(id) {
            return ANALYZE_ENGINES[id] || null;
        },
        createAnalyzeEngine(id, options = {}) {
            return createConfiguredEngine(this.getAnalyze(id), options);
        }
    };

    window.EngineRegistry = EngineRegistry;
})();
