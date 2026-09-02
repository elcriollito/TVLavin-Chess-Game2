(function installBotSeasonalManifest(root) {
    'use strict';
    const freeze = value => Object.freeze(value);
    root.CaissaBotSeasonalManifest = freeze({
        schemaVersion: '1.0.0',
        collections: freeze([])
    });
})(typeof window !== 'undefined' ? window : globalThis);
