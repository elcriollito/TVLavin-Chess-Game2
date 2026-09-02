(function installBotStrengthHonesty(global) {
    'use strict';

    const VERSION = '1.1.0';
    const PERSONALITY_NAMES = Object.freeze(['Beginner', 'Casual', 'Tactical', 'Solid']);
    const PERSONALITY_IDS = Object.freeze(['beginner', 'casual', 'tactical', 'solid']);
    const PROHIBITED_FIELDS = Object.freeze(['elo', 'rating', 'federationRating', 'federationTitle',
        'realPerson', 'realPersonIdentity', 'realPersonLikeness', 'replicaOf', 'biography', 'flag',
        'externalProfile', 'remoteRating']);
    const FUTURE_NUMERIC_RATING_GATE = Object.freeze([
        'versioned-bot-configuration', 'versioned-engine-and-worker', 'reproducible-calibration-protocol',
        'sufficiently-large-sample', 'opponent-pool-and-rating-provenance', 'time-control-specification',
        'confidence-interval-or-documented-uncertainty', 'device-and-performance-considerations',
        'calibration-date', 'expiration-and-recalibration-policy', 'independent-review', 'explicit-product-approval'
    ]);
    const contract = Object.freeze({
        schemaVersion: VERSION, contractId: `PlayV2BotStrengthHonesty@${VERSION}`,
        currentRatingStatus: 'unrated-calibration-pending', ratingStatusLabel: 'Unrated · calibration pending',
        numericEloDisplay: 'target-label-only', certifiedEloClaim: 'prohibited', federationRatingClaim: 'prohibited',
        exactHumanStrengthClaim: 'prohibited', realPersonReplica: 'prohibited', realPersonIdentity: 'prohibited',
        realPersonLikeness: 'prohibited', depthAsElo: 'prohibited', styleClaimRequiresCalibrationEvidence: true,
        difficultyClaimRequiresRelativeEvidence: true, personalityNames: 'allowlisted',
        personalityNameAllowlist: PERSONALITY_NAMES, personalityIdAllowlist: PERSONALITY_IDS,
        targetStrengthLabel: 'Elo target', publicRatingActivationRequiresVersionedCalibration: true,
        analyticsTransport: 'disabled',
        futureNumericRatingLabel: 'Estimated', futureNumericRatingGate: FUTURE_NUMERIC_RATING_GATE
    });

    function validateProfile(profile) {
        const errors = [];
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return Object.freeze({ valid: false, errors: ['Profile required.'] });
        if (!PERSONALITY_IDS.includes(profile.id) || !PERSONALITY_NAMES.includes(profile.name)) errors.push('Profile identity is not allowlisted.');
        if (profile.ratingStatus !== contract.ratingStatusLabel) errors.push('Unrated calibration-pending disclosure is required.');
        if (PROHIBITED_FIELDS.some(field => Object.hasOwn(profile, field))) errors.push('Prohibited rating or identity metadata.');
        const publicText = [profile.name, profile.shortName, profile.description, profile.ratingStatus,
            profile.presentation?.tagline, ...(profile.presentation?.strengths || []), ...(profile.presentation?.limitations || [])].join(' ');
        if (/\b(?:\d{3,4}\s*(?:elo|rating)|certified\s+elo|federation\s+(?:rating|title)|grandmaster|professional|expert|unbeatable|replica)\b/i.test(publicText))
            errors.push('Unsupported public strength or identity claim.');
        return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
    }

    global.CaissaPlayV2BotStrengthHonesty = Object.freeze({ ...contract, prohibitedProfileFields: PROHIBITED_FIELDS, validateProfile });
})(typeof window !== 'undefined' ? window : globalThis);
