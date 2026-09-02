(function installBotCollectionLoader(root) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const MAX_COLLECTIONS = 16;
    let installed = 0; let rejected = 0;
    const freeze = value => Object.freeze(value);

    function install(manifest) {
        if (!manifest || manifest.schemaVersion !== SCHEMA_VERSION || !Array.isArray(manifest.collections)
            || manifest.collections.length > MAX_COLLECTIONS) {
            rejected += 1; return freeze({ ok: false, reasonCode: 'INVALID_MANIFEST', installed: 0 });
        }
        let accepted = 0;
        for (const collection of manifest.collections) {
            const result = root.CaissaBotCollectionRegistry?.register?.(collection);
            if (result?.ok) accepted += 1; else rejected += 1;
        }
        installed += accepted;
        return freeze({ ok: accepted === manifest.collections.length,
            reasonCode: accepted === manifest.collections.length ? 'MANIFEST_INSTALLED' : 'MANIFEST_PARTIAL',
            installed: accepted });
    }

    const initial = install(root.CaissaBotSeasonalManifest);
    root.CaissaBotCollectionLoader = freeze({ schemaVersion: SCHEMA_VERSION, maxCollections: MAX_COLLECTIONS,
        install, inspect: () => freeze({ schemaVersion: SCHEMA_VERSION, installed, rejected,
            initialReasonCode: initial.reasonCode }) });
})(typeof window !== 'undefined' ? window : globalThis);
