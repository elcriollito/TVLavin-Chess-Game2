const freeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
};

const entry = (subsystemId, unit, browser, responsive, guards, boundary, invariant, status = 'complete') => ({
    subsystemId, unit, integration: browser, responsive, staticGuards: guards,
    externalManual: boundary, hardInvariant: invariant, releaseImpact: 'blocking', status
});

export const PLAY_REGRESSION_MANIFEST_VERSION = '1.0.0';

export const PLAY_REGRESSION_SUBSYSTEMS = freeze([
    entry('navigation-routing', ['tests/play/play-route-controller.test.js'], ['tests/browser/play-routing.spec.js'], [], ['tests/navigation-integrity.test.js'], 'manual direct-link review', 'Classic and Legacy defaults'),
    entry('board-rules', ['tests/play/chessboard-adapter.test.js'], ['tests/browser/play-chessboard-adapter.spec.js', 'tests/browser/play-game-state.spec.js'], ['tests/browser/responsive-play-transitions.spec.js'], ['tests/play/play-harness-contract.test.js'], 'three documented characterization gaps', 'one primary board'),
    entry('engine-worker', ['tests/play/worker-lifecycle.test.js', 'tests/play/engine-request-isolation.test.js'], ['tests/browser/play-worker-lifecycle.spec.js', 'tests/browser/play-engine-request-isolation.spec.js'], [], ['tests/play/engine-adapter-attribution.test.js'], 'external Worker URL', 'at most one Play Worker'),
    entry('clock-lifecycle', ['tests/play/clock-service.test.js', 'tests/play/game-lifecycle.test.js'], ['tests/browser/play-clock-service.spec.js', 'tests/browser/play-game-lifecycle.spec.js'], [], [], 'background throttling manual', 'one lifecycle and clock owner'),
    entry('records-persistence', ['tests/play/game-record.test.js', 'tests/play/game-record-persistence.test.js'], ['tests/browser/play-game-record.spec.js', 'tests/browser/play-game-record-persistence.spec.js'], [], [], 'browser quota variance', 'no stale session mutation'),
    entry('fair-play', ['tests/play/fair-play-policy.test.js', 'tests/play/human-fair-play.test.js'], ['tests/browser/play-fair-play-policy.spec.js', 'tests/browser/play-human-fair-play.spec.js'], [], [], 'live provider external', 'human assistance denied before dispatch'),
    entry('games', ['tests/play/games-panel.test.js'], ['tests/browser/play-games-panel.spec.js', 'tests/browser/play-integration-consolidation.spec.js'], ['tests/browser/responsive-play-workflows.spec.js'], [], 'manual play feel', 'one primary CTA and lifecycle'),
    entry('bots', ['tests/play/bots-foundation.test.js'], ['tests/browser/play-bots.spec.js'], ['tests/browser/responsive-play-workflows.spec.js'], [], 'subjective strength manual', 'one retained Bot identity'),
    entry('coach', ['tests/play/coach-foundation.test.js', 'tests/play/coach-intervention-quality.test.js'], ['tests/browser/play-coach.spec.js'], ['tests/browser/responsive-play-workflows.spec.js'], [], 'instructional quality manual', 'no move or PV leak'),
    entry('players-readiness', ['tests/play/human-play-infrastructure.test.js', 'tests/play/players-panel.test.js'], ['tests/browser/play-human-infrastructure.spec.js', 'tests/browser/play-players.spec.js'], ['tests/browser/responsive-play-workflows.spec.js'], [], 'live FICS gateway external', 'production unavailable and zero human starts'),
    entry('evaluation-rail', ['tests/play/evaluation-rail.test.js'], ['tests/browser/play-evaluation-rail.spec.js'], ['tests/browser/responsive-play-consolidation.spec.js'], [], 'visual/manual confirmation', 'human evaluation frozen'),
    entry('postgame-analyze', ['tests/play/post-game-experience.test.js', 'tests/play/analyze-handoff.test.js'], ['tests/browser/play-post-game-experience.spec.js', 'tests/browser/play-analyze-resources.spec.js'], ['tests/browser/responsive-play-workflows.spec.js'], [], 'clipboard permissions vary', 'one PostGame and opaque handoff'),
    entry('mentor-pipeline', ['tests/play/mentor-review-request.test.js', 'tests/play/educational-analysis-pipeline.test.js', 'tests/play/critical-moment-selector.test.js'], ['tests/browser/play-educational-analysis-pipeline.spec.js', 'tests/browser/play-critical-moments.spec.js'], [], [], 'instructional review manual', 'one analysis context'),
    entry('guided-replay-summary', ['tests/play/guided-replay.test.js', 'tests/play/knowledge-integration.test.js', 'tests/play/mentor-summary.test.js'], ['tests/browser/play-guided-replay.spec.js'], ['tests/browser/responsive-play-workflows.spec.js'], [], 'instructional review manual', 'hidden answer and zero Memory/Mastery writes'),
    entry('lazy-loading', ['tests/play/play-lazy-loader.test.js'], ['tests/browser/play-lazy-loading.spec.js'], ['tests/browser/responsive-play-workflows.spec.js'], [], 'network scheduling varies', 'deferred groups absent at boot'),
    entry('event-lifecycle', ['tests/play/event-lifecycle.test.js'], ['tests/browser/play-event-lifecycle.spec.js'], [], [], 'none', 'zero listener growth and disposed resources'),
    entry('performance', ['tests/play/play-performance-budget.test.js'], ['tests/browser/play-performance-budget.spec.js'], ['tests/browser/responsive-play-consolidation.spec.js'], [], 'field data and physical heap manual', 'hard resource budgets'),
    entry('themes-visual', ['tests/play/play-themes.test.js', 'tests/play/play-visual-identity.test.js'], ['tests/browser/play-themes.spec.js', 'tests/browser/play-visual-identity.spec.js'], ['tests/browser/responsive-play-consolidation.spec.js'], ['tests/play/play-visual-components.test.js'], 'subjective visual review', 'no Classic or competitor leakage'),
    entry('accessibility', ['tests/play/play-accessibility.test.js'], ['tests/browser/play-accessibility.spec.js'], ['tests/browser/responsive-play-consolidation.spec.js'], [], 'screen-reader certification manual', 'exactly two live regions'),
    entry('responsive', ['tests/play/responsive-profile-contract.test.js'], ['tests/browser/responsive-play-consolidation.spec.js'], ['tests/browser/responsive-play-workflows.spec.js', 'tests/browser/responsive-play-transitions.spec.js'], [], 'physical-device QA manual', '15 profiles without overflow'),
    entry('classic-fics-analyze-isolation', ['tests/play/legacy-play-compatibility.test.js'], ['tests/browser/play-compatibility.spec.js', 'tests/browser/play-analyze-resources.spec.js'], [], ['tests/navigation-integrity.test.js'], 'live FICS gateway external', 'independent runtime ownership'),
    entry('academy-knowledge', ['tests/play/knowledge-integration.test.js'], ['tests/browser/play-mentor-foundation.spec.js'], [], ['tests/knowledge/release-intelligence.test.js'], 'editorial review manual', 'pinned release and protected paths'),
    entry('endgame', ['tests/endgame-library-page.test.js', 'tests/endgame-trainer/endgame-v2-contracts.test.js'], ['tests/browser/endgame-v2.spec.js'], [], ['tests/knowledge/endgame-library-browser-reader.test.js'], 'live tablebase opt-in', 'Play changes remain isolated'),
    entry('static-release-boundaries', ['tests/play/regression-static-guards.test.js'], ['tests/browser/regression-play-hard-invariants.spec.js'], [], ['tests/public-release-builder.test.js'], 'release authorization manual', 'no fixtures, artifacts, hidden skips, or protected changes')
]);

export const PLAY_REGRESSION_EXTERNAL_GATES = freeze([
    { gateId: 'external-worker', owner: 'Worker integration', prerequisite: 'WORKER_URL', closure: 'configured integration passes' },
    { gateId: 'fics-gateway', owner: 'FICS integration', prerequisite: 'FICS_GATEWAY_URL', closure: 'configured gateway integration passes' },
    { gateId: 'live-tablebase', owner: 'Endgame', prerequisite: 'explicit network opt-in', closure: 'live tablebase gate passes' }
]);

export const PLAY_REGRESSION_MANUAL_GATES = freeze([
    { gateId: 'manual-chess', owner: 'Season 10.12.5', closure: 'structured manual chess QA completes' },
    { gateId: 'physical-devices', owner: 'Season 10.12.5', closure: 'real mobile/tablet matrix completes' },
    { gateId: 'screen-readers', owner: 'Accessibility QA', closure: 'required screen-reader certification completes' }
]);
