(function installCoachRegistry(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const catalog = [
        {
            schemaVersion: '1.0.0', id: 'caissa-foundations', version: 2, name: 'CAISSA Foundations',
            shortName: 'Foundations', description: 'Session guidance for development and king-safety habits.',
            learnerLevel: 'beginner', teachingFocus: 'opening-principles', communicationStyle: 'supportive',
            engineFoundation: { botProfileId: 'caissa-trail', presetId: 'trail-depth-5' },
            interventionPolicyId: 'foundations-bounded', feedbackPolicyId: 'template-post-move',
            evaluationPolicy: 'hidden', presentation: { tagline: 'Build sound habits one move at a time.',
                strengths: ['Rule-based opening reminders.'], limitations: ['No deep strategic interpretation.'], avatar: 'F' },
            availability: { enabled: true, qaOnly: true, locked: false }, metadata: { localeKey: 'coach.foundations' }
        },
        {
            schemaVersion: '1.0.0', id: 'caissa-tactical-awareness', version: 2, name: 'CAISSA Tactical Awareness',
            shortName: 'Tactical', description: 'Session prompts to recheck immediate checks, captures, and threats.',
            learnerLevel: 'novice', teachingFocus: 'tactical-awareness', communicationStyle: 'question-led',
            engineFoundation: { botProfileId: 'caissa-grove', presetId: 'grove-depth-9' },
            interventionPolicyId: 'tactical-bounded', feedbackPolicyId: 'template-post-move',
            evaluationPolicy: 'hidden', presentation: { tagline: 'Pause and scan the position after each move.',
                strengths: ['Legal-move tactical awareness prompts.'], limitations: ['Never identifies the exact move.'], avatar: 'T' },
            availability: { enabled: true, qaOnly: true, locked: false }, metadata: { localeKey: 'coach.tactical' }
        }
    ];
    const entries = new Map(); const diagnostics = { registrations: 0, rejected: 0, reads: 0 };
    function register(value) {
        const normalized = global.CaissaCoachProfile.normalize(value);
        const policy = global.CaissaCoachInterventionPolicy.get(value?.interventionPolicyId);
        const preset = global.CaissaBotPresets.get(value?.engineFoundation?.presetId);
        if (!normalized.ok || entries.has(value?.id) || !policy || !preset) {
            diagnostics.rejected += 1; return Object.freeze({ ok: false, reasonCode: entries.has(value?.id) ? 'DUPLICATE_ID' : 'INVALID_PROFILE' });
        }
        entries.set(value.id, normalized.value); diagnostics.registrations += 1;
        return Object.freeze({ ok: true, reasonCode: 'REGISTERED', value: normalized.value });
    }
    catalog.forEach(register);
    const get = id => { diagnostics.reads += 1; return entries.get(id) || null; };
    const list = () => { diagnostics.reads += 1; return Object.freeze([...entries.values()].filter(item => item.availability.enabled)); };
    global.CaissaCoachRegistry = Object.freeze({
        schemaVersion: SCHEMA_VERSION, register, get, list, getDefault: () => get('caissa-foundations'),
        inspect: () => Object.freeze({ schemaVersion: SCHEMA_VERSION, size: entries.size, ...diagnostics })
    });
})(typeof window !== 'undefined' ? window : globalThis);
