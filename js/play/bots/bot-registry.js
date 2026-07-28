(function installBotRegistry(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const catalog = [
        {
            schemaVersion: '1.0.0', id: 'caissa-seed', version: 1, name: 'Caissa Seed',
            shortName: 'Seed', description: 'A forgiving machine opponent with a very shallow search.',
            difficultyBand: 'beginner', calibrationStatus: 'estimated', enginePresetId: 'seed-depth-2',
            availability: { enabled: true, qaOnly: true, locked: false },
            presentation: { tagline: 'A gentle first machine game.', strengths: ['Always chooses a legal engine move.'],
                limitations: ['Shallow search can miss tactics.'] }
        },
        {
            schemaVersion: '1.0.0', id: 'caissa-trail', version: 1, name: 'Caissa Trail',
            shortName: 'Trail', description: 'A casual machine opponent with a short bounded search.',
            difficultyBand: 'casual', calibrationStatus: 'estimated', enginePresetId: 'trail-depth-5',
            availability: { enabled: true, qaOnly: true, locked: false },
            presentation: { tagline: 'A short-search casual challenge.', strengths: ['Searches farther than Seed.'],
                limitations: ['Still misses deeper combinations.'] }
        },
        {
            schemaVersion: '1.0.0', id: 'caissa-grove', version: 1, name: 'Caissa Grove',
            shortName: 'Grove', description: 'An intermediate machine opponent with a deeper bounded search.',
            difficultyBand: 'intermediate', calibrationStatus: 'internally-tested', enginePresetId: 'grove-depth-9',
            availability: { enabled: true, qaOnly: true, locked: false },
            presentation: { tagline: 'More time to examine each position.', strengths: ['Deeper search than Trail.'],
                limitations: ['Not formally human-rating calibrated.'] }
        },
        {
            schemaVersion: '1.0.0', id: 'caissa-summit', version: 1, name: 'Caissa Summit',
            shortName: 'Summit', description: 'The strongest initial bot preset with the deepest bounded search.',
            difficultyBand: 'advanced', calibrationStatus: 'internally-tested', enginePresetId: 'summit-depth-14',
            availability: { enabled: true, qaOnly: true, locked: false },
            presentation: { tagline: 'The deepest search in this QA catalog.', strengths: ['Deepest catalog search.'],
                limitations: ['Difficulty is relative, not an official Elo.'] }
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
        has: id => entries.has(id), getDefault: () => get('caissa-seed'),
        inspect: () => Object.freeze({ schemaVersion: SCHEMA_VERSION, size: entries.size, ...diagnostics })
    });
})(typeof window !== 'undefined' ? window : globalThis);
