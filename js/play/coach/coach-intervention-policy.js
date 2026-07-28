(function installCoachInterventionPolicy(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const ASSISTANCE = Object.freeze(['silent', 'light', 'guided', 'teaching']);
    const TRIGGERS = Object.freeze(['development-reminder', 'tactical-awareness', 'hanging-piece', 'king-safety']);
    const policies = new Map([
        ['foundations-bounded', {
            schemaVersion: SCHEMA_VERSION, id: 'foundations-bounded', version: 1,
            minimumPlyGap: 4, cooldownPlies: 4, maximumInterventions: 3,
            allowedPhases: ['opening', 'middlegame'], allowedTriggers: ['development-reminder', 'king-safety'],
            revealEvaluation: false, revealBestMove: false, pauseClock: false,
            promptTypes: ['reminder', 'question'], constraints: { postMoveOnly: true }
        }],
        ['tactical-bounded', {
            schemaVersion: SCHEMA_VERSION, id: 'tactical-bounded', version: 1,
            minimumPlyGap: 3, cooldownPlies: 3, maximumInterventions: 4,
            allowedPhases: ['opening', 'middlegame', 'endgame'], allowedTriggers: ['tactical-awareness', 'hanging-piece'],
            revealEvaluation: false, revealBestMove: false, pauseClock: false,
            promptTypes: ['question', 'feedback'], constraints: { postMoveOnly: true }
        }]
    ].map(([id, value]) => [id, Object.freeze({ ...value, allowedPhases: Object.freeze(value.allowedPhases),
        allowedTriggers: Object.freeze(value.allowedTriggers), promptTypes: Object.freeze(value.promptTypes),
        constraints: Object.freeze(value.constraints) })]));
    const get = id => policies.get(id) || null;
    const list = () => Object.freeze([...policies.values()]);
    const validate = value => Object.freeze({ valid: !!value && policies.get(value.id) === value
        && value.revealBestMove === false && value.pauseClock === false
        && Number.isInteger(value.maximumInterventions) && value.maximumInterventions <= 6 });
    global.CaissaCoachInterventionPolicy = Object.freeze({
        schemaVersion: SCHEMA_VERSION, assistanceLevels: ASSISTANCE, triggers: TRIGGERS, get, list, validate
    });
})(typeof window !== 'undefined' ? window : globalThis);
