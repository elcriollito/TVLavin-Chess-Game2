(function installEndgameKnowledgeMap(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const RELEASE_ID = 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84';
    const definitions = [
        ['endgame-activate-king', 'ku:endgames:pawn-foundations:activate-the-king', 'medium', 'activate-the-king', '1.1.0'],
        ['endgame-opposition', 'ku:endgames:pawn-foundations:direct-opposition', 'high', 'direct-opposition', '1.2.0'],
        ['endgame-support-passer', 'ku:endgames:pawn-foundations:convert-with-king-support', 'medium', 'convert-with-king-support', '1.1.0'],
        ['endgame-pawn-square', 'ku:endgames:pawn-foundations:rule-of-the-square', 'high', 'rule-of-the-square', '1.4.0']
    ];
    const entries = new Map(definitions.map(([triggerCode, unitId, minimumConfidence, slug, contentVersion]) =>
        [triggerCode, Object.freeze({ schemaVersion: SCHEMA_VERSION, triggerCode, unitId, minimumConfidence,
            supportedPhases: Object.freeze(['endgame', 'simplified-endgame', 'pawn-ending']),
            releaseId: RELEASE_ID, contentVersion,
            publicUrl: `/endgame-library?unit=endgames%2F${slug}` })]));
    const get = triggerCode => entries.get(triggerCode) || null;
    const list = () => Object.freeze([...entries.values()]);
    const validate = entry => Object.freeze({ valid: !!entry && entries.get(entry.triggerCode) === entry
        && /^ku:endgames:[a-z-]+:[a-z-]+$/.test(entry.unitId)
        && entry.releaseId === RELEASE_ID && entry.publicUrl.startsWith('/endgame-library?unit=endgames%2F') });
    global.CaissaEndgameKnowledgeMap = Object.freeze({
        schemaVersion: SCHEMA_VERSION, releaseId: RELEASE_ID, get, list, validate
    });
})(typeof window !== 'undefined' ? window : globalThis);
