(function installPlayAccessibility(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const POLICY_VERSION = '1.0.0';
    const SURFACE_TYPES = Object.freeze([
        'navigation', 'board', 'panel', 'dialog', 'disclosure', 'status', 'action', 'list'
    ]);
    const STATES = Object.freeze([
        'ready', 'loading', 'disabled', 'locked', 'blocked', 'unavailable', 'coming-later', 'error'
    ]);
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const diagnostics = { validations: 0, rejected: 0, instances: 0 };

    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const safeText = (value, max) => typeof value === 'string' && value.trim().length > 0
        && value.trim().length <= max && !/[\u0000-\u001f<>]/.test(value) ? value.trim() : null;
    function dangerous(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(item => dangerous(item, seen));
    }

    function validateSurface(viewModel) {
        diagnostics.validations += 1;
        if (!viewModel || typeof viewModel !== 'object' || dangerous(viewModel)) {
            diagnostics.rejected += 1;
            return result(false, 'INVALID_SURFACE');
        }
        if (viewModel.schemaVersion !== SCHEMA_VERSION)
            return result(false, 'UNSUPPORTED_SCHEMA_VERSION');
        if (!SURFACE_TYPES.includes(viewModel.type) || !STATES.includes(viewModel.state)
            || !safeText(viewModel.label, 120)) {
            diagnostics.rejected += 1;
            return result(false, 'INVALID_SURFACE');
        }
        return result(true, 'VALID_SURFACE', {
            schemaVersion: SCHEMA_VERSION,
            type: viewModel.type,
            state: viewModel.state,
            label: viewModel.label.trim()
        });
    }

    function getReducedMotion() {
        return global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    }
    function getForcedColors() {
        return global.matchMedia?.('(forced-colors: active)')?.matches === true;
    }

    function create(root) {
        if (!root?.appendChild) return result(false, 'INVALID_HOST');
        const announcements = global.CaissaPlayAnnouncementManager;
        const focus = global.CaissaPlayFocusManager;
        if (!announcements || !focus) return result(false, 'MANAGER_UNAVAILABLE');
        const mounted = announcements.mount(root);
        if (!mounted.ok) return mounted;
        diagnostics.instances = 1;
        let disposed = false;
        return freeze({
            schemaVersion: SCHEMA_VERSION,
            policyVersion: POLICY_VERSION,
            announce: (messageId, options) => announcements.announce(messageId, options),
            captureFocus: trigger => focus.capture(trigger),
            moveFocus: (target, options = {}) => focus.moveFocus(target, { ...options, root }),
            restoreFocus: (token, fallback = root) => focus.restoreFocus(token, fallback),
            inspect: () => freeze({
                schemaVersion: SCHEMA_VERSION,
                disposed,
                reducedMotion: getReducedMotion(),
                forcedColors: getForcedColors(),
                focus: focus.inspect(),
                announcements: announcements.inspect()
            }),
            dispose: () => {
                if (disposed) return result(true, 'ALREADY_DISPOSED');
                announcements.dispose();
                focus.dispose();
                diagnostics.instances = 0;
                disposed = true;
                return result(true, 'DISPOSED');
            }
        });
    }

    global.CaissaPlayAccessibility = freeze({
        schemaVersion: SCHEMA_VERSION,
        policyVersion: POLICY_VERSION,
        surfaceTypes: SURFACE_TYPES,
        states: STATES,
        validateSurface,
        getReducedMotion,
        getForcedColors,
        create,
        inspect: () => freeze({ schemaVersion: SCHEMA_VERSION, ...diagnostics })
    });
})(typeof window !== 'undefined' ? window : globalThis);
