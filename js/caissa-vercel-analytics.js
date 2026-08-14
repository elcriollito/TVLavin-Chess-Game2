(function installCaissaVercelAnalytics(window, document) {
    'use strict';

    var SCRIPT_ID = 'caissa-vercel-analytics-script';
    var SCRIPT_SRC = '/_vercel/insights/script.js';
    var ALLOWED_HOSTS = new Set(['www.caissa-chess.org', 'caissa-chess.org']);
    var PRIVATE_QUERY_KEYS = new Set(['objectiveartifact', 'privateendgamerun', 'endgamerun']);
    var CREDENTIAL_QUERY_KEYS = new Set([
        'access_token', 'refresh_token', 'token', 'session', 'session_id', 'code',
        'api_key', 'password', 'verification', 'callback'
    ]);
    var CALLBACK_PATH = /\/(?:auth|signin|signup)(?:\/|$).*(?:callback|verify|verification)(?:\/|$)/i;

    function parseUrl(value, base) {
        try {
            return new URL(String(value || ''), base || 'https://www.caissa-chess.org');
        } catch (_) {
            return null;
        }
    }

    function hasBlockedContext(url) {
        if (CALLBACK_PATH.test(url.pathname)) return true;
        for (var entry of url.searchParams.keys()) {
            var key = String(entry).toLowerCase();
            if (PRIVATE_QUERY_KEYS.has(key) || CREDENTIAL_QUERY_KEYS.has(key)) return true;
        }
        return false;
    }

    function sanitizeEvent(event) {
        if (!event || typeof event.url !== 'string') return null;
        var url = parseUrl(event.url, window.location && window.location.origin);
        if (!url || hasBlockedContext(url)) return null;
        url.search = '';
        url.hash = '';
        return Object.assign({}, event, { url: url.origin + url.pathname });
    }

    function isProductionHost() {
        return !!(window.location
            && window.location.protocol === 'https:'
            && ALLOWED_HOSTS.has(window.location.hostname));
    }

    function initialize() {
        if (!isProductionHost() || window.__caissaVercelAnalyticsInitialized) return false;
        window.__caissaVercelAnalyticsInitialized = true;

        if (typeof window.va !== 'function') {
            window.va = function () {
                (window.vaq = window.vaq || []).push(Array.prototype.slice.call(arguments));
            };
        }
        window.va('beforeSend', sanitizeEvent);

        if (!document.getElementById(SCRIPT_ID)
            && !document.querySelector('script[src="' + SCRIPT_SRC + '"]')) {
            var script = document.createElement('script');
            script.id = SCRIPT_ID;
            script.src = SCRIPT_SRC;
            script.defer = true;
            document.head.appendChild(script);
        }
        return true;
    }

    window.CaissaVercelAnalytics = Object.freeze({
        initialize: initialize,
        sanitizeEvent: sanitizeEvent,
        isProductionHost: isProductionHost,
        scriptSrc: SCRIPT_SRC
    });

    initialize();
})(window, document);
