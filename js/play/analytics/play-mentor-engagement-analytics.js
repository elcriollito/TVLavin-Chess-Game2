(function (root) {
    'use strict';
    const C = root.CaissaPlayAnalyticsContracts, D = root.CaissaPlayAnalytics;
    if (!C || !D) return;
    const LIMIT = 12, signatures = new Set(), order = [];
    const diagnostics = { emitted: 0, duplicatesSuppressed: 0, staleOutcomesIgnored: 0, invalidPayloads: 0,
        recordsEvicted: 0, sinkFailures: 0, disposals: 0, lastReasonCode: 'unknown' };
    let sequence = 0, disposed = false;
    const definitions = Object.freeze({
        play_mentor_review_requested: ['review','review-request','requested','postgame-cta'],
        play_mentor_review_ready: ['review','review-ready','ready','postgame-cta'],
        play_mentor_review_failed: ['review','review-ready','failed','postgame-cta'],
        play_mentor_critical_moments_opened: ['critical-moments','critical-moments','opened','critical-moment-card'],
        play_mentor_guided_replay_started: ['guided-replay','guided-replay','started','guided-replay-cta'],
        play_mentor_replay_attempted: ['replay-attempt','replay-attempt','attempted','replay-control'],
        play_mentor_reference_revealed: ['reference-reveal','reference','revealed','replay-control'],
        play_mentor_knowledge_opened: ['knowledge','knowledge','opened','knowledge-link'],
        play_mentor_summary_requested: ['summary','summary-request','requested','summary-cta'],
        play_mentor_summary_ready: ['summary','summary-ready','ready','summary-cta'],
        play_mentor_summary_failed: ['summary','summary-ready','failed','summary-cta'],
        play_mentor_exited: ['exit','exit','exited','back-action'] });
    function conceptCategory(value) { const text = String(value || '').toLowerCase();
        for (const category of C.CONCEPT_CATEGORIES) if (category !== 'unknown' && text === category) return category;
        return 'unknown'; }
    function observe(eventId, context = {}) {
        if (disposed) return false; if (context.stale) { diagnostics.staleOutcomesIgnored += 1; return false; }
        const definition = definitions[eventId]; if (!definition) return false;
        const engagementSequence = ++sequence, signature = [eventId, context.completionSequence || 0, context.dedupKey || 'current'].join('|');
        if (signatures.has(signature)) { diagnostics.duplicatesSuppressed += 1; return false; }
        signatures.add(signature); order.push(signature); if (order.length > LIMIT) { signatures.delete(order.shift()); diagnostics.recordsEvicted += 1; }
        const payload = { engagement: definition[0], stage: definition[1], state: definition[2],
            attemptCategory: C.ATTEMPT_CATEGORIES.includes(context.attemptCategory) ? context.attemptCategory : 'unknown',
            conceptCategory: conceptCategory(context.conceptCategory), source: C.MENTOR_SOURCES.includes(context.source) ? context.source : definition[3],
            failureReason: C.MENTOR_FAILURE_REASONS.includes(context.failureReason) ? context.failureReason : 'unknown',
            qaEligible: true, productionEligible: false, completionSequence: Number.isSafeInteger(context.completionSequence) ? context.completionSequence : 0,
            engagementSequence, shellVersion: 'SimplifiedPlayShell@1.7.0' };
        try { const event = D.createEvent(eventId, payload); if (!event) { diagnostics.invalidPayloads += 1; return false; }
            const result = D.emit(event); if (!result?.ok) diagnostics.sinkFailures += 1; }
        catch (_) { diagnostics.sinkFailures += 1; return false; }
        diagnostics.emitted += 1; diagnostics.lastReasonCode = payload.failureReason; return true;
    }
    const api = { observeReviewRequested: c => observe('play_mentor_review_requested', c),
        observeReviewReady: c => observe('play_mentor_review_ready', c), observeReviewFailed: c => observe('play_mentor_review_failed', c),
        observeCriticalMomentsOpened: c => observe('play_mentor_critical_moments_opened', c),
        observeGuidedReplayStarted: c => observe('play_mentor_guided_replay_started', c),
        observeReplayAttempted: c => observe('play_mentor_replay_attempted', c), observeReferenceRevealed: c => observe('play_mentor_reference_revealed', c),
        observeKnowledgeOpened: c => observe('play_mentor_knowledge_opened', c), observeSummaryRequested: c => observe('play_mentor_summary_requested', c),
        observeSummaryReady: c => observe('play_mentor_summary_ready', c), observeSummaryFailed: c => observe('play_mentor_summary_failed', c),
        observeExited: c => observe('play_mentor_exited', c) };
    function snapshot() { return C.freeze({ schemaVersion: 'PlayMentorEngagementAnalytics@1.0.0', disposed,
        activeRecords: order.length, recordLimit: LIMIT, diagnostics: { ...diagnostics } }); }
    function dispose() { if (!disposed) { disposed = true; signatures.clear(); order.length = 0; diagnostics.disposals += 1; } return snapshot(); }
    root.CaissaPlayMentorEngagementAnalytics = Object.freeze({ VERSION: 'PlayMentorEngagementAnalytics@1.0.0',
        PAYLOAD_VERSION: 'PlayMentorEngagementPayload@1.0.0', conceptCategory, ...api, getSnapshot: snapshot, inspect: snapshot, dispose });
})(typeof window !== 'undefined' ? window : globalThis);
