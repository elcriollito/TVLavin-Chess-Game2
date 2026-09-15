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

    const ENGINE_ROLES = Object.freeze({
        GAME: 'game',
        COACH_ACTIVE: 'coach-active',
        BOTS: 'bots',
        ANALYZE_REVIEW: 'analyze-review',
        MANUAL_ANALYSIS: 'manual-analysis'
    });

    // Production/default selection remains OFF. ENGINE18-003 may activate only
    // through an exact Preview environment and activation identity supplied by
    // the trusted document boundary. Missing/invalid inputs fail closed.
    const GAMEPLAY_FEATURE_GATES = Object.freeze({
        CAISSA_PLAY_SF18_GAMEPLAY: false
    });

    const LEGACY_GAMEPLAY_PROVIDER = Object.freeze({
        providerKey: 'legacy-stockfish-2019',
        engineId: 'stockfish',
        name: 'Stockfish 2019 Multi-Variant',
        version: ENGINES.stockfish.version,
        execution: ENGINES.stockfish.execution,
        workerPath: ENGINES.stockfish.workerPath,
        wasmPath: ENGINES.stockfish.wasmPath,
        expectedUci: null,
        defaultOptions: Object.freeze({ MultiPV: 1 }),
        roles: Object.freeze([
            ENGINE_ROLES.GAME,
            ENGINE_ROLES.COACH_ACTIVE,
            ENGINE_ROLES.BOTS
        ]),
        capabilities: Object.freeze({
            singleThreaded: true,
            chess960: false,
            attributedRequests: true,
            analysisInfo: true
        }),
        enabled: true,
        selectedByDefault: true,
        notes: 'Frozen legacy gameplay provider'
    });

    const SF18_GAMEPLAY_PROVIDER = Object.freeze({
        providerKey: 'stockfish-18-gameplay',
        engineId: 'stockfish-18-gameplay',
        name: 'Stockfish 18 Lite WASM (Gameplay, inactive)',
        version: ANALYZE_ENGINES['stockfish-18-lite'].version,
        execution: ANALYZE_ENGINES['stockfish-18-lite'].execution,
        workerPath: ANALYZE_ENGINES['stockfish-18-lite'].workerPath,
        wasmPath: ANALYZE_ENGINES['stockfish-18-lite'].wasmPath,
        expectedUci: Object.freeze({ ...ANALYZE_ENGINES['stockfish-18-lite'].expectedUci }),
        defaultOptions: Object.freeze({ MultiPV: 1, Hash: 16, Threads: 1 }),
        roles: Object.freeze([ENGINE_ROLES.GAME, ENGINE_ROLES.COACH_ACTIVE]),
        capabilities: Object.freeze({
            singleThreaded: true,
            chess960: false,
            attributedRequests: true,
            analysisInfo: true
        }),
        enabled: false,
        selectedByDefault: false,
        notes: 'ENGINE18-002 inactive provider; never eligible for Bots'
    });

    const GAMEPLAY_PROVIDERS = Object.freeze({
        [LEGACY_GAMEPLAY_PROVIDER.providerKey]: LEGACY_GAMEPLAY_PROVIDER,
        [SF18_GAMEPLAY_PROVIDER.providerKey]: SF18_GAMEPLAY_PROVIDER
    });

    const ANALYZE_ROLE_PROVIDER = Object.freeze({
        providerKey: 'stockfish-18-lite',
        engineId: 'stockfish-18-lite',
        name: ANALYZE_ENGINES['stockfish-18-lite'].name,
        version: ANALYZE_ENGINES['stockfish-18-lite'].version,
        execution: ANALYZE_ENGINES['stockfish-18-lite'].execution,
        workerPath: ANALYZE_ENGINES['stockfish-18-lite'].workerPath,
        wasmPath: ANALYZE_ENGINES['stockfish-18-lite'].wasmPath,
        expectedUci: Object.freeze({ ...ANALYZE_ENGINES['stockfish-18-lite'].expectedUci }),
        defaultOptions: Object.freeze({ ...ANALYZE_ENGINES['stockfish-18-lite'].defaultOptions }),
        roles: Object.freeze([ENGINE_ROLES.ANALYZE_REVIEW, ENGINE_ROLES.MANUAL_ANALYSIS]),
        capabilities: Object.freeze({
            singleThreaded: true,
            chess960: false,
            attributedRequests: true,
            analysisInfo: true
        }),
        enabled: true,
        selectedByDefault: true,
        notes: 'Existing Analyze V2 provider; ownership remains separate from gameplay'
    });

    function isSf18GameplayGateEnabled(featureGates) {
        if (featureGates?.CAISSA_PLAY_SF18_GAMEPLAY !== true) return false;
        return (featureGates.deploymentEnvironment === 'preview'
                && featureGates.activationId === 'ENGINE18-003')
            || (featureGates.deploymentEnvironment === 'production'
                && featureGates.activationId === 'ENGINE18-003C');
    }

    function resolveRoleProvider(role, featureGates = {}) {
        if (role === ENGINE_ROLES.ANALYZE_REVIEW || role === ENGINE_ROLES.MANUAL_ANALYSIS) {
            return ANALYZE_ROLE_PROVIDER;
        }
        if (role === ENGINE_ROLES.BOTS) return LEGACY_GAMEPLAY_PROVIDER;
        if (role !== ENGINE_ROLES.GAME && role !== ENGINE_ROLES.COACH_ACTIVE) return null;
        return role === ENGINE_ROLES.GAME && isSf18GameplayGateEnabled(featureGates)
            ? SF18_GAMEPLAY_PROVIDER
            : LEGACY_GAMEPLAY_PROVIDER;
    }

    function providerEngineConfig(provider) {
        if (!provider) return null;
        const source = provider.providerKey === LEGACY_GAMEPLAY_PROVIDER.providerKey
            ? ENGINES.stockfish
            : (provider.providerKey === ANALYZE_ROLE_PROVIDER.providerKey
                ? ANALYZE_ENGINES['stockfish-18-lite']
                : provider);
        return {
            ...source,
            id: provider.engineId,
            name: provider.name,
            workerPath: provider.workerPath,
            wasmPath: provider.wasmPath,
            expectedUci: provider.expectedUci,
            defaultOptions: provider.defaultOptions
        };
    }

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
        ENGINE_ROLES,
        GAMEPLAY_FEATURE_GATES,
        GAMEPLAY_PROVIDERS,
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
        },
        getGameplayProvider(providerKey) {
            return GAMEPLAY_PROVIDERS[providerKey] || null;
        },
        resolveRoleProvider(role, featureGates = {}) {
            return resolveRoleProvider(role, featureGates);
        },
        createRoleEngine(role, options = {}) {
            const provider = resolveRoleProvider(role, options.featureGates);
            const config = provider === SF18_GAMEPLAY_PROVIDER
                ? { ...providerEngineConfig(provider), enabled: true }
                : providerEngineConfig(provider);
            return createConfiguredEngine(config, options.adapterOptions || {});
        },
        createInactiveGameplayProviderForVerification(role, options = {}) {
            if (options.verificationToken !== 'ENGINE18-002') return null;
            if (!SF18_GAMEPLAY_PROVIDER.roles.includes(role) || role === ENGINE_ROLES.BOTS) return null;
            const config = { ...providerEngineConfig(SF18_GAMEPLAY_PROVIDER), enabled: true };
            return createConfiguredEngine(config, options.adapterOptions || {});
        }
    };

    window.EngineRegistry = EngineRegistry;
})();
