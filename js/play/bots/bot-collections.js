(function installBotCollections(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const ID = /^[a-z][a-z0-9-]{2,63}$/;
    const DANGEROUS = new Set(['__proto__', 'prototype', 'constructor']);
    const KINDS = Object.freeze(['classic', 'seasonal', 'special-event']);
    const STATES = Object.freeze(['scheduled', 'active', 'expired', 'disabled']);
    const AVAILABILITY = Object.freeze(['planned', 'qa-only', 'available', 'locked']);
    const CATEGORIES = Object.freeze([
        Object.freeze({ id: 'new-to-chess', label: 'New to Chess', piece: 'pawn', symbol: '♟', min: 100, max: 249, order: 1 }),
        Object.freeze({ id: 'beginner', label: 'Beginner', piece: 'bishop', symbol: '♝', min: 250, max: 999, order: 2 }),
        Object.freeze({ id: 'intermediate', label: 'Intermediate', piece: 'knight', symbol: '♞', min: 1000, max: 1499, order: 3 }),
        Object.freeze({ id: 'advanced', label: 'Advanced', piece: 'rook', symbol: '♜', min: 1500, max: 1999, order: 4 }),
        Object.freeze({ id: 'master', label: 'Master', piece: 'queen', symbol: '♛', min: 2000, max: 2199, order: 5 }),
        Object.freeze({ id: 'candidate-master', label: 'CM', piece: 'king', symbol: '♚', min: 2200, max: 2299, order: 6 }),
        Object.freeze({ id: 'fide-master', label: 'FM', piece: 'king', symbol: '♚', min: 2300, max: 2399, order: 7 }),
        Object.freeze({ id: 'international-master', label: 'IM', piece: 'king', symbol: '♚', min: 2400, max: 2499, order: 8 }),
        Object.freeze({ id: 'grandmaster', label: 'GM', piece: 'king', symbol: '♚', min: 2500, max: 3200, order: 9 }),
        Object.freeze({ id: 'king-bots', label: 'Legends & Champions', piece: 'king', symbol: '♚', min: null, max: null, order: 10 })
    ]);
    const CLASSIC_ROSTER = Object.freeze([
        ['pip', 'Pip', 'new-to-chess', 100], ['nia', 'Nia', 'new-to-chess', 150], ['teo', 'Teo', 'new-to-chess', 200],
        ['milo', 'Milo', 'beginner', 250], ['luna', 'Luna', 'beginner', 350], ['nico', 'Nico', 'beginner', 450],
        ['iris', 'Iris', 'beginner', 600], ['marco', 'Marco', 'beginner', 750], ['zoe', 'Zoe', 'beginner', 900],
        ['nora', 'Nora', 'intermediate', 1000], ['leo', 'Leo', 'intermediate', 1100], ['maya', 'Maya', 'intermediate', 1200],
        ['diego', 'Diego', 'intermediate', 1350], ['sofia', 'Sofia', 'intermediate', 1450],
        ['vera', 'Vera', 'advanced', 1500], ['adrian', 'Adrian', 'advanced', 1600], ['ines', 'Ines', 'advanced', 1700],
        ['roman', 'Roman', 'advanced', 1800], ['selene', 'Selene', 'advanced', 1900],
        ['cassia', 'Cassia', 'master', 2000], ['dante', 'Dante', 'master', 2050],
        ['dorian', 'Dorian', 'master', 2100], ['maia', 'Maia', 'master', 2150],
        ['manuel', 'Manuel', 'candidate-master', 2200], ['pepe', 'Pepe', 'candidate-master', 2250],
        ['elena', 'Elena', 'fide-master', 2300], ['orion', 'Orion', 'fide-master', 2350],
        ['athena', 'Athena', 'international-master', 2400], ['lyra', 'Lyra', 'international-master', 2450],
        ['helios', 'Helios', 'grandmaster', 2500], ['caelus', 'Caelus', 'grandmaster', 2550],
        ['aurora', 'Aurora', 'grandmaster', 2600], ['atlas', 'Atlas', 'grandmaster', 2650],
        ['cyra', 'Cyra', 'grandmaster', 2700], ['evander', 'Evander', 'grandmaster', 2750],
        ['freya', 'Freya', 'grandmaster', 2800], ['galen', 'Galen', 'grandmaster', 2850],
        ['isolde', 'Isolde', 'grandmaster', 2900], ['juno', 'Juno', 'grandmaster', 2950],
        ['leander', 'Leander', 'grandmaster', 3000], ['minerva', 'Minerva', 'grandmaster', 3050],
        ['octavia', 'Octavia', 'grandmaster', 3100], ['perseus', 'Perseus', 'grandmaster', 3150],
        ['rhea', 'Rhea', 'grandmaster', 3200]
    ].map(([id, name, categoryId, targetStrength]) => Object.freeze({ id, name, categoryId, targetStrength,
        availability: 'qa-only', engineProfileId: null, strengthProfileId: `strength-${targetStrength}`,
        personalityProfileId: `strength-${targetStrength}`,
        artwork: Object.freeze({ type: 'chess-piece', variant: 'classic' }) })));

    function freeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value); Object.values(value).forEach(item => freeze(item, seen)); return Object.freeze(value);
    }
    const safeObject = value => value && typeof value === 'object' && !Array.isArray(value)
        && !Object.keys(value).some(key => DANGEROUS.has(key));
    const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
    const category = id => CATEGORIES.find(item => item.id === id) || null;
    function validateBot(bot) {
        const errors = [];
        if (!safeObject(bot)) return freeze({ valid: false, errors: ['Bot must be a safe object.'] });
        if (!ID.test(bot.id || '')) errors.push('Invalid bot ID.');
        if (!text(bot.name, 40)) errors.push('Invalid bot name.');
        const group = category(bot.categoryId);
        if (!group) errors.push('Invalid bot category.');
        if (!Number.isInteger(bot.targetStrength) || bot.targetStrength < 100 || bot.targetStrength > 3200)
            errors.push('Invalid target strength.');
        if (group && group.min !== null && (bot.targetStrength < group.min || bot.targetStrength > group.max))
            errors.push('Target strength is outside its category.');
        if (!AVAILABILITY.includes(bot.availability)) errors.push('Invalid bot availability.');
        const engineReady = ID.test(bot.engineProfileId || '') && root.CaissaBotRegistry?.has?.(bot.engineProfileId) === true;
        const strengthReady = ID.test(bot.strengthProfileId || '') && root.CaissaBotStrengthLayer?.has?.(bot.strengthProfileId) === true;
        if (bot.availability !== 'planned' && !engineReady && !strengthReady) errors.push('Executable profile is unavailable.');
        if (engineReady && strengthReady) errors.push('Bot cannot own two executable profiles.');
        if (bot.engineProfileId != null && !ID.test(bot.engineProfileId || '')) errors.push('Invalid engine profile ID.');
        if (bot.strengthProfileId != null && !ID.test(bot.strengthProfileId || '')) errors.push('Invalid strength profile ID.');
        if (strengthReady && root.CaissaBotStrengthLayer.get(bot.strengthProfileId)?.targetStrength !== bot.targetStrength)
            errors.push('Strength profile target mismatch.');
        if (bot.personalityProfileId !== null && !ID.test(bot.personalityProfileId || '')) errors.push('Invalid personality profile ID.');
        if (!safeObject(bot.artwork) || bot.artwork.type !== 'chess-piece' || !text(bot.artwork.variant, 32))
            errors.push('Invalid artwork metadata.');
        return freeze({ valid: errors.length === 0, errors });
    }
    function timestamp(value) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
    function validate(collection) {
        const errors = [];
        if (!safeObject(collection)) return freeze({ valid: false, errors: ['Collection must be a safe object.'] });
        if (collection.schemaVersion !== SCHEMA_VERSION) errors.push('Unsupported collection schema.');
        if (!ID.test(collection.id || '')) errors.push('Invalid collection ID.');
        if (!text(collection.title, 80)) errors.push('Invalid collection title.');
        if (!KINDS.includes(collection.kind)) errors.push('Invalid collection kind.');
        if (typeof collection.enabled !== 'boolean') errors.push('Invalid enabled flag.');
        if (!Number.isInteger(collection.priority) || collection.priority < 0 || collection.priority > 1000)
            errors.push('Invalid collection priority.');
        if (!safeObject(collection.theme) || !ID.test(collection.theme.id || '') || !text(collection.theme.label, 60))
            errors.push('Invalid collection theme.');
        const scheduled = collection.kind !== 'classic';
        if (!safeObject(collection.schedule)) errors.push('Invalid collection schedule.');
        else if (scheduled) {
            const start = timestamp(collection.schedule.startAt); const end = timestamp(collection.schedule.endAt);
            if (start === null || end === null || start >= end) errors.push('Invalid seasonal schedule.');
        } else if (collection.schedule.startAt !== null || collection.schedule.endAt !== null)
            errors.push('Classic collection cannot expire.');
        if (!Array.isArray(collection.bots) || collection.bots.length > 64) errors.push('Invalid bot roster.');
        else {
            const ids = new Set();
            for (const bot of collection.bots) {
                const result = validateBot(bot); if (!result.valid) errors.push(...result.errors.map(error => `${bot?.id || 'bot'}: ${error}`));
                if (ids.has(bot?.id)) errors.push('Duplicate bot ID.'); else ids.add(bot?.id);
            }
        }
        return freeze({ valid: errors.length === 0, errors });
    }
    function normalize(collection) {
        const validation = validate(collection);
        if (!validation.valid) return freeze({ ok: false, reasonCode: 'INVALID_COLLECTION', validation, value: null });
        return freeze({ ok: true, reasonCode: 'COLLECTION_ACCEPTED', validation,
            value: freeze(JSON.parse(JSON.stringify(collection))) });
    }
    function resolveState(collection, at = Date.now()) {
        if (!validate(collection).valid || !Number.isFinite(at)) return null;
        if (!collection.enabled) return 'disabled';
        if (collection.kind === 'classic') return 'active';
        const start = timestamp(collection.schedule.startAt); const end = timestamp(collection.schedule.endAt);
        return at < start ? 'scheduled' : at >= end ? 'expired' : 'active';
    }

    const CLASSIC = freeze({ schemaVersion: SCHEMA_VERSION, id: 'classic', title: 'Classic Bots', kind: 'classic',
        enabled: true, priority: 100, schedule: freeze({ startAt: null, endAt: null }),
        theme: freeze({ id: 'classic', label: 'Classic' }), bots: CLASSIC_ROSTER });

    root.CaissaBotCollections = freeze({ schemaVersion: SCHEMA_VERSION, kinds: KINDS, states: STATES,
        availabilities: AVAILABILITY, categories: CATEGORIES, classic: CLASSIC, category, validateBot,
        validate, normalize, resolveState });
})(typeof window !== 'undefined' ? window : globalThis);
