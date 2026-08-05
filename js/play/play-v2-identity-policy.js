(function installPlayV2IdentityPolicy(root) {
    'use strict';
    const VERSION = '1.0.0';
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const contract = {
        schemaVersion: VERSION,
        contractId: `PlayV2IdentityPolicy@${VERSION}`,
        gamesOpponent: 'CAISSA',
        prohibitedGamesOpponent: 'CAISSA Engine',
        technicalEngineAttribution: 'preserved',
        classicLegacyIdentity: 'unchanged',
        savedHistoricalRecords: 'immutable',
        historicalPresentationNormalization: 'play-v2-only',
        botIdentity: 'profile-owned',
        coachIdentity: 'coach-boundary-owned',
        publicReady: false
    };
    const isPlayV2 = () => root.document?.body?.classList?.contains('caissa-play-v2-beta-active') === true;
    function gamesOpponentName() { return 'CAISSA'; }
    function normalizePlayV2Display(name, type = null) {
        if (type === 'engine' && (!name || /^caissa engine$/i.test(String(name).trim()))) return 'CAISSA';
        return typeof name === 'string' ? name : null;
    }
    root.CaissaPlayV2IdentityPolicy = freeze({ ...contract, isPlayV2, gamesOpponentName, normalizePlayV2Display });
})(typeof window !== 'undefined' ? window : globalThis);
