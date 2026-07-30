(function installHumanPlaySectionPolicy(global) {
    'use strict';
    const VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const sections = freeze({
        friendsOnline: {
            label: 'Friends Online', category: 'coming-later', source: 'future-caissa-network',
            reasonCode: 'FRIEND_SYSTEM_UNAVAILABLE', itemCount: 0,
            title: 'CAISSA friends are coming later',
            message: 'No social graph or friend presence service is active. Open FICS for provider-owned live chess.',
            actions: []
        },
        availablePlayers: {
            label: 'Available Players', category: 'unavailable', source: 'fics',
            reasonCode: 'PRESENCE_SOURCE_UNAVAILABLE', itemCount: 0,
            title: 'Player data is unavailable here',
            message: 'Simplified Play has no safe normalized FICS presence snapshot. Open the provider-owned FICS lobby.',
            actions: ['open-fics', 'open-classic']
        },
        challenges: {
            label: 'Challenges', category: 'unavailable', source: 'fics',
            reasonCode: 'CHALLENGE_EVENT_STREAM_UNAVAILABLE', itemCount: 0,
            title: 'Challenge events are unavailable here',
            message: 'FICS owns challenge flows; Simplified Play has no normalized challenge event stream.',
            actions: ['open-fics']
        },
        recentOpponents: {
            label: 'Recent Opponents', category: 'blocked', source: 'future-caissa-network',
            reasonCode: 'HUMAN_HISTORY_UNAVAILABLE', itemCount: 0,
            title: 'Human game history is unavailable',
            message: 'No provider-authoritative human GameRecord history exists in Simplified Play.',
            actions: []
        },
        suggestedPlayers: {
            label: 'Suggested Players', category: 'coming-later', source: 'future-caissa-network',
            reasonCode: 'PRESENCE_SOURCE_UNAVAILABLE', itemCount: 0,
            title: 'Suggested Players are coming later',
            message: 'Suggestions require real presence, rating, and availability data.',
            actions: []
        }
    });
    global.CaissaHumanPlaySectionTruthPolicy = freeze({
        schemaVersion: VERSION, sectionIds: freeze(Object.keys(sections)), sections,
        get: id => sections[id] || null
    });
})(typeof window !== 'undefined' ? window : globalThis);
