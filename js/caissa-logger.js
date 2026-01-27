/**
 * CAISSA Frontend Debug Logger
 *
 * Provides structured console logging with module tags.
 * Debug-level output is gated behind localStorage flag.
 * Errors are captured for future Sentry integration.
 * Exposes window.CaissaLog for global access.
 */

(function() {
    'use strict';

    const MAX_ERRORS = 50;

    // Captured errors buffer (Sentry-ready)
    window._caissaErrors = window._caissaErrors || [];

    function _isDebug() {
        try { return localStorage.getItem('caissa_debug') === 'true'; } catch (e) { return false; }
    }

    function _prefix(module) {
        return '[CAISSA:' + (module || 'app') + ']';
    }

    window.CaissaLog = {

        /**
         * Debug-level log — only when localStorage caissa_debug = 'true'
         */
        debug: function(module) {
            if (!_isDebug()) return;
            var args = Array.prototype.slice.call(arguments, 1);
            args.unshift(_prefix(module));
            console.debug.apply(console, args);
        },

        /**
         * Info-level log — always outputs
         */
        info: function(module) {
            var args = Array.prototype.slice.call(arguments, 1);
            args.unshift(_prefix(module));
            console.log.apply(console, args);
        },

        /**
         * Warning-level log — always outputs
         */
        warn: function(module) {
            var args = Array.prototype.slice.call(arguments, 1);
            args.unshift(_prefix(module));
            console.warn.apply(console, args);
        },

        /**
         * Error-level log — always outputs, captures to _caissaErrors
         */
        error: function(module) {
            var args = Array.prototype.slice.call(arguments, 1);
            args.unshift(_prefix(module));
            console.error.apply(console, args);

            // Capture for Sentry or manual inspection
            var entry = {
                ts: new Date().toISOString(),
                module: module,
                args: args.slice(1).map(function(a) {
                    if (a instanceof Error) return { message: a.message, stack: a.stack };
                    if (typeof a === 'object') {
                        try { return JSON.parse(JSON.stringify(a)); } catch (e) { return String(a); }
                    }
                    return a;
                })
            };

            window._caissaErrors.push(entry);
            if (window._caissaErrors.length > MAX_ERRORS) {
                window._caissaErrors.shift();
            }
        }
    };

})();
