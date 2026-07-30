(function installHumanPlayComingLaterPolicy(global) {
    'use strict';
    const VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const templates = freeze({
        friends: {
            featureLabel: 'CAISSA friends',
            explanation: 'CAISSA friends are coming later. No social graph is active yet.',
            prerequisite: 'A real friend relationship and presence service.',
            alternative: 'Open FICS for current provider-owned live human chess.'
        },
        matchmaking: {
            featureLabel: 'CAISSA matchmaking',
            explanation: 'CAISSA matchmaking is coming later. No matchmaking backend is active.',
            prerequisite: 'A proprietary backend with identity, authority, and fair-play support.',
            alternative: 'Use the existing FICS gateway for live human chess.'
        },
        suggestions: {
            featureLabel: 'Suggested Players',
            explanation: 'Suggestions require real presence, rating, and availability data.',
            prerequisite: 'A trustworthy, current provider-qualified presence source.',
            alternative: 'Browse the existing FICS lobby.'
        },
        tournaments: {
            featureLabel: 'Tournament human entry',
            explanation: 'Tournament entry is coming later. No CAISSA tournament runtime is active.',
            prerequisite: 'An approved tournament service and human-game authority.',
            alternative: 'Open FICS or CAISSA Classic for currently supported provider surfaces.'
        }
    });
    global.CaissaHumanPlayComingLaterPolicy = freeze({
        schemaVersion: VERSION, templateIds: freeze(Object.keys(templates)), templates,
        get: id => templates[id] || null
    });
})(typeof window !== 'undefined' ? window : globalThis);
