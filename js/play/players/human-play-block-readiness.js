(function installHumanPlayInfrastructure(global) {
    'use strict';
    const VERSION = '1.0.0';
    const contracts = global.CaissaHumanPlayInfrastructureContracts;
    if (!contracts) return;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const evidence = {
        fics: ['FICS client owns its gateway, socket, commands, Style12, clocks, results, and reconnect.'],
        classic: ['CAISSA Classic renders the existing FICS runtime and owns no independent connection.'],
        contract: ['Season 10.6 contracts define boundaries without creating a human runtime.'],
        absent: ['Repository audit found no approved implementation or authoritative runtime.']
    };
    const make = (capabilityId, label, category, provider, owner, blockers, proof, actionId = null) =>
        contracts.createCapability({
            capabilityId, label, category, provider, owner, blockers,
            limitations: [category === 'provider-entry'
                ? 'This action opens an existing owner; it does not make the capability native to Simplified Play.'
                : category === 'presentation-only'
                    ? 'Presentation supplies no independent runtime or authority.'
                    : category === 'coming-later'
                        ? 'No current backend or runtime exists.'
                        : category === 'contract-ready'
                            ? 'Schemas exist, but runtime capability does not.'
                            : 'No safe native Simplified Play capability is available.'],
            evidence: proof, actionable: actionId !== null, actionId
        });
    const specs = [
        ['fics-login', 'FICS login', 'provider-owned', 'fics', 'fics', ['PROVIDER_CONNECTION_REQUIRED'], evidence.fics],
        ['fics-lobby', 'FICS lobby', 'provider-entry', 'fics', 'fics', ['PROVIDER_ENTRY_ONLY'], evidence.fics, 'open-fics'],
        ['fics-seeks', 'FICS seeks', 'provider-owned', 'fics', 'fics', ['PROVIDER_ENTRY_ONLY'], evidence.fics],
        ['fics-games', 'FICS games', 'provider-owned', 'fics', 'fics', ['HUMAN_HANDOFF_UNAVAILABLE'], evidence.fics],
        ['fics-server-clocks', 'FICS server clocks', 'provider-owned', 'fics', 'fics', ['HUMAN_HANDOFF_UNAVAILABLE'], evidence.fics],
        ['fics-reconnect', 'FICS reconnect', 'provider-owned', 'fics', 'fics', ['HUMAN_HANDOFF_UNAVAILABLE'], evidence.fics],
        ['classic-lobby', 'CAISSA Classic lobby', 'provider-entry', 'caissa-classic', 'caissa-classic', ['PROVIDER_ENTRY_ONLY'], evidence.classic, 'open-classic'],
        ['classic-table-creation', 'Classic table creation', 'presentation-only', 'caissa-classic', 'fics', ['PROVIDER_ENTRY_ONLY'], evidence.classic],
        ['classic-sit', 'Classic Sit', 'presentation-only', 'caissa-classic', 'fics', ['PROVIDER_ENTRY_ONLY'], evidence.classic],
        ['classic-watch', 'Classic Watch', 'presentation-only', 'caissa-classic', 'fics', ['PROVIDER_ENTRY_ONLY'], evidence.classic],
        ['caissa-presence', 'CAISSA presence', 'coming-later', 'future-caissa-network', 'none', ['PRESENCE_SOURCE_UNAVAILABLE', 'PROPRIETARY_BACKEND_UNAVAILABLE'], evidence.absent],
        ['caissa-friends', 'CAISSA friends', 'coming-later', 'future-caissa-network', 'none', ['FRIEND_SYSTEM_UNAVAILABLE'], evidence.absent],
        ['caissa-challenges', 'CAISSA challenges', 'contract-ready', 'future-caissa-network', 'none', ['CHALLENGE_EVENT_STREAM_UNAVAILABLE', 'PROPRIETARY_BACKEND_UNAVAILABLE'], evidence.contract],
        ['caissa-matchmaking', 'CAISSA matchmaking', 'coming-later', 'future-caissa-network', 'none', ['MATCHMAKING_UNAVAILABLE'], evidence.absent],
        ['caissa-rated-play', 'CAISSA rated human play', 'blocked', 'future-caissa-network', 'none', ['RATING_BACKEND_UNAVAILABLE', 'SERVER_AUTHORITY_UNAVAILABLE'], evidence.absent],
        ['caissa-casual-human-play', 'CAISSA casual human play', 'blocked', 'future-caissa-network', 'none', ['PROPRIETARY_BACKEND_UNAVAILABLE', 'HUMAN_HANDOFF_UNAVAILABLE'], evidence.absent],
        ['caissa-human-board-runtime', 'CAISSA human board runtime', 'blocked', 'future-caissa-network', 'none', ['HUMAN_HANDOFF_UNAVAILABLE', 'MOVE_AUTHORITY_UNAVAILABLE'], evidence.absent],
        ['caissa-server-clocks', 'CAISSA server clocks', 'unsupported', 'future-caissa-network', 'none', ['CLOCK_AUTHORITY_UNAVAILABLE'], evidence.absent],
        ['caissa-reconnect', 'CAISSA reconnect', 'unsupported', 'future-caissa-network', 'none', ['RECONNECT_AUTHORITY_UNAVAILABLE'], evidence.absent],
        ['caissa-human-game-record', 'Human GameRecord authority', 'contract-ready', 'future-caissa-network', 'none', ['RESULT_AUTHORITY_UNAVAILABLE', 'HUMAN_HISTORY_UNAVAILABLE'], evidence.contract],
        ['caissa-post-game-analysis', 'Human post-game analysis', 'contract-ready', 'future-caissa-network', 'none', ['RESULT_AUTHORITY_UNAVAILABLE', 'HUMAN_HANDOFF_UNAVAILABLE'], evidence.contract],
        ['local-human-play', 'Local human play', 'unsupported', 'local', 'none', ['LOCAL_RUNTIME_UNAVAILABLE'], evidence.absent],
        ['invitation-links', 'Invitation links', 'coming-later', 'future-caissa-network', 'none', ['INVITATION_BACKEND_UNAVAILABLE'], evidence.absent],
        ['recent-human-opponents', 'Recent human opponents', 'blocked', 'future-caissa-network', 'none', ['HUMAN_HISTORY_UNAVAILABLE'], evidence.absent],
        ['suggested-players', 'Suggested Players', 'coming-later', 'future-caissa-network', 'none', ['PRESENCE_SOURCE_UNAVAILABLE', 'RATING_BACKEND_UNAVAILABLE'], evidence.absent],
        ['tournament-human-entry', 'Tournament human entry', 'coming-later', 'future-caissa-network', 'none', ['PROPRIETARY_BACKEND_UNAVAILABLE'], evidence.absent]
    ];
    const capabilities = freeze(specs.map(spec => make(...spec)));
    const providers = global.CaissaHumanPlayProviderMatrix.records;
    const sections = freeze(Object.values(global.CaissaHumanPlaySectionTruthPolicy.sections));
    const readiness = freeze({
        schemaVersion: VERSION,
        statuses: freeze(['foundation-complete', 'design-ready', 'runtime-incomplete', 'production-blocked']),
        foundationComplete: true, designReady: true, runtimeComplete: false, productionReady: false,
        blockers: freeze([
            'PROPRIETARY_BACKEND_UNAVAILABLE', 'PRESENCE_SOURCE_UNAVAILABLE',
            'CHALLENGE_EVENT_STREAM_UNAVAILABLE', 'HUMAN_HANDOFF_UNAVAILABLE',
            'SERVER_AUTHORITY_UNAVAILABLE', 'CLOCK_AUTHORITY_UNAVAILABLE',
            'MOVE_AUTHORITY_UNAVAILABLE', 'RESULT_AUTHORITY_UNAVAILABLE',
            'RECONNECT_AUTHORITY_UNAVAILABLE', 'PRODUCTION_ROLLOUT_NOT_APPROVED'
        ]),
        nextRoadmapPhase: 'SEASON 10.10 — DESIGN SYSTEM AND VISUAL IDENTITY'
    });
    const actionPolicy = freeze({
        schemaVersion: VERSION,
        primary: { actionId: 'open-fics', label: 'Open FICS Lobby', capabilityId: 'fics-lobby' },
        secondary: freeze([
            { actionId: 'open-classic', label: 'Open CAISSA Classic', capabilityId: 'classic-lobby' },
            { actionId: 'return-to-games', label: 'Return to Games', capabilityId: null }
        ]),
        unavailable: freeze([
            { actionId: 'find-match', blocker: 'MATCHMAKING_UNAVAILABLE' },
            { actionId: 'challenge-player', blocker: 'CHALLENGE_EVENT_STREAM_UNAVAILABLE' },
            { actionId: 'add-friend', blocker: 'FRIEND_SYSTEM_UNAVAILABLE' },
            { actionId: 'invite-friend', blocker: 'INVITATION_BACKEND_UNAVAILABLE' },
            { actionId: 'start-local-human-game', blocker: 'LOCAL_RUNTIME_UNAVAILABLE' },
            { actionId: 'start-rated-game', blocker: 'RATING_BACKEND_UNAVAILABLE' },
            { actionId: 'start-casual-human-game', blocker: 'HUMAN_HANDOFF_UNAVAILABLE' }
        ])
    });
    const snapshot = freeze({
        schemaVersion: VERSION, snapshotId: 'human-play-infrastructure:season-10.6',
        qaOnly: true, productionReady: false, providers, capabilities, sections,
        primaryAction: actionPolicy.primary, secondaryActions: actionPolicy.secondary,
        blockers: readiness.blockers,
        warnings: freeze([
            'FICS is external and provider-owned.',
            'Classic is presentation over FICS, not a second network.',
            'Simplified Play has no human-game runtime.'
        ]),
        readiness,
        humanFairPlay: freeze({
            fics: 'provider-authoritative; Simplified Play handoff incomplete',
            classic: 'inherits FICS; no independent authority',
            local: 'unsupported',
            futureCaissa: 'blocked by missing backend and authority',
            liveEngine: 'denied for ordinary human play',
            evaluation: 'neutral and frozen during live ordinary human play'
        }),
        diagnostics: freeze({
            capabilityCount: capabilities.length, providerCount: providers.length,
            sectionCount: sections.length, playerRowCount: 0, challengeRowCount: 0,
            fakeRecordCount: 0, listenerCount: 0, timerCount: 0, storageWrites: 0,
            lifecycleRotations: 0, fairPlayDecisions: 0, engineChanges: 0,
            gameRecordsCreated: 0, humanGamesStarted: 0
        })
    });
    contracts.noteSnapshot();
    global.CaissaHumanPlayInfrastructure = freeze({
        schemaVersion: VERSION, snapshotSchemaVersion: VERSION,
        categories: contracts.categories, blockers: contracts.blockers, actions: contracts.actions,
        capabilityIds: contracts.capabilityIds, capabilities, providers, sections,
        actionPolicy, comingLaterPolicy: global.CaissaHumanPlayComingLaterPolicy,
        sectionPolicy: global.CaissaHumanPlaySectionTruthPolicy, readiness,
        getCapability: id => capabilities.find(item => item.capabilityId === id) || null,
        getProvider: id => providers.find(item => item.provider === id) || null,
        getSnapshot: () => snapshot,
        noteAction: (ok, reasonCode) => contracts.noteAction(ok, reasonCode),
        inspect: () => contracts.inspect()
    });
})(typeof window !== 'undefined' ? window : globalThis);
