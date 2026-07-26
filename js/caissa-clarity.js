(function (window, document) {
    'use strict';

    var PROJECT_ID = 'xskndnmhky';
    var SCRIPT_ID = 'caissa-clarity-tag';
    var SCRIPT_URL = 'https://www.clarity.ms/tag/' + PROJECT_ID;
    var CONSENT_KEY = 'caissa:analytics-consent:v1';
    var DISABLE_KEY = 'caissa:clarity-disabled:v1';
    var ALLOWED_HOSTS = new Set(['www.caissa-chess.org', 'caissa-chess.org']);

    function storageValue(key) {
        try {
            return window.localStorage && window.localStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function persistConsent(value) {
        try {
            if (window.localStorage) window.localStorage.setItem(CONSENT_KEY, value);
        } catch (_) {
            // Consent remains effective for the current page when storage is unavailable.
        }
    }

    function isEligibleEnvironment() {
        return window.location
            && window.location.protocol === 'https:'
            && ALLOWED_HOSTS.has(window.location.hostname)
            && !(window.navigator && window.navigator.webdriver)
            && storageValue(DISABLE_KEY) !== '1';
    }

    function queueClarity() {
        if (typeof window.clarity === 'function') return window.clarity;
        window.clarity = function () {
            (window.clarity.q = window.clarity.q || []).push(arguments);
        };
        return window.clarity;
    }

    function consentState() {
        return storageValue(CONSENT_KEY) === 'granted' ? 'granted' : 'denied';
    }

    function signalConsent(value) {
        queueClarity()('consentv2', {
            ad_Storage: 'denied',
            analytics_Storage: value
        });
    }

    function updateControls(value) {
        var status = document.querySelector('[data-caissa-analytics-status]');
        if (status) {
            status.textContent = value === 'granted'
                ? 'Optional analytics is allowed on this device.'
                : 'Optional analytics cookies are not allowed on this device.';
        }
    }

    function setConsent(value) {
        var normalized = value === 'granted' ? 'granted' : 'denied';
        persistConsent(normalized);
        signalConsent(normalized);
        updateControls(normalized);
        return normalized;
    }

    function bindControls() {
        document.querySelectorAll('[data-caissa-analytics-consent]').forEach(function (control) {
            control.addEventListener('click', function () {
                setConsent(control.getAttribute('data-caissa-analytics-consent'));
            });
        });
        updateControls(consentState());
    }

    function initialize() {
        if (!isEligibleEnvironment()) return false;
        if (window.__caissaClarityInitialized) {
            bindControls();
            return false;
        }
        window.__caissaClarityInitialized = true;
        signalConsent(consentState());

        if (!document.getElementById(SCRIPT_ID)
            && !document.querySelector('script[src*="clarity.ms/tag/' + PROJECT_ID + '"]')) {
            var script = document.createElement('script');
            script.id = SCRIPT_ID;
            script.async = true;
            script.src = SCRIPT_URL;
            script.referrerPolicy = 'strict-origin-when-cross-origin';
            (document.head || document.documentElement).appendChild(script);
        }
        bindControls();
        return true;
    }

    window.CaissaClarity = {
        initialize: initialize,
        setConsent: setConsent,
        getConsent: consentState,
        projectId: PROJECT_ID
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})(window, document);
