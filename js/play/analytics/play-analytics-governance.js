(function (root) {
    'use strict';
    const C = root.CaissaPlayAnalyticsContracts, D = root.CaissaPlayAnalytics;
    if (!C || !D) return;
    const freeze = C.freeze;
    const VERSION = 'PlayAnalyticsGovernance@1.0.0';
    const payloadSchemas = Object.freeze({
        'play-mode': 'PlayModeSelectionPayload@1.0.0',
        'play-game-start': 'PlayGameStartPayload@1.0.0',
        'play-game-completion': 'PlayGameCompletionPayload@1.0.0',
        'play-postgame': 'PlayPostGameActionPayload@1.0.0',
        'play-mentor': 'PlayMentorEngagementPayload@1.0.0'
    });
    const owners = Object.freeze({
        'play-mode': 'CaissaPlayModeSelectionAnalytics',
        'play-game-start': 'CaissaPlayGameStartAnalytics',
        'play-game-completion': 'CaissaPlayCompletionAnalytics',
        'play-postgame': 'CaissaPlayPostGameAnalytics',
        'play-mentor': 'CaissaPlayMentorEngagementAnalytics'
    });
    const categoryFor = id => C.MODE_EVENT_IDS.includes(id) ? 'play-mode'
        : C.GAME_START_EVENT_IDS.includes(id) ? 'play-game-start'
            : C.COMPLETION_EVENT_IDS.includes(id) ? 'play-game-completion'
                : C.POSTGAME_EVENT_IDS.includes(id) ? 'play-postgame' : 'play-mentor';
    const REGISTRY = freeze(C.EVENT_IDS.map(eventId => {
        const category = categoryFor(eventId);
        return { eventId, eventVersion: '1.0.0', category, owner: owners[category],
            payloadSchema: payloadSchemas[category], dataClass: 'product-aggregate', retention: 'page-memory',
            volumePolicy: category, consentRequired: true, externalTransportEligible: false,
            productionEligible: false };
    }));
    const PROHIBITED = freeze({ classification: 'prohibited', categories: {
        identity: ['name','username','email','accountId','userId','playerId','sessionId','gameId','reviewId','replaySessionId','persistentId','ip','fingerprint'],
        chessContent: ['move','moves','san','uci','fromSquare','toSquare','pgn','fen','position','boardState','selectedSquare','expectedMove','referenceMove'],
        analysis: ['evaluation','mate','pv','engineOutput','scoreText','rawResult','rawTermination'],
        exactTiming: ['exactTime','preciseTimestamp','startedAt','endedAt','exactDuration','exactClock','incrementSeconds','exactTimeControl','timeSpent'],
        authoredContent: ['mentorContent','prompt','explanation','feedback','technicalObservation','summaryContent','conceptId','conceptTitle','knowledgeUnitId','evidence','sourceQuote','graphPath','privateMetadata'],
        navigationProvider: ['rawUrl','query','referrer','providerPayload','challengePayload','room','opponentIdentity'],
        freeForm: ['freeForm','userContent','deviceFingerprint']
    }});
    const POLICY = freeze({ schemaVersion: VERSION,
        registry: { schemaVersion: 'PlayAnalyticsEventRegistry@1.0.0', eventCount: REGISTRY.length },
        classifications: ['operational-safe','product-aggregate','restricted','prohibited'], prohibited: PROHIBITED,
        consent: { schemaVersion: 'PlayAnalyticsConsentPolicy@1.0.0', owner: 'unassigned', status: 'missing',
            externalDelivery: 'blocked', separateFrom: ['game-record-consent','microsoft-clarity','settings','account-session'] },
        retention: { schemaVersion: 'PlayAnalyticsRetentionPolicy@1.0.0', persistence: 'none', scope: 'page-memory',
            dispatcherLimit: 50, eviction: 'oldest-first', crossSession: false, disposalClears: true },
        volume: { schemaVersion: 'PlayAnalyticsVolumePolicy@1.0.0', window: 'page-lifetime',
            families: { 'play-mode': { warning: 20, fail: 50 }, 'play-game-start': { warning: 20, fail: 50 },
                'play-game-completion': { warning: 8, fail: 20 }, 'play-postgame': { warning: 20, fail: 50 },
                'play-mentor': { warning: 24, fail: 50 } }, prohibitedTriggers: ['clock-tick','move-stream','render-cycle'] },
        deduplication: { signatureOwner: 'PlayAnalyticsDispatcher@1.3.0', signatureLimit: 50,
            families: ['play-mode','play-game-start','play-game-completion','play-postgame','play-mentor'] },
        stale: { terminalOutcomesRequireActiveRecord: true, disposedEventsRejected: true,
            contexts: ['route','game-start','completion','postgame-action','mentor-session'] },
        transport: { schemaVersion: 'PlayAnalyticsTransportPolicy@1.0.0', transport: 'none', endpoint: 'none', sdk: 'none',
            networkEligible: false, clarityEligible: false },
        sinks: { allowedStates: ['local-noop','qa-buffer'], blockedStates: ['approved-production','blocked','disposed'],
            trustedIds: ['local-diagnostics','qa-test'], arbitraryRegistration: false },
        production: { schemaVersion: 'PlayAnalyticsProductionEligibility@1.0.0', eligible: false,
            prerequisites: ['consent-owner','consent-ui','approved-sink','endpoint-security-review','retention-approval','field-validation','release-approval'] }
    });
    let disposed = false, lastReasonCode = 'none';
    const plain = value => JSON.parse(JSON.stringify(value));
    function getEventRegistry() { return freeze(plain(REGISTRY)); }
    function getPolicy() { return freeze(plain(POLICY)); }
    function validateRegistry(registry = REGISTRY) {
        const ids = new Set(), exactKeys = ['eventId','eventVersion','category','owner','payloadSchema','dataClass','retention','volumePolicy','consentRequired','externalTransportEligible','productionEligible'];
        const valid = Array.isArray(registry) && registry.length === C.EVENT_IDS.length && registry.every(record => {
            if (!record || Object.keys(record).length !== exactKeys.length || !exactKeys.every(key => Object.hasOwn(record, key))
                || ids.has(record.eventId) || !C.EVENT_IDS.includes(record.eventId)) return false;
            ids.add(record.eventId); const category = categoryFor(record.eventId);
            return record.eventVersion === '1.0.0' && record.category === category && record.owner === owners[category]
                && record.payloadSchema === payloadSchemas[category] && record.dataClass === 'product-aggregate'
                && record.retention === 'page-memory' && record.volumePolicy === category && record.consentRequired === true
                && record.externalTransportEligible === false && record.productionEligible === false;
        }) && C.EVENT_IDS.every(id => ids.has(id));
        lastReasonCode = valid ? 'registry-valid' : 'registry-invalid';
        return freeze({ ok: valid, reason: lastReasonCode, eventCount: ids.size });
    }
    function validateEventOwnership(eventId, owner) {
        const record = REGISTRY.find(item => item.eventId === eventId), ok = !!record && record.owner === owner;
        return freeze({ ok, reason: ok ? 'owner-valid' : record ? 'owner-mismatch' : 'unknown-event' });
    }
    function validateProductionEligibility(eventId) {
        const record = REGISTRY.find(item => item.eventId === eventId), ok = !!record && record.productionEligible === false
            && record.externalTransportEligible === false && POLICY.production.eligible === false;
        return freeze({ ok, eligible: false, reason: record ? 'production-blocked' : 'unknown-event' });
    }
    function evaluateVolume(snapshot = {}) {
        const counts = snapshot.counts && typeof snapshot.counts === 'object' ? snapshot.counts : {};
        const families = {}; let status = 'normal';
        for (const [family, limits] of Object.entries(POLICY.volume.families)) {
            const count = Number.isSafeInteger(counts[family]) && counts[family] >= 0 ? counts[family] : 0;
            const state = count >= limits.fail ? 'fail' : count >= limits.warning ? 'warning' : 'normal';
            if (state === 'fail') status = 'fail'; else if (state === 'warning' && status === 'normal') status = 'warning';
            families[family] = { count, warning: limits.warning, fail: limits.fail, status: state };
        }
        lastReasonCode = `volume-${status}`; return freeze({ status, families });
    }
    function evaluateRetention(snapshot = D.inspect()) {
        const size = Number.isSafeInteger(snapshot?.bufferSize) ? snapshot.bufferSize : 0;
        const ok = size <= POLICY.retention.dispatcherLimit;
        lastReasonCode = ok ? 'retention-valid' : 'retention-exceeded';
        return freeze({ ok, persistence: 'none', crossSession: false, currentCount: size,
            limit: POLICY.retention.dispatcherLimit, eviction: 'oldest-first' });
    }
    function inspect() {
        const dispatcher = D.inspect(), volume = evaluateVolume();
        const observerNames = Object.values(owners), activeDispatcherCount = dispatcher.disposed ? 0 : 1;
        return freeze({ schemaVersion: VERSION, disposed, registryCount: REGISTRY.length,
            categories: Object.keys(payloadSchemas), schemaVersions: { registry: POLICY.registry.schemaVersion,
                retention: POLICY.retention.schemaVersion, volume: POLICY.volume.schemaVersion,
                consent: POLICY.consent.schemaVersion, transport: POLICY.transport.schemaVersion,
                production: POLICY.production.schemaVersion }, activeDispatcherCount,
            activeObserverCount: observerNames.filter(name => !!root[name] && !root[name].inspect?.().disposed).length,
            sinkStates: dispatcher.disposed ? ['disposed'] : ['local-noop','qa-buffer'], bufferLimit: dispatcher.bufferLimit,
            currentCount: dispatcher.bufferSize, duplicatesSuppressed: dispatcher.diagnostics.duplicatesSuppressed,
            staleIgnored: observerNames.reduce((sum, name) => { const d = root[name]?.inspect?.().diagnostics || {};
                return sum + (d.staleOutcomesIgnored || d.staleCompletionsIgnored || 0); }, 0),
            invalidEvents: dispatcher.diagnostics.rejected, sinkFailures: dispatcher.diagnostics.sinkFailures,
            volumeWarnings: volume.status === 'warning' ? 1 : 0, volumeFailures: volume.status === 'fail' ? 1 : 0,
            productionEligible: false, consentStatus: POLICY.consent.status, transport: 'none', lastReasonCode });
    }
    function dispose() { disposed = true; lastReasonCode = 'disposed'; return inspect(); }
    root.CaissaPlayAnalyticsGovernance = freeze({ VERSION, getEventRegistry, getPolicy, validateRegistry,
        validateEventOwnership, validateProductionEligibility, evaluateVolume, evaluateRetention, inspect, dispose });
})(typeof window !== 'undefined' ? window : globalThis);
