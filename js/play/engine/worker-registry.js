(function(root, factory) {
    const api = factory(root.CaissaWorkerLifecycleContracts);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CaissaWorkerRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function(Contracts) {
    'use strict';
    if (!Contracts && typeof require === 'function') Contracts = require('./worker-lifecycle-contracts.js');
    function create() {
        const records = new Map();
        return Object.freeze({
            register(input) { const value=Contracts.normalizeContext(input); if(records.has(value.contextId)) throw new Error('Duplicate worker context'); records.set(value.contextId,value); return value; },
            update(id, patch) { const old=records.get(id); if(!old) throw new Error('Unknown worker context'); const value=Contracts.normalizeContext({...old,...patch,contextId:id,schemaVersion:Contracts.VERSION}); records.set(id,value); return value; },
            get(id) { return records.get(id) || null; },
            remove(id) { return records.delete(id); },
            inspect() { return Object.freeze([...records.values()]); },
            clear() { records.clear(); }
        });
    }
    return Object.freeze({ VERSION:'1.0.0', create });
});
