(function (root) {
    'use strict';
    const prohibited = Object.freeze(['name', 'email', 'username', 'accountId', 'ip', 'url', 'query', 'referrer',
        'userAgent', 'deviceId', 'fingerprint', 'moves', 'pgn', 'fen', 'position', 'evaluation', 'pv', 'chat',
        'mentorContent', 'knowledgeEvidence', 'providerPayload', 'clockHistory', 'cookie', 'sessionId', 'gameId',
        'lifecycleId', 'workerId', 'opponentName', 'opponentRating', 'botName', 'coachName', 'exactMinutes',
        'incrementSeconds', 'exactTimeControl', 'selectedSquare', 'orientation', 'move', 'result', 'termination',
        'duration', 'preciseTime', 'rawUrl', 'rawQuery', 'resultText', 'score', 'winnerName', 'loserName',
        'exactDuration', 'startedAt', 'endedAt', 'clockRemaining', 'moveCount', 'mate', 'handoffToken',
        'downloadFilename', 'clipboardContent', 'summaryContent', 'knowledgeConcept', 'providerResult', 'rawTermination']);
    root.CaissaPlayAnalyticsPrivacyPolicy = Object.freeze({ VERSION: 'PlayAnalyticsPrivacyPolicy@1.2.0',
        transport: 'none', persistence: 'none', consentOwner: 'deferred', preciseTime: false,
        crossSessionIdentity: false, prohibited });
})(typeof window !== 'undefined' ? window : globalThis);
