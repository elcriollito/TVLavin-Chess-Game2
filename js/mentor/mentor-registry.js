(function installMentorRegistry(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const ID = /^academyMentor[A-Z][A-Za-z]{1,31}$/;
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const dangerous = (value, seen = new WeakSet()) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(item => dangerous(item, seen));
    };
    const source = [
        ['academyMentorDaisy', 'Daisy', 'Friendly Beginner', ['beginner'], ['fundamentals']],
        ['academyMentorMya', 'Mya', 'Club Coach', ['beginner', 'novice'], ['openings']],
        ['academyMentorAlex', 'Alex', 'Strategic Mentor', ['novice', 'intermediate'], ['strategy']],
        ['academyMentorSophia', 'Sophia', 'Advanced Club Mentor', ['intermediate'], ['calculation']],
        ['academyMentorMorphy', 'Morphy', 'Attack Instructor', ['novice', 'intermediate'], ['attacking-chess']],
        ['academyMentorCapablanca', 'Capablanca', 'Endgame Professor', ['novice', 'intermediate'], ['endgames']],
        ['academyMentorTal', 'Tal', 'Tactical Wizard', ['novice', 'intermediate'], ['tactics']],
        ['academyMentorCaissa', 'CAISSA', 'Adaptive Academy', ['beginner', 'novice', 'intermediate'], ['general']]
    ];
    function create(input = {}) {
        if (dangerous(input) || !ID.test(input.id || '') || !Number.isInteger(input.version)
            || typeof input.name !== 'string' || input.name.length < 2 || input.name.length > 40
            || typeof input.title !== 'string' || input.title.length > 80
            || !Array.isArray(input.learnerLevels) || !Array.isArray(input.teachingFocuses))
            return freeze({ valid: false, reasonCode: 'INVALID_PROFILE', value: null });
        return freeze({ valid: true, reasonCode: 'PROFILE_VALID', value: freeze({
            schemaVersion: SCHEMA_VERSION, id: input.id, version: input.version,
            name: input.name, shortName: input.name, title: input.title,
            description: `${input.title} in CAISSA Academy.`,
            learnerLevels: [...input.learnerLevels], teachingFocuses: [...input.teachingFocuses],
            explanationStyle: 'concise-and-question-led', specialties: [...input.teachingFocuses],
            academyAffiliation: input.id, availability: 'foundation',
            capabilities: ['pre-game-goal', 'post-game-review-request', 'academy-integration'],
            presentation: { avatar: null }, metadata: { originalCaissaIdentity: true }
        }) });
    }
    const profiles = new Map(source.map(([id, name, title, learnerLevels, teachingFocuses]) => {
        const result = create({ id, version: 1, name, title, learnerLevels, teachingFocuses });
        return [id, result.value];
    }));
    const get = id => profiles.get(id) || null;
    const list = () => freeze([...profiles.values()]);
    const resolveDefault = () => get('academyMentorCaissa');
    const validate = profile => freeze({ valid: !!profile && get(profile.id) === profile,
        reasonCode: get(profile?.id) === profile ? 'PROFILE_VALID' : 'INVALID_PROFILE' });
    global.CaissaMentorRegistry = freeze({
        schemaVersion: SCHEMA_VERSION, create, validate, get, list, resolveDefault,
        diagnostics: freeze({ registeredProfiles: profiles.size, duplicateIds: 0, remoteProfiles: 0 })
    });
})(typeof window !== 'undefined' ? window : globalThis);
