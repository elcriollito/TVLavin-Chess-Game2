(function installBotRegistry(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const catalog = [
        {
            schemaVersion: '1.0.0', id: 'beginner', version: 1, name: 'Beginner',
            shortName: 'Beginner', description: 'Intentionally limited with bounded, legal inaccuracies.',
            difficultyBand: 'beginner', calibrationStatus: 'estimated', enginePresetId: 'seed-depth-2',
            ratingStatus: 'Unrated · calibration pending', personalityPolicyId: 'beginner',
            availability: { enabled: true, qaOnly: true, locked: false },
            presentation: { tagline: 'Forgiving, bounded choices.', strengths: ['Always chooses an allowed legal move.'],
                limitations: ['Not calibrated to human ratings.'] }
        },
        {
            schemaVersion: '1.0.0', id: 'casual', version: 1, name: 'Casual',
            shortName: 'Casual', description: 'Balanced recreational choices with limited variation.',
            difficultyBand: 'casual', calibrationStatus: 'estimated', enginePresetId: 'trail-depth-5',
            ratingStatus: 'Unrated · calibration pending', personalityPolicyId: 'casual',
            availability: { enabled: true, qaOnly: true, locked: false },
            presentation: { tagline: 'Balanced recreational play.', strengths: ['Favors stronger choices than Beginner.'],
                limitations: ['Not calibrated to human ratings.'] }
        },
        {
            schemaVersion: '1.0.0', id: 'tactical', version: 1, name: 'Tactical',
            shortName: 'Tactical', description: 'Prefers sound forcing choices inside a safe evaluation window.',
            difficultyBand: 'intermediate', calibrationStatus: 'internally-tested', enginePresetId: 'grove-depth-9',
            ratingStatus: 'Unrated · calibration pending', personalityPolicyId: 'tactical',
            availability: { enabled: true, qaOnly: true, locked: false },
            presentation: { tagline: 'Seeks sound forcing play.', strengths: ['Prefers safe checks, captures, and promotions.'],
                limitations: ['Does not simulate a human personality.'] }
        },
        {
            schemaVersion: '1.0.0', id: 'solid', version: 1, name: 'Solid',
            shortName: 'Solid', description: 'Prefers lower immediate tactical exposure among safe choices.',
            difficultyBand: 'advanced', calibrationStatus: 'internally-tested', enginePresetId: 'summit-depth-14',
            ratingStatus: 'Unrated · calibration pending', personalityPolicyId: 'solid',
            availability: { enabled: true, qaOnly: true, locked: false },
            presentation: { tagline: 'Prefers stable, safe choices.', strengths: ['Reduces immediate forcing exposure.'],
                limitations: ['Does not claim human positional understanding.'] }
        }
    ];
    const entries = new Map();
    const diagnostics = { registrations: 0, rejected: 0, reads: 0 };

    function register(profile) {
        const normalized = global.CaissaBotProfile?.normalize?.(profile);
        if (!normalized?.ok || entries.has(profile?.id)
            || !global.CaissaBotPresets?.validate?.(global.CaissaBotPresets.get(profile?.enginePresetId))?.valid) {
            diagnostics.rejected += 1;
            return Object.freeze({ ok: false, reasonCode: entries.has(profile?.id) ? 'DUPLICATE_ID' : 'INVALID_PROFILE' });
        }
        entries.set(normalized.value.id, normalized.value); diagnostics.registrations += 1;
        return Object.freeze({ ok: true, reasonCode: 'REGISTERED', value: normalized.value });
    }
    catalog.forEach(register);
    function get(id) { diagnostics.reads += 1; return entries.get(id) || null; }
    function list(options = {}) {
        diagnostics.reads += 1;
        return Object.freeze([...entries.values()].filter(item =>
            (!options.difficultyBand || item.difficultyBand === options.difficultyBand)
            && (options.enabled !== true || item.availability.enabled)).sort((a, b) =>
            global.CaissaBotProfile.difficultyBands.indexOf(a.difficultyBand)
            - global.CaissaBotProfile.difficultyBands.indexOf(b.difficultyBand)));
    }
    global.CaissaBotRegistry = Object.freeze({
        schemaVersion: SCHEMA_VERSION, register, get, list,
        validate: profile => global.CaissaBotProfile.validate(profile),
        has: id => entries.has(id), getDefault: () => get('beginner'),
        inspect: () => Object.freeze({ schemaVersion: SCHEMA_VERSION, size: entries.size, ...diagnostics })
    });
})(typeof window !== 'undefined' ? window : globalThis);
