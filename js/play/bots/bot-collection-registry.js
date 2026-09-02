(function installBotCollectionRegistry(root) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const entries = new Map();
    const diagnostics = { registrations: 0, rejected: 0, reads: 0 };
    const freeze = value => Object.freeze(value);
    function register(collection) {
        const normalized = root.CaissaBotCollections?.normalize?.(collection);
        if (!normalized?.ok || entries.has(collection?.id)) {
            diagnostics.rejected += 1;
            return freeze({ ok: false, reasonCode: entries.has(collection?.id) ? 'DUPLICATE_ID' : 'INVALID_COLLECTION' });
        }
        entries.set(normalized.value.id, normalized.value); diagnostics.registrations += 1;
        return freeze({ ok: true, reasonCode: 'REGISTERED', value: normalized.value });
    }
    register(root.CaissaBotCollections.classic);
    function get(id) { diagnostics.reads += 1; return entries.get(id) || null; }
    function resolveBot(reference, options = {}) {
        diagnostics.reads += 1;
        if (typeof reference !== 'string' || reference.length < 3 || reference.length > 129) return null;
        if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
        const separator = reference.indexOf(':');
        const collectionId = separator > 0 ? reference.slice(0, separator) : 'classic';
        const botId = separator > 0 ? reference.slice(separator + 1) : reference;
        const collection = entries.get(collectionId); const at = Number.isFinite(options.at) ? options.at : Date.now();
        if (!collection || root.CaissaBotCollections.resolveState(collection, at) !== 'active') return null;
        const bot = collection.bots.find(item => item.id === botId);
        return bot ? freeze({ reference: collectionId === 'classic' ? bot.id : `${collectionId}:${bot.id}`,
            collection, bot, state: 'active' }) : null;
    }
    function list(options = {}) {
        diagnostics.reads += 1;
        if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
        const at = Number.isFinite(options.at) ? options.at : Date.now();
        const state = typeof options.state === 'string' ? options.state : null;
        return freeze([...entries.values()].map(collection => freeze({ collection,
            state: root.CaissaBotCollections.resolveState(collection, at) }))
            .filter(item => !state || item.state === state)
            .sort((a, b) => b.collection.priority - a.collection.priority
                || a.collection.id.localeCompare(b.collection.id)));
    }
    root.CaissaBotCollectionRegistry = freeze({ schemaVersion: SCHEMA_VERSION, register, get, resolveBot, list,
        listActive: options => list({ ...(options && typeof options === 'object' && !Array.isArray(options) ? options : {}), state: 'active' }),
        has: id => entries.has(id),
        inspect: () => freeze({ schemaVersion: SCHEMA_VERSION, size: entries.size, ...diagnostics }) });
})(typeof window !== 'undefined' ? window : globalThis);
