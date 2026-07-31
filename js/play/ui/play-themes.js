(function installPlayThemes(global) {
    'use strict';
    const VERSION = '1.0.0';
    const THEME_IDS = Object.freeze(['caissa-dark', 'caissa-light', 'system']);
    const TOKEN_KEYS = Object.freeze([
        'background', 'panelSurface', 'cardSurface', 'insetSurface', 'border', 'engravedEdge',
        'textPrimary', 'textSecondary', 'textMuted', 'positive', 'warning', 'critical',
        'informational', 'focusRing', 'selected', 'disabled', 'skeletonBase',
        'skeletonHighlight', 'overlay', 'shadow', 'evaluationNeutral',
        'evaluationPositive', 'evaluationNegative', 'boardStageBackdrop'
    ]);
    const BOARD_THEMES = Object.freeze(['current']);
    const PIECE_THEMES = Object.freeze(['wikipedia']);
    const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
    const deepFreeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(deepFreeze); Object.freeze(value);
        }
        return value;
    };
    const records = deepFreeze({
        'caissa-dark': {
            schemaVersion: VERSION, id: 'caissa-dark', label: 'CAISSA Dark', mode: 'dark',
            surfaceFamily: 'engraved-night',
            tokens: {
                background: '#101923', panelSurface: '#172434', cardSurface: '#1c2a3b',
                insetSurface: '#13202e', border: '#52647a', engravedEdge: '#d3a94d',
                textPrimary: '#f4f7fb', textSecondary: '#dbe3ec', textMuted: '#c5cfdb',
                positive: '#72c69a', warning: '#e3b966', critical: '#ed8080',
                informational: '#6fade7', focusRing: '#6fade7', selected: '#245f9c',
                disabled: '#8b96a4', skeletonBase: '#172434', skeletonHighlight: '#26384d',
                overlay: '#07101acc', shadow: '#0309123d', evaluationNeutral: '#8b96a4',
                evaluationPositive: '#f1f3f5', evaluationNegative: '#17202b',
                boardStageBackdrop: '#111d29'
            },
            contrastPolicy: { normalText: 4.5, largeText: 3, uiBoundary: 3, focusIndicator: 3 },
            texturePolicy: { allowed: true, maxOpacity: 0.08, maxContrast: 1.2, textExclusion: true },
            boardCompatibility: { supported: BOARD_THEMES, behavior: 'preserve-current' },
            pieceCompatibility: { supported: PIECE_THEMES, behavior: 'preserve-current' },
            classicCompatibility: 'isolated', productionReady: true
        },
        'caissa-light': {
            schemaVersion: VERSION, id: 'caissa-light', label: 'CAISSA Light', mode: 'light',
            surfaceFamily: 'warm-parchment',
            tokens: {
                background: '#eee8dc', panelSurface: '#e6ddcd', cardSurface: '#faf6ed',
                insetSurface: '#ddd2c1', border: '#80715e', engravedEdge: '#a27d35',
                textPrimary: '#211d18', textSecondary: '#403a31', textMuted: '#574f45',
                positive: '#2d704d', warning: '#805d17', critical: '#a13d3d',
                informational: '#285f92', focusRing: '#185fa5', selected: '#d7e4ef',
                disabled: '#77736d', skeletonBase: '#e6ddcd', skeletonHighlight: '#fffaf0',
                overlay: '#2d271f99', shadow: '#3a2d1d2e', evaluationNeutral: '#68625a',
                evaluationPositive: '#fffdf7', evaluationNegative: '#2a2d31',
                boardStageBackdrop: '#d9cfbf'
            },
            contrastPolicy: { normalText: 4.5, largeText: 3, uiBoundary: 3, focusIndicator: 3 },
            texturePolicy: { allowed: true, maxOpacity: 0.05, maxContrast: 1.15, textExclusion: true },
            boardCompatibility: { supported: BOARD_THEMES, behavior: 'preserve-current' },
            pieceCompatibility: { supported: PIECE_THEMES, behavior: 'preserve-current' },
            classicCompatibility: 'isolated', productionReady: false
        },
        system: {
            schemaVersion: VERSION, id: 'system', label: 'System preference', mode: 'system',
            surfaceFamily: 'resolved', tokens: {}, contrastPolicy: null, texturePolicy: null,
            boardCompatibility: { supported: BOARD_THEMES, behavior: 'preserve-current' },
            pieceCompatibility: { supported: PIECE_THEMES, behavior: 'preserve-current' },
            classicCompatibility: 'isolated', productionReady: false
        }
    });
    let preference = 'caissa-dark', resolved = 'caissa-dark', root = null, media = null, mediaHandler = null;
    const diagnostics = { applies: 0, resolutions: 0, rejected: 0, mediaListeners: 0,
        domMutations: 0, styleInjections: 0, storageWrites: 0, compatibilityWarnings: 0 };
    function result(ok, reasonCode, value = null) { return deepFreeze({ ok, reasonCode, value }); }
    function hasDangerousKey(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        for (const key of Reflect.ownKeys(value)) {
            if (typeof key !== 'string' || DANGEROUS_KEYS.has(key) || hasDangerousKey(value[key], seen)) return true;
        }
        return false;
    }
    function validateTheme(theme) {
        if (!theme || typeof theme !== 'object' || hasDangerousKey(theme))
            return result(false, 'INVALID_THEME');
        if (theme.schemaVersion !== VERSION) return result(false, 'UNSUPPORTED_SCHEMA_VERSION');
        if (!THEME_IDS.includes(theme.id) || records[theme.id] !== theme) return result(false, 'UNREGISTERED_THEME');
        if (theme.id !== 'system' && (Object.keys(theme.tokens).length !== TOKEN_KEYS.length
            || Object.keys(theme.tokens).some(key => !TOKEN_KEYS.includes(key))
            || Object.values(theme.tokens).some(value => typeof value !== 'string'
                || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value))))
            return result(false, 'INVALID_THEME_TOKENS');
        return result(true, 'THEME_VALID');
    }
    function resolveTheme(requested, systemPreference) {
        const selected = THEME_IDS.includes(requested) ? requested : 'caissa-dark';
        const systemMode = systemPreference === 'light' || systemPreference === 'dark'
            ? systemPreference : global.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
        diagnostics.resolutions += 1;
        return selected === 'system' ? `caissa-${systemMode}` : selected;
    }
    function removeMediaListener() {
        if (!media || !mediaHandler) return;
        media.removeEventListener?.('change', mediaHandler);
        if (!media.removeEventListener) media.removeListener?.(mediaHandler);
        media = null; mediaHandler = null; diagnostics.mediaListeners = 0;
    }
    function bindSystemListener() {
        removeMediaListener();
        media = global.matchMedia?.('(prefers-color-scheme: light)') || null;
        if (!media) return;
        mediaHandler = event => {
            if (preference !== 'system' || !root) return;
            const next = event.matches ? 'caissa-light' : 'caissa-dark';
            if (next === resolved) return;
            resolved = next; root.setAttribute('data-caissa-play-theme', resolved);
            diagnostics.domMutations += 1; diagnostics.resolutions += 1;
        };
        media.addEventListener?.('change', mediaHandler);
        if (!media.addEventListener) media.addListener?.(mediaHandler);
        diagnostics.mediaListeners = 1;
    }
    function applyTheme(themeId, target) {
        if (!THEME_IDS.includes(themeId)) {
            diagnostics.rejected += 1; return result(false, 'UNKNOWN_THEME');
        }
        const nextRoot = target || global.document?.body;
        if (!nextRoot?.setAttribute) {
            diagnostics.rejected += 1; return result(false, 'INVALID_ROOT');
        }
        if (root && root !== nextRoot) {
            root.removeAttribute('data-caissa-play-theme'); diagnostics.domMutations += 1;
        }
        preference = themeId; resolved = resolveTheme(themeId);
        root = nextRoot; root.setAttribute('data-caissa-play-theme', resolved);
        diagnostics.domMutations += 1; diagnostics.applies += 1;
        if (preference === 'system') bindSystemListener(); else removeMediaListener();
        return result(true, 'THEME_APPLIED', getActiveTheme());
    }
    function compatibility(kind, id, themeId) {
        const selected = records[THEME_IDS.includes(themeId) ? themeId : resolved];
        const actual = selected.id === 'system' ? records[resolved] : selected;
        const allowed = kind === 'board' ? BOARD_THEMES : PIECE_THEMES;
        const compatible = allowed.includes(id);
        if (!compatible) diagnostics.compatibilityWarnings += 1;
        return result(true, compatible ? 'COMPATIBLE' : 'PREFERENCE_PRESERVED_WITH_WARNING', {
            kind, id, themeId: actual.id, compatible, replacement: null, preferencePreserved: true
        });
    }
    function getActiveTheme() {
        return deepFreeze({ preference, resolvedThemeId: resolved, theme: records[resolved] });
    }
    function dispose() {
        removeMediaListener();
        if (root?.hasAttribute?.('data-caissa-play-theme')) {
            root.removeAttribute('data-caissa-play-theme'); diagnostics.domMutations += 1;
        }
        root = null; preference = 'caissa-dark'; resolved = 'caissa-dark';
        return result(true, 'DISPOSED');
    }
    global.CaissaPlayThemes = deepFreeze({
        schemaVersion: VERSION, themeSchemaVersion: VERSION, registrySchemaVersion: VERSION,
        policySchemaVersion: VERSION, compatibilitySchemaVersion: VERSION,
        themeIds: THEME_IDS, tokenKeys: TOKEN_KEYS,
        getThemes: () => deepFreeze(Object.values(records).slice()), getTheme: id => records[id] || null,
        validateTheme, resolveTheme, applyTheme, getActiveTheme,
        validateBoardCompatibility: (id, themeId = resolved) => compatibility('board', id, themeId),
        validatePieceCompatibility: (id, themeId = resolved) => compatibility('piece', id, themeId),
        inspect: () => deepFreeze({ ...diagnostics, preference, resolvedThemeId: resolved }),
        dispose
    });
})(typeof window !== 'undefined' ? window : globalThis);
