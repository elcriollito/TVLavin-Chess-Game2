(function installKnowledgeMappingRegistry(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0'; const MAX_ENTRIES = 12;
    const entries = new Map(); const diagnostics = { registrations: 0, duplicates: 0 };
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    function register(result) {
        if (!global.CaissaKnowledgeMappingContracts?.validateResult?.(result)?.ok)
            return freeze({ ok: false, reasonCode: 'INVALID_KNOWLEDGE_MAPPING_RESULT', value: null });
        if (entries.has(result.mappingResultId)) {
            diagnostics.duplicates += 1;
            return freeze({ ok: true, reasonCode: 'DUPLICATE_MAPPING_RESULT',
                value: entries.get(result.mappingResultId) });
        }
        while (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value);
        entries.set(result.mappingResultId, result); diagnostics.registrations += 1;
        return freeze({ ok: true, reasonCode: 'MAPPING_RESULT_REGISTERED', value: result });
    }
    global.CaissaKnowledgeMappingRegistry = freeze({
        schemaVersion: SCHEMA_VERSION, register, get: id => entries.get(id) || null,
        findForReplayStep: stepId => freeze([...entries.values()].flatMap(result =>
            result.mappings.filter(mapping => mapping.replayStepId === stepId))),
        inspect: () => freeze({ schemaVersion: SCHEMA_VERSION, entries: entries.size,
            maxEntries: MAX_ENTRIES, ...diagnostics }),
        dispose: () => { entries.clear(); return freeze({ ok: true, reasonCode: 'DISPOSED' }); }
    });
})(typeof window !== 'undefined' ? window : globalThis);
