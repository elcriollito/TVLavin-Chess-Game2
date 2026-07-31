(function (root) {
    'use strict';
    const prohibited = Object.freeze(['name', 'email', 'username', 'accountId', 'ip', 'url', 'query', 'referrer',
        'userAgent', 'deviceId', 'fingerprint', 'moves', 'pgn', 'fen', 'position', 'evaluation', 'pv', 'chat',
        'mentorContent', 'knowledgeEvidence', 'providerPayload', 'clockHistory', 'cookie', 'sessionId']);
    root.CaissaPlayAnalyticsPrivacyPolicy = Object.freeze({ VERSION: 'PlayAnalyticsPrivacyPolicy@1.0.0',
        transport: 'none', persistence: 'none', consentOwner: 'deferred', preciseTime: false,
        crossSessionIdentity: false, prohibited });
})(typeof window !== 'undefined' ? window : globalThis);
