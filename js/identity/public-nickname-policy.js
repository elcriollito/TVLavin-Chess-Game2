const RESERVED_KEYS = new Set([
    'admin', 'administrator', 'anonymous', 'caissa', 'caissa admin',
    'caissa staff', 'caissa support', 'guest', 'moderator', 'official',
    'player', 'staff', 'support', 'system'
]);

// Reject the complete Unicode Default_Ignorable_Code_Point set. Keeping these
// code points in either the display value or the uniqueness key would allow
// visually equivalent reserved names and duplicate public identities.
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;
const ALLOWED = /^[\p{L}\p{N}\p{M} ._'’\-]+$/u;
const EDGE_SEPARATOR = /^[ ._'’\-]|[ ._'’\-]$/u;
const FALLBACK_NAMESPACE = /^player-[0-9a-f]{16}$/u;
const REPEATED_PUNCTUATION = /([._'’\-])\1{2,}/u;

export const PUBLIC_NICKNAME_POLICY_VERSION = 1;

const SCRIPT_TESTS = Object.freeze({
    Latin: /\p{Script=Latin}/u,
    Cyrillic: /\p{Script=Cyrillic}/u,
    Greek: /\p{Script=Greek}/u,
    Arabic: /\p{Script=Arabic}/u,
    Hebrew: /\p{Script=Hebrew}/u,
    Devanagari: /\p{Script=Devanagari}/u,
    Armenian: /\p{Script=Armenian}/u,
    Bengali: /\p{Script=Bengali}/u,
    Ethiopic: /\p{Script=Ethiopic}/u,
    Georgian: /\p{Script=Georgian}/u,
    Gujarati: /\p{Script=Gujarati}/u,
    Gurmukhi: /\p{Script=Gurmukhi}/u,
    Han: /\p{Script=Han}/u,
    Hiragana: /\p{Script=Hiragana}/u,
    Katakana: /\p{Script=Katakana}/u,
    Hangul: /\p{Script=Hangul}/u,
    Sinhala: /\p{Script=Sinhala}/u,
    Tamil: /\p{Script=Tamil}/u,
    Telugu: /\p{Script=Telugu}/u,
    Thai: /\p{Script=Thai}/u
});

export function normalizePublicNickname(value) {
    return String(value ?? '').trim().replace(/\s+/gu, ' ').normalize('NFC');
}

export function publicNicknameKey(value) {
    return normalizePublicNickname(value).normalize('NFKC').toLowerCase();
}

export function countGraphemes(value) {
    const normalized = String(value ?? '');
    if (globalThis.Intl?.Segmenter) {
        return [...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(normalized)].length;
    }
    return null;
}

export function validatePublicNickname(value, options = {}) {
    const raw = String(value ?? '');
    if (INVISIBLE_OR_CONTROL.test(raw)) {
        return failure('NICKNAME_INVISIBLE_CHARACTER', 'Invisible and directional control characters are not allowed.');
    }
    const normalized = normalizePublicNickname(value);
    if (!normalized && options.allowEmpty === true) {
        return {
            ok: true, value: null, key: null, graphemes: 0, scripts: [],
            policyVersion: PUBLIC_NICKNAME_POLICY_VERSION
        };
    }
    const graphemes = countGraphemes(normalized);
    if (graphemes === null) {
        return failure('NICKNAME_POLICY_UNAVAILABLE', 'Nickname validation is unavailable in this browser.');
    }
    if (graphemes < 3 || graphemes > 24 || Array.from(normalized).length > 40) {
        return failure('NICKNAME_LENGTH', 'Use 3–24 visible characters.');
    }
    if (!ALLOWED.test(normalized) || EDGE_SEPARATOR.test(normalized) || REPEATED_PUNCTUATION.test(normalized)) {
        return failure('NICKNAME_CHARACTERS', 'Use letters, numbers, spaces, periods, apostrophes, underscores, or hyphens.');
    }
    if (!/[\p{L}\p{N}]/u.test(normalized)) {
        return failure('NICKNAME_CHARACTERS', 'Include at least one letter or number.');
    }
    const key = publicNicknameKey(normalized);
    if (RESERVED_KEYS.has(key) || FALLBACK_NAMESPACE.test(key)) {
        return failure('NICKNAME_RESERVED', 'That name is reserved by CAISSA.');
    }
    const scripts = detectScripts(normalized);
    if (!isCoherentScriptSet(scripts)) {
        return failure('NICKNAME_MIXED_SCRIPTS', 'Use one writing system per nickname.');
    }
    return {
        ok: true, value: normalized, key, graphemes, scripts,
        policyVersion: PUBLIC_NICKNAME_POLICY_VERSION
    };
}

export function publicIdentityDisplay(identity) {
    return String(identity?.nickname || identity?.fallbackAlias || 'CAISSA Player');
}

function detectScripts(value) {
    const scripts = new Set();
    for (const character of value) {
        if (!/\p{L}/u.test(character)) continue;
        let matched = false;
        for (const [name, matcher] of Object.entries(SCRIPT_TESTS)) {
            if (matcher.test(character)) {
                scripts.add(name);
                matched = true;
                break;
            }
        }
        if (!matched) scripts.add('Unsupported');
    }
    return [...scripts].sort();
}

function isCoherentScriptSet(scripts) {
    if (scripts.includes('Unsupported')) return false;
    if (scripts.length <= 1) return true;
    const key = scripts.join('+');
    return new Set([
        'Han+Hiragana', 'Han+Katakana', 'Hiragana+Katakana',
        'Han+Hiragana+Katakana', 'Han+Hangul'
    ]).has(key);
}

function failure(code, message) {
    return { ok: false, code, message };
}

export const PUBLIC_NICKNAME_RULES = Object.freeze({
    policyVersion: PUBLIC_NICKNAME_POLICY_VERSION,
    minGraphemes: 3,
    maxGraphemes: 24,
    fallbackNamespace: 'Player-XXXXXXXXXXXXXXXX',
    normalization: 'NFC display / NFKC ECMAScript lowercase uniqueness / default-ignorables rejected',
    caseMapping: 'Unicode lowercase mapping, not full Unicode case folding'
});
