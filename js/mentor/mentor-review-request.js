(function installMentorReviewRequest(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const REQUEST_VERSION = 1;
    const RELEASE_ID = 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84';
    const SOURCE_TYPES = Object.freeze(['play-game', 'bot-game', 'coach-game', 'imported-game']);
    const LEARNER_LEVELS = Object.freeze([
        'new-to-chess', 'beginner', 'novice', 'intermediate', 'intermediate-ii', 'advanced', 'expert'
    ]);
    const REVIEW_FOCUSES = Object.freeze([
        'general', 'tactics', 'strategy', 'opening-principles', 'positional-play', 'defense', 'endgames'
    ]);
    const ANALYSIS_DEPTHS = Object.freeze(['quick', 'standard', 'deep']);
    const CRITICAL_MOMENT_LIMITS = Object.freeze([1, 3, 5]);
    const EXPLANATION_STYLES = Object.freeze(['concise', 'balanced', 'detailed', 'socratic']);
    const STATUSES = Object.freeze([
        'validated', 'registered', 'handed-off', 'consumed', 'expired', 'canceled', 'rejected', 'invalid', 'disposed'
    ]);
    const REASON_CODES = Object.freeze([
        'REQUEST_CREATED', 'REQUEST_VALID', 'INVALID_INPUT', 'DANGEROUS_KEY', 'UNSUPPORTED_VERSION',
        'INVALID_SOURCE', 'INCOMPLETE_GAME', 'INVALID_ANALYZE_SESSION', 'MENTOR_NOT_SELECTED',
        'INVALID_MENTOR_VERSION', 'INVALID_LEARNER_LEVEL', 'INVALID_REVIEW_FOCUS',
        'INVALID_ANALYSIS_DEPTH', 'INVALID_CRITICAL_MOMENT_LIMIT', 'INVALID_EXPLANATION_STYLE',
        'KNOWLEDGE_RELEASE_REQUIRED', 'INVALID_STATUS', 'INVALID_REQUEST', 'REQUEST_EXPIRED'
    ]);
    const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
    const SAFE_ID = /^[a-z0-9:._-]{1,160}$/i;
    const MAX_TTL_MS = 60 * 60 * 1000;
    const DEFAULT_TTL_MS = 30 * 60 * 1000;
    const diagnostics = { createAttempts: 0, createdRequests: 0, validationFailures: 0,
        sourceFailures: 0, mentorResolutionFailures: 0, knowledgeReleaseFailures: 0,
        lastReasonCode: null };
    const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const exact = (value, keys) => object(value)
        && Object.keys(value).length === keys.length
        && Object.keys(value).every(key => keys.includes(key));
    function dangerous(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        return Object.keys(value).some(key => FORBIDDEN.has(key))
            || Object.values(value).some(child => dangerous(child, seen));
    }
    function freeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value); Object.values(value).forEach(child => freeze(child, seen));
        return Object.freeze(value);
    }
    const copy = value => JSON.parse(JSON.stringify(value));
    const result = (ok, status, reasonCode, value = null, sourcePayload = null) =>
        freeze({ ok, status, reasonCode, value, sourcePayload });
    function opaqueId() {
        const uuid = global.crypto?.randomUUID?.();
        if (uuid) return `mrr_${uuid.replace(/-/g, '')}`;
        const random = () => Math.random().toString(36).slice(2);
        return `mrr_${random()}${random()}${random()}`.slice(0, 64);
    }
    function failure(reasonCode, category = null) {
        diagnostics.validationFailures += 1; diagnostics.lastReasonCode = reasonCode;
        if (category) diagnostics[category] += 1;
        return result(false, 'invalid', reasonCode);
    }
    function sourceFor(record, requested) {
        if (requested === 'play-game' || requested === 'games') return 'play-game';
        if (requested === 'bot-game' || requested === 'bot') return 'bot-game';
        if (requested === 'coach-game' || requested === 'coach') return 'coach-game';
        if (record?.opponent?.type === 'coach') return 'coach-game';
        if (global.CaissaBotRegistry?.get?.(record?.opponent?.id)) return 'bot-game';
        return 'play-game';
    }
    function capabilities() {
        return freeze({
            educationalAnalysis: 'foundation',
            criticalMoments: 'disabled',
            errorClassification: 'disabled',
            knowledgeMapping: 'deferred',
            recommendations: 'deferred'
        });
    }
    function createCore(input, source, sourcePayload) {
        if (!object(input)) return failure('INVALID_INPUT');
        if (dangerous(input)) return failure('DANGEROUS_KEY');
        const resolved = global.CaissaMentorSelectionResolver?.resolve?.({
            sessionMentorId: input.mentorId,
            academyMentorId: input.academyMentorId
        });
        if (!resolved?.available) return failure('MENTOR_NOT_SELECTED', 'mentorResolutionFailures');
        if (!Number.isInteger(resolved.mentor?.version) || resolved.mentor.version < 1)
            return failure('INVALID_MENTOR_VERSION', 'mentorResolutionFailures');
        const level = input.playerLevel ?? resolved.mentor.learnerLevels?.[0] ?? 'novice';
        const focus = input.focus ?? 'general';
        const depth = input.analysisDepth ?? 'standard';
        const limit = input.criticalMomentLimit ?? 3;
        const style = input.explanationStyle ?? 'balanced';
        if (!LEARNER_LEVELS.includes(level)) return failure('INVALID_LEARNER_LEVEL');
        if (!REVIEW_FOCUSES.includes(focus)) return failure('INVALID_REVIEW_FOCUS');
        if (!ANALYSIS_DEPTHS.includes(depth)) return failure('INVALID_ANALYSIS_DEPTH');
        if (!CRITICAL_MOMENT_LIMITS.includes(limit)) return failure('INVALID_CRITICAL_MOMENT_LIMIT');
        if (!EXPLANATION_STYLES.includes(style)) return failure('INVALID_EXPLANATION_STYLE');
        const releaseId = input.knowledgeReleaseId ?? global.CaissaMentorCapabilities?.releaseId;
        if (releaseId !== RELEASE_ID || releaseId !== global.CaissaMentorCapabilities?.releaseId)
            return failure('KNOWLEDGE_RELEASE_REQUIRED', 'knowledgeReleaseFailures');
        const createdAt = Number.isFinite(input.createdAt) ? input.createdAt : Date.now();
        const ttlMs = Number.isFinite(input.ttlMs)
            ? Math.max(1, Math.min(input.ttlMs, MAX_TTL_MS)) : DEFAULT_TTL_MS;
        if (!Number.isFinite(createdAt) || createdAt < 0) return failure('INVALID_INPUT');
        const requestId = input.requestId ?? opaqueId();
        if (typeof requestId !== 'string' || !/^mrr_[A-Za-z0-9_-]{12,80}$/.test(requestId))
            return failure('INVALID_INPUT');
        const request = {
            schemaVersion: SCHEMA_VERSION, requestVersion: REQUEST_VERSION, requestId,
            createdAt, expiresAt: createdAt + ttlMs, status: 'validated',
            source,
            mentor: { id: resolved.mentor.id, version: resolved.mentor.version, resolutionSource: resolved.source },
            learner: { level },
            review: { focus, analysisDepth: depth, criticalMomentLimit: limit, explanationStyle: style },
            knowledge: { releaseId },
            game: {
                gameRecordRef: source.recordId || null,
                completed: source.type === 'imported-game' ? null : true,
                result: sourcePayload?.result?.value ?? null,
                termination: sourcePayload?.result?.termination ?? null,
                hasResultMismatch: sourcePayload?.notation?.hasResultMismatch === true
            },
            capabilities: capabilities(),
            metadata: {
                requestOrigin: input.requestOrigin === 'post-game' ? 'post-game' : 'contract',
                analysisStarted: false, reviewImplemented: false
            }
        };
        const checked = validate(request, createdAt);
        if (!checked.valid) return failure(checked.reasonCode);
        diagnostics.createdRequests += 1; diagnostics.lastReasonCode = 'REQUEST_CREATED';
        return result(true, 'validated', 'REQUEST_CREATED', freeze(request), freeze(copy(sourcePayload)));
    }
    function fromGameRecord(record, options = {}) {
        diagnostics.createAttempts += 1;
        if (!object(options) || dangerous(options) || dangerous(record))
            return failure(dangerous(options) || dangerous(record) ? 'DANGEROUS_KEY' : 'INVALID_INPUT');
        const validation = global.CaissaGameRecord?.validate?.(record);
        if (!validation?.valid || record?.result?.complete !== true
            || !['completed', 'aborted'].includes(record?.status) || record?.pendingPromotion)
            return failure('INCOMPLETE_GAME', 'sourceFailures');
        if (options.sourceType !== undefined
            && !['games', 'bot', 'coach', 'play-game', 'bot-game', 'coach-game'].includes(options.sourceType))
            return failure('INVALID_SOURCE', 'sourceFailures');
        const type = sourceFor(record, options.sourceType);
        if (!SOURCE_TYPES.includes(type) || type === 'imported-game')
            return failure('INVALID_SOURCE', 'sourceFailures');
        return createCore(options, {
            type, id: record.recordId, mode: record.mode, recordId: record.recordId, analyzeSessionId: null
        }, record);
    }
    function fromAnalyzeSession(sessionRef, options = {}) {
        diagnostics.createAttempts += 1;
        if (!object(sessionRef) || dangerous(sessionRef) || dangerous(options))
            return failure(dangerous(sessionRef) || dangerous(options) ? 'DANGEROUS_KEY' : 'INVALID_INPUT');
        const id = sessionRef.analyzeSessionId;
        if (!SAFE_ID.test(id || '') || sessionRef.imported !== true || sessionRef.activeHumanPlay === true)
            return failure('INVALID_ANALYZE_SESSION', 'sourceFailures');
        return createCore(options, {
            type: 'imported-game', id, mode: 'analysis', recordId: null, analyzeSessionId: id
        }, { analyzeSessionId: id, imported: true });
    }
    function validate(request, now = Date.now()) {
        if (!object(request) || dangerous(request))
            return freeze({ valid: false, reasonCode: dangerous(request) ? 'DANGEROUS_KEY' : 'INVALID_REQUEST' });
        if (request.schemaVersion !== SCHEMA_VERSION || request.requestVersion !== REQUEST_VERSION)
            return freeze({ valid: false, reasonCode: 'UNSUPPORTED_VERSION' });
        if (!exact(request, ['schemaVersion', 'requestVersion', 'requestId', 'createdAt', 'expiresAt',
            'status', 'source', 'mentor', 'learner', 'review', 'knowledge', 'game', 'capabilities', 'metadata'])
            || !exact(request.source, ['type', 'id', 'mode', 'recordId', 'analyzeSessionId'])
            || !exact(request.mentor, ['id', 'version', 'resolutionSource'])
            || !exact(request.learner, ['level'])
            || !exact(request.review, ['focus', 'analysisDepth', 'criticalMomentLimit', 'explanationStyle'])
            || !exact(request.knowledge, ['releaseId'])
            || !exact(request.game, ['gameRecordRef', 'completed', 'result', 'termination', 'hasResultMismatch'])
            || !exact(request.capabilities, ['educationalAnalysis', 'criticalMoments', 'errorClassification',
                'knowledgeMapping', 'recommendations'])
            || !exact(request.metadata, ['requestOrigin', 'analysisStarted', 'reviewImplemented']))
            return freeze({ valid: false, reasonCode: 'INVALID_REQUEST' });
        if (!/^mrr_[A-Za-z0-9_-]{12,80}$/.test(request.requestId || '')
            || !STATUSES.includes(request.status)
            || !Number.isFinite(request.createdAt) || !Number.isFinite(request.expiresAt)
            || request.expiresAt <= request.createdAt || request.expiresAt - request.createdAt > MAX_TTL_MS)
            return freeze({ valid: false, reasonCode: 'INVALID_REQUEST' });
        if (now > request.expiresAt) return freeze({ valid: false, reasonCode: 'REQUEST_EXPIRED' });
        if (!SOURCE_TYPES.includes(request.source?.type) || !SAFE_ID.test(request.source?.id || ''))
            return freeze({ valid: false, reasonCode: 'INVALID_SOURCE' });
        if (!global.CaissaMentorRegistry?.get?.(request.mentor?.id)
            || global.CaissaMentorRegistry.get(request.mentor.id).version !== request.mentor.version)
            return freeze({ valid: false, reasonCode: 'INVALID_MENTOR_VERSION' });
        if (!LEARNER_LEVELS.includes(request.learner?.level)
            || !REVIEW_FOCUSES.includes(request.review?.focus)
            || !ANALYSIS_DEPTHS.includes(request.review?.analysisDepth)
            || !CRITICAL_MOMENT_LIMITS.includes(request.review?.criticalMomentLimit)
            || !EXPLANATION_STYLES.includes(request.review?.explanationStyle)
            || request.knowledge?.releaseId !== RELEASE_ID
            || request.capabilities.educationalAnalysis !== 'foundation'
            || request.capabilities.criticalMoments !== 'disabled'
            || request.capabilities.errorClassification !== 'disabled'
            || request.capabilities.knowledgeMapping !== 'deferred'
            || request.capabilities.recommendations !== 'deferred'
            || request.metadata?.analysisStarted !== false || request.metadata?.reviewImplemented !== false)
            return freeze({ valid: false, reasonCode: 'INVALID_REQUEST' });
        return freeze({ valid: true, reasonCode: 'REQUEST_VALID' });
    }
    function withStatus(request, status, now = Date.now()) {
        if (!STATUSES.includes(status)) return failure('INVALID_STATUS');
        const checked = validate(request, now);
        if (!checked.valid) return result(false, 'invalid', checked.reasonCode);
        const changed = freeze({ ...copy(request), status });
        return result(true, status, 'REQUEST_VALID', changed);
    }
    const getSnapshot = request => {
        const checked = validate(request);
        return checked.valid ? freeze(copy(request)) : null;
    };
    global.CaissaMentorReviewRequest = freeze({
        schemaVersion: SCHEMA_VERSION, requestVersion: REQUEST_VERSION, releaseId: RELEASE_ID,
        sourceTypes: SOURCE_TYPES, learnerLevels: LEARNER_LEVELS, reviewFocuses: REVIEW_FOCUSES,
        analysisDepths: ANALYSIS_DEPTHS, criticalMomentLimits: CRITICAL_MOMENT_LIMITS,
        explanationStyles: EXPLANATION_STYLES, statuses: STATUSES, reasonCodes: REASON_CODES,
        limits: freeze({ defaultTtlMs: DEFAULT_TTL_MS, maxTtlMs: MAX_TTL_MS }),
        fromGameRecord, fromAnalyzeSession, validate, withStatus, getSnapshot,
        inspect: () => freeze({ ...diagnostics })
    });
})(typeof window !== 'undefined' ? window : globalThis);
