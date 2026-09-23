/*
 * Engine Registry - single source of truth for engine metadata and availability.
 */

(function () {
    const availableCapabilities = Object.freeze({
        supportsThreads: false,
        supportsNNUE: false,
        supportsMultiPV: true,
        supportsSyzygy: false,
        browserCompatible: true,
        mobileCompatible: true,
        requiresCrossOriginIsolation: false
    });

    function legacyStockfishIdentityExpectation() {
        return Object.freeze({
            family: 'Stockfish',
            namePattern: '^Stockfish\\s+2019-08-15\\s+Multi-Variant(?:\\s.*)?$',
            authorPattern: '^D\\. Dugovic, F\\. Fichter et al\\.(?:\\s.*)?$',
            requireName: true,
            requireAuthor: true
        });
    }

    const ENGINES = {
        stockfish: {
            id: 'stockfish',
            providerId: 'stockfish',
            displayName: 'Stockfish 2019 MV',
            name: 'Stockfish 2019 MV',
            family: 'Stockfish',
            version: '2019-08-15-multi-variant',
            author: 'D. Dugovic, F. Fichter et al.',
            license: 'GPLv3',
            protocol: 'uci',
            runtimeType: 'worker',
            execution: 'asm-js',
            runtimeId: 'stockfish-2019-mv-runtime',
            profile: Object.freeze({ id: 'full', displayName: 'Full', defaultDepth: 20 }),
            workerPath: '/engine/stockfish-working.js',
            wasmPath: '',
            defaultOptions: { MultiPV: 1 },
            resource: Object.freeze({
                workerBytes: 1579996,
                wasmBytes: 0,
                defaultHashMiB: null,
                threads: 1,
                crossOriginIsolationRequired: false,
                mobileCompatible: true,
                estimatedWeightClass: 'light'
            }),
            defaultDepth: 20,
            supportsChess960: false,
            supportsStandardArena: true,
            capabilities: availableCapabilities,
            availability: 'available',
            unavailableReason: null,
            runtimeIdentityExpectation: legacyStockfishIdentityExpectation(),
            enabled: true,
            notes: 'Legacy multi-variant browser build'
        },
        'stockfish-lite': {
            id: 'stockfish-lite',
            providerId: 'stockfish-lite',
            displayName: 'Stockfish 2019 MV (Lite profile)',
            name: 'Stockfish 2019 MV (Lite profile)',
            family: 'Stockfish',
            version: '2019-08-15-multi-variant',
            author: 'D. Dugovic, F. Fichter et al.',
            license: 'GPLv3',
            protocol: 'uci',
            runtimeType: 'worker',
            execution: 'asm-js',
            runtimeId: 'stockfish-2019-mv-runtime',
            profile: Object.freeze({ id: 'lite', displayName: 'Lite', defaultDepth: 12 }),
            workerPath: '/engine/stockfish-working.js',
            wasmPath: '',
            defaultOptions: { MultiPV: 1 },
            resource: Object.freeze({
                workerBytes: 1579996,
                wasmBytes: 0,
                defaultHashMiB: null,
                threads: 1,
                crossOriginIsolationRequired: false,
                mobileCompatible: true,
                estimatedWeightClass: 'light'
            }),
            defaultDepth: 12,
            supportsChess960: false,
            supportsStandardArena: true,
            capabilities: availableCapabilities,
            availability: 'available',
            unavailableReason: null,
            runtimeIdentityExpectation: legacyStockfishIdentityExpectation(),
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
            workerPath: '/public/engines/fairy-stockfish/engine-worker.js',
            wasmPath: '/public/engines/fairy-stockfish/stockfish.wasm',
            defaultOptions: { MultiPV: 1 },
            defaultDepth: 16,
            supportsChess960: true,
            supportsStandardArena: false,
            productOwner: 'caissa-variants',
            chessFamilies: 'non-standard',
            enabled: false,
            notes: 'Reserved for CAISSA Variants and non-standard chess families; excluded from standard Engine Arena'
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
            supportsStandardArena: false,
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
            supportsStandardArena: false,
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
            supportsStandardArena: false,
            enabled: false,
            notes: 'WASM build needed'
        }
    };

    const arenaSessionUnavailable = new Map();
    const arenaPreviewProviders = new Map();
    const arenaPreviewFactories = new Map();
    const arenaProviderIds = () => [...ARENA_PROVIDER_IDS, ...arenaPreviewProviders.keys()];
    const arenaProviderById = id => ARENA_PROVIDERS[id] || arenaPreviewProviders.get(id) || null;

    function arenaAvailability(provider) {
        if (!provider) return Object.freeze({ available: false, reason: 'Unknown engine provider' });
        if (provider.mobileCompatible === false && window.matchMedia?.('(max-width: 1050px)').matches)
            return Object.freeze({ available: false,
                reason: 'Lc0 experimental engine is currently available on supported desktop browsers only.' });
        const sessionReason = arenaSessionUnavailable.get(provider.id);
        if (sessionReason) return Object.freeze({ available: false, reason: sessionReason });
        const available = provider.availability === 'available' && provider.enabled !== false;
        return Object.freeze({
            available,
            reason: available ? null : (provider.unavailableReason || 'Engine unavailable')
        });
    }

    function arenaProviderSnapshot(provider) {
        if (!provider) return null;
        const availability = arenaAvailability(provider);
        return Object.freeze({
            ...provider,
            enabled: availability.available,
            availability: availability.available ? 'available' : 'unavailable',
            unavailableReason: availability.reason,
            reason: availability.reason || provider.notes || ''
        });
    }

    // The Analyze provider remains excluded from the generic legacy list()/getEnabled()
    // catalog. Arena registers a truthful competition profile from these same assets.
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

    const STOCKFISH_18_ARENA_PROVIDER = Object.freeze({
        id: 'stockfish-18-lite',
        providerId: 'stockfish-18-lite',
        displayName: 'Stockfish 18 Lite',
        name: 'Stockfish 18 Lite',
        family: 'Stockfish',
        version: ANALYZE_ENGINES['stockfish-18-lite'].version,
        author: ANALYZE_ENGINES['stockfish-18-lite'].author,
        license: ANALYZE_ENGINES['stockfish-18-lite'].license,
        protocol: 'uci',
        runtimeType: 'wasm',
        execution: ANALYZE_ENGINES['stockfish-18-lite'].execution,
        runtimeId: 'stockfish-18-lite-single-runtime',
        profile: Object.freeze({ id: 'lite-single', displayName: 'Lite single-thread', defaultDepth: 20 }),
        workerPath: ANALYZE_ENGINES['stockfish-18-lite'].workerPath,
        wasmPath: ANALYZE_ENGINES['stockfish-18-lite'].wasmPath,
        defaultOptions: Object.freeze({ MultiPV: 1, Hash: 16, Threads: 1 }),
        resource: Object.freeze({
            workerBytes: 20680,
            wasmBytes: 7295411,
            defaultHashMiB: 16,
            threads: 1,
            crossOriginIsolationRequired: false,
            mobileCompatible: true,
            estimatedWeightClass: 'heavy'
        }),
        defaultDepth: ANALYZE_ENGINES['stockfish-18-lite'].defaultDepth,
        supportsChess960: false,
        supportsStandardArena: true,
        capabilities: Object.freeze({
            supportsThreads: false,
            supportsNNUE: true,
            supportsMultiPV: true,
            supportsSyzygy: false,
            browserCompatible: true,
            mobileCompatible: true,
            requiresCrossOriginIsolation: false
        }),
        availability: 'available',
        unavailableReason: null,
        runtimeIdentityExpectation: Object.freeze({
            family: 'Stockfish',
            namePattern: '^Stockfish\\s+18\\s+Lite\\s+WASM(?:\\s.*)?$',
            authorPattern: '^the Stockfish developers \\(see AUTHORS file\\)(?:\\s.*)?$',
            requireName: true,
            requireAuthor: true
        }),
        enabled: true,
        notes: 'Existing CAISSA Stockfish 18 Lite single-threaded WASM/NNUE runtime'
    });

    const STOCKFISH_19_ARENA_PROVIDER = Object.freeze({
        id: 'stockfish-19-lite',
        providerId: 'stockfish-19-lite',
        displayName: 'Stockfish 19 Lite',
        name: 'Stockfish 19 Lite',
        family: 'Stockfish',
        version: '19.0.0',
        author: 'the Stockfish developers (see AUTHORS file)',
        license: 'GPLv3',
        protocol: 'uci',
        runtimeType: 'wasm',
        execution: 'wasm',
        runtimeId: 'stockfish-19-lite-single-runtime',
        profile: Object.freeze({ id: 'lite-single', displayName: 'Lite single-thread', defaultDepth: 20 }),
        workerPath: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js',
        wasmPath: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm',
        defaultOptions: Object.freeze({ MultiPV: 1, Hash: 16, Threads: 1 }),
        resource: Object.freeze({
            workerBytes: 21415,
            wasmBytes: 1787571,
            defaultHashMiB: 16,
            threads: 1,
            crossOriginIsolationRequired: false,
            mobileCompatible: true,
            estimatedWeightClass: 'light'
        }),
        defaultDepth: 20,
        supportsChess960: false,
        supportsStandardArena: true,
        capabilities: Object.freeze({
            supportsThreads: false,
            supportsNNUE: true,
            supportsMultiPV: true,
            supportsSyzygy: false,
            browserCompatible: true,
            mobileCompatible: true,
            requiresCrossOriginIsolation: false
        }),
        availability: 'available',
        unavailableReason: null,
        runtimeIdentityExpectation: Object.freeze({
            family: 'Stockfish',
            namePattern: '^Stockfish\\s+19(?:\\.\\d+){0,2}\\s+Lite\\s+WASM(?:\\s.*)?$',
            authorPattern: '^the Stockfish developers \\(see AUTHORS file\\)(?:\\s.*)?$',
            requireName: true,
            requireAuthor: true
        }),
        enabled: true,
        notes: 'CAISSA Stockfish 19 Lite single-threaded WASM/NNUE runtime'
    });

    const ARENA_PROVIDERS = Object.freeze(Object.fromEntries([
        ...Object.values(ENGINES),
        STOCKFISH_18_ARENA_PROVIDER,
        STOCKFISH_19_ARENA_PROVIDER
    ].filter(provider => provider.supportsStandardArena === true)
        .map(provider => [provider.id, provider])));
    const ARENA_PROVIDER_IDS = Object.freeze(Object.keys(ARENA_PROVIDERS));

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
            id: config.id,
            providerId: options.providerId || config.providerId || config.id,
            requestedEngineId: options.requestedEngineId || config.id,
            workerPath: config.workerPath,
            wasmPath: config.wasmPath,
            expectedUci: config.expectedUci,
            runtimeIdentityExpectation: config.runtimeIdentityExpectation || null
        });
    }

    function markArenaProviderUnavailable(id, reason = 'Engine startup failed for this session') {
        if (!arenaProviderIds().includes(id)) return false;
        const provider = arenaProviderById(id);
        if (!provider || provider.availability !== 'available') return false;
        const affectedProviderIds = arenaProviderIds().filter(providerId => {
            const candidate = arenaProviderById(providerId);
            return candidate?.availability === 'available'
                && candidate.runtimeId === provider.runtimeId;
        });
        affectedProviderIds.forEach(providerId => arenaSessionUnavailable.set(
            providerId,
            String(reason || 'Engine startup failed for this session')
        ));
        window.dispatchEvent?.(new CustomEvent('caissa-arena-provider-availability', {
            detail: { providerId: id, providerIds: affectedProviderIds, available: false }
        }));
        return true;
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
            return createConfiguredEngine(this.get(id), options);
        },
        listArenaProviders() {
            return arenaProviderIds().map(id => arenaProviderSnapshot(arenaProviderById(id)));
        },
        getArenaProvider(id) {
            return arenaProviderSnapshot(arenaProviderById(id));
        },
        getArenaProviderAvailability(id) {
            if (!arenaProviderById(id)) {
                return Object.freeze({ available: false, reason: 'Unknown engine provider' });
            }
            return arenaAvailability(arenaProviderById(id));
        },
        registerArenaPreviewProvider(provider, factory) {
            if (provider?.id !== 'lc0-maia-1100-preview' ||
                window.CaissaArenaPreview?.enabled !== true ||
                typeof factory !== 'function' || arenaPreviewProviders.size)
                return false;
            arenaPreviewProviders.set(provider.id, Object.freeze({ ...provider }));
            arenaPreviewFactories.set(provider.id, factory);
            return true;
        },
        isArenaProviderAvailable(id) {
            return this.getArenaProviderAvailability(id).available;
        },
        markArenaProviderUnavailable(id, reason) {
            return markArenaProviderUnavailable(id, reason);
        },
        resetArenaSessionAvailability() {
            arenaSessionUnavailable.clear();
        },
        createArenaEngine(id, options = {}) {
            const provider = this.getArenaProvider(id);
            if (!provider || !provider.enabled) return null;
            if (arenaPreviewFactories.has(id)) return arenaPreviewFactories.get(id)(provider, options);
            const externalUnavailable = options.onRuntimeUnavailable;
            return createConfiguredEngine(provider, {
                ...options,
                providerId: provider.id,
                requestedEngineId: id,
                requireRuntimeIdentity: true,
                onRuntimeUnavailable: (failure) => {
                    const reason = failure?.message || 'Engine startup failed for this session';
                    markArenaProviderUnavailable(provider.id, reason);
                    externalUnavailable?.(failure);
                }
            });
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
