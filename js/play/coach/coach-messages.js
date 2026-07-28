(function installCoachMessages(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const templates = Object.freeze({
        'development-reminder': Object.freeze({
            beginner: 'Development check: can another minor piece join the game?',
            novice: 'Before the next move, check whether an undeveloped piece can become active.'
        }),
        'king-safety': Object.freeze({
            beginner: 'King-safety check: is your king ready to become safer?',
            novice: 'Reassess king safety before beginning another plan.'
        }),
        'tactical-awareness': Object.freeze({
            beginner: 'Scan the position again: checks and captures deserve attention.',
            novice: 'What forcing checks or captures changed after that move?'
        }),
        'hanging-piece': Object.freeze({
            beginner: 'After that move, recheck whether every piece is protected.',
            novice: 'A piece may now be vulnerable; compare attackers and defenders.'
        })
    });
    function create(trigger, level) {
        const group = templates[trigger]; const message = group?.[level] || group?.novice || null;
        return message ? Object.freeze({ schemaVersion: SCHEMA_VERSION, trigger, message, revealsMove: false, includesPv: false }) : null;
    }
    global.CaissaCoachMessages = Object.freeze({ schemaVersion: SCHEMA_VERSION, templates, create });
})(typeof window !== 'undefined' ? window : globalThis);
