(function installCoachAssistancePolicy(root) {
    'use strict';
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const categories = Object.freeze(['king-safety', 'forcing-moves', 'vulnerable-piece', 'opponent-threat', 'low-time', 'material-change']);
    const messages = freeze({
        'KING_SAFETY': 'Check your king\'s safety.',
        'FORCING_MOVES': 'Review checks, captures, and threats.',
        'VULNERABLE_PIECE': 'A piece may be vulnerable.',
        'OPPONENT_THREAT': 'Consider the opponent\'s threat.',
        'LOW_TIME': 'Time is becoming limited.',
        'MATERIAL_CHANGE': 'The position changed materially.'
    });
    const levels = freeze({
        light: { permittedCategories: ['king-safety', 'opponent-threat', 'low-time'], confidenceThreshold: 'high', cooldownMs: 30000, maximumPerTurn: 1, maximumPerGame: 8, onRequest: true },
        standard: { permittedCategories: categories, confidenceThreshold: 'medium', cooldownMs: 20000, maximumPerTurn: 1, maximumPerGame: 12, onRequest: true },
        'more-help': { permittedCategories: categories, confidenceThreshold: 'medium', cooldownMs: 12000, maximumPerTurn: 1, maximumPerGame: 16, onRequest: true }
    });
    const contract = freeze({ schemaVersion: '1.0.0', contractId: 'PlayV2CoachAssistancePolicy@1.0.0',
        primaryPurpose: 'assisted-play', userMoveCommit: 'prohibited', automaticMoveExecution: 'prohibited', unrestrictedBestMove: 'prohibited',
        principalVariationDisplay: 'prohibited', exactEngineLine: 'prohibited', futureOpponentMoveLeak: 'prohibited', hiddenAnswerLogging: 'prohibited',
        academyDependency: 'prohibited', trainingMemoryWrites: 'prohibited', masteryWrites: 'prohibited', analyticsTransport: 'disabled',
        assistanceFrequency: 'bounded', assistanceTiming: 'user-controlled-or-policy-bounded', terminalSuppression: 'required', staleAssistance: 'rejected',
        humanContentReview: 'pending', physicalDeviceVerification: 'pending', namedScreenReaderVerification: 'pending', publicReady: false,
        observableEvents: ['game-start', 'user-turn', 'candidate-user-move', 'committed-user-move', 'clock-state', 'terminal-state'],
        inferableSignals: ['allowlisted-category', 'bounded-severity', 'confidence-classification', 'promotion-pending', 'opponent-working', 'terminal', 'opening-phase', 'low-time'],
        categories, messages, levels, focuses: { balanced: 'opponent-threat', tactics: 'forcing-moves', safety: 'king-safety', 'time-awareness': 'low-time' },
        timings: ['on-request'], suppression: ['cooldown', 'duplicate-category', 'low-confidence', 'opening-low-confidence', 'promotion', 'opponent-working', 'terminal', 'postgame', 'stale-generation', 'route-exit', 'mode-switch'] });
    root.CaissaPlayV2CoachAssistancePolicy = contract;
})(typeof window !== 'undefined' ? window : globalThis);
