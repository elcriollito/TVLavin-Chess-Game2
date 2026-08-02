(function installPlayV2CoachBoundary(root) {
    'use strict';

    const VERSION = '1.0.0';
    const EVENTS = Object.freeze(['game-start', 'user-turn', 'candidate-user-move', 'committed-user-move', 'clock-state', 'terminal-state']);
    const contract = Object.freeze({
        schemaVersion: VERSION, contractId: `PlayV2CoachBoundary@${VERSION}`,
        primaryPurpose: 'assisted-play', gameLifecycleOwner: 'certified-Games-lifecycle', primaryBoardCount: 1,
        clockOwner: 'existing-single-owner', opponentOwner: 'existing-local-owner', assistanceOwner: 'isolated-play-v2-coach',
        academyDependency: 'prohibited', lessonDependency: 'prohibited', curriculumDependency: 'prohibited',
        endgameTrainingDependency: 'prohibited', guidedReplayDependency: 'prohibited', knowledgeUnitDependency: 'prohibited',
        trainingMemorySurface: 'prohibited', trainingMemoryWrites: 'prohibited', masterySurface: 'prohibited',
        masteryWrites: 'prohibited', recommendationEngine: 'prohibited', mentorDependency: 'prohibited',
        hiddenAnswerExposure: 'prohibited', automaticBestMove: 'prohibited', autoplay: 'prohibited',
        ficsDependency: 'prohibited', analyticsTransport: 'disabled', publicReady: false,
        assistanceCertification: 'locally-assistance-certified', observableEvents: EVENTS
    });
    root.CaissaPlayV2CoachBoundary = contract;
})(typeof window !== 'undefined' ? window : globalThis);
