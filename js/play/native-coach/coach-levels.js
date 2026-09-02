(function installNativeCoachLevels(root) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const LEVELS = freeze([
        { id: 'casual', label: 'Casual', opponentStrength: { targetElo: 500 },
            teachingStrength: { id: 'foundational', assistanceLevel: 'more-help', focus: 'balanced' },
            coachPersonality: { id: 'warm-calm', minimumPlyGap: 8, maximumAutomaticMessages: 4 } },
        { id: 'beginner', label: 'Beginner', opponentStrength: { targetElo: 800 },
            teachingStrength: { id: 'foundational', assistanceLevel: 'more-help', focus: 'safety' },
            coachPersonality: { id: 'warm-guiding', minimumPlyGap: 6, maximumAutomaticMessages: 6 } },
        { id: 'intermediate', label: 'Intermediate', opponentStrength: { targetElo: 1200 },
            teachingStrength: { id: 'developmental', assistanceLevel: 'standard', focus: 'balanced' },
            coachPersonality: { id: 'encouraging', minimumPlyGap: 6, maximumAutomaticMessages: 6 } },
        { id: 'advanced', label: 'Advanced', opponentStrength: { targetElo: 1600 },
            teachingStrength: { id: 'analytical', assistanceLevel: 'standard', focus: 'tactics' },
            coachPersonality: { id: 'concise', minimumPlyGap: 8, maximumAutomaticMessages: 5 } },
        { id: 'expert', label: 'Expert', opponentStrength: { targetElo: 2000 },
            teachingStrength: { id: 'deep', assistanceLevel: 'standard', focus: 'tactics' },
            coachPersonality: { id: 'concise', minimumPlyGap: 8, maximumAutomaticMessages: 5 } },
        { id: 'master', label: 'Master', opponentStrength: { targetElo: 2400 },
            teachingStrength: { id: 'deep', assistanceLevel: 'light', focus: 'balanced' },
            coachPersonality: { id: 'reserved', minimumPlyGap: 10, maximumAutomaticMessages: 4 } },
        { id: 'grandmaster', label: 'Grandmaster', opponentStrength: { targetElo: 2800 },
            teachingStrength: { id: 'expert-review', assistanceLevel: 'light', focus: 'balanced' },
            coachPersonality: { id: 'reserved', minimumPlyGap: 12, maximumAutomaticMessages: 3 } }
    ]);
    const byId = new Map(LEVELS.map(level => [level.id, level]));
    const get = id => byId.get(id) || null;
    const validate = level => !!level && typeof level === 'object' && get(level.id) === level
        && root.CaissaOpponentStrength?.isValid?.(level.opponentStrength.targetElo) === true
        && root.CaissaNativeCoachConfiguration?.levels?.includes?.(level.teachingStrength.assistanceLevel)
        && root.CaissaNativeCoachConfiguration?.focuses?.includes?.(level.teachingStrength.focus);
    root.CaissaNativeCoachLevels = freeze({ schemaVersion: SCHEMA_VERSION, defaultLevelId: 'casual', levels: LEVELS,
        publicOptions: freeze(LEVELS.map(({ id, label }) => ({ id, label }))), get, validate });
})(typeof window !== 'undefined' ? window : globalThis);
