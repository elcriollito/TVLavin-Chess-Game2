(function installBotPresets(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const FULL_POWER = Object.freeze({ depth: null, moveTimeMs: 2000 });
    const definitions = [
        { id: 'seed-depth-2', depth: 2, moveTimeMs: 80 },
        { id: 'trail-depth-5', depth: 5, moveTimeMs: 180 },
        { id: 'grove-depth-9', depth: 9, moveTimeMs: 450 },
        { id: 'summit-depth-14', depth: 14, moveTimeMs: 900 }
    ];
    const presets = new Map(definitions.map(item => [item.id, Object.freeze({
        schemaVersion: SCHEMA_VERSION, id: item.id, version: 1,
        engineOptions: Object.freeze({}),
        search: Object.freeze({ depth: item.depth, moveTimeMs: item.moveTimeMs, nodeLimit: null }),
        candidateSelection: Object.freeze({ enabled: false, multiPv: 1, selectionPolicy: 'bestmove' }),
        controlledError: Object.freeze({ enabled: false }),
        opening: Object.freeze({ enabled: false, reason: 'Deterministic engine search baseline' }),
        constraints: Object.freeze({ oneWorker: true, attributedRequestRequired: true })
    })]));

    function get(id) { return presets.get(id) || null; }
    function list() { return Object.freeze([...presets.values()]); }
    function validate(value) {
        const valid = !!value && value.schemaVersion === SCHEMA_VERSION && presets.get(value.id) === value
            && Number.isInteger(value.search?.depth) && value.search.depth >= 1 && value.search.depth <= 20
            && Number.isInteger(value.search?.moveTimeMs) && value.search.moveTimeMs >= 50
            && value.search.moveTimeMs <= 2000 && value.candidateSelection?.enabled === false
            && value.controlledError?.enabled === false;
        return Object.freeze({ valid, reasonCode: valid ? 'VALID' : 'INVALID_PRESET' });
    }
    global.CaissaBotPresets = Object.freeze({
        schemaVersion: SCHEMA_VERSION, get, list, validate,
        fullPower: FULL_POWER,
        toEngineSearch(id) {
            const preset = get(id);
            return preset ? Object.freeze({ depth: preset.search.depth }) : null;
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
