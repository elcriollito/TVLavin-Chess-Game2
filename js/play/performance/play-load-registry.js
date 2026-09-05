(function installPlayLoadRegistry(root, factory) {
    root.CaissaPlayLoadRegistry = factory(root.CaissaPlayLazyLoadContracts, root.CaissaPlayV2ProductBoundary, root);
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRegistry(contracts, boundary, runtime) {
    'use strict';

    const definitions = Object.freeze({
        'bots-stack': Object.freeze({
            resourceId: 'bots-stack', type: 'module-group', trigger: 'mode', priority: 'normal',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze([]),
            sources: Object.freeze([
                'js/play/bots/bot-strength-honesty.js?v=1.1.0',
                'js/play/bots/bot-profile.js?v=1.0.0', 'js/play/bots/bot-presets.js?v=1.0.0',
                'js/play/bots/bot-personality-policy.js?v=1.1.0',
                'js/play/bots/bot-strength-layer.js?v=1.0.0',
                'js/play/bots/bot-registry.js?v=1.0.0', 'js/play/bots/bot-session.js?v=1.2.0',
                'js/play/bots/bot-collections.js?v=1.1.0',
                'js/play/bots/bot-seasonal-manifest.js?v=1.0.0',
                'js/play/bots/bot-collection-registry.js?v=1.0.0',
                'js/play/bots/bot-collection-loader.js?v=1.0.0',
                'js/play/bots/bot-worker-readiness.js?v=1.0.1',
                'js/play/bots/bots-review-context.js?v=1.0.0',
                'js/play/bots-panel.js?v=2.9.0',
                'js/play/bots/bots-analysis-summary-presentation.js?v=1.1.0',
                'js/play/bots/bots-guided-review-presentation.js?v=1.0.0'
            ])
        }),
        'coach-stack': Object.freeze({
            resourceId: 'coach-stack', type: 'module-group', trigger: 'mode', priority: 'normal',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze(['bots-stack']),
            sources: Object.freeze([
                'js/play/coach/coach-profile.js?v=1.0.0',
                'js/play/coach/coach-intervention-policy.js?v=1.2.0',
                'js/play/coach/coach-messages.js?v=1.2.0',
                'js/play/coach/coach-intervention-candidate.js?v=1.0.0',
                'js/play/coach/endgame-phase-classifier.js?v=1.0.0',
                'js/play/coach/endgame-knowledge-map.js?v=1.0.0',
                'js/play/coach/endgame-detectors.js?v=1.0.0',
                'js/play/coach/endgame-publication-gate.js?v=1.0.0',
                'js/play/coach/coach-registry.js?v=1.1.0', 'js/play/coach/coach-session.js?v=1.2.0',
                'js/play/coach/coach-observation-service.js?v=1.2.0', 'js/play/coach-panel.js?v=1.1.0'
            ])
        }),
        'native-coach-stack': Object.freeze({
            resourceId: 'native-coach-stack', type: 'module-group', trigger: 'mode', priority: 'normal',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze([]),
            styles: Object.freeze(['css/play-coach-review.css?v=1.7.0']),
            sources: Object.freeze([
                'js/play/native-coach/coach-assistance-policy.js?v=1.0.0',
                'js/play/native-coach/coach-configuration.js?v=1.0.0',
                'js/play/native-coach/coach-levels.js?v=1.0.0',
                'js/play/native-coach/coach-entitlement-client.js?v=1.1.0',
                'js/play/native-coach/coach-assistance-sanitizer.js?v=1.0.0',
                'js/play/native-coach/coach-assistance.js?v=1.0.0',
                'js/play/native-coach/coach-move-review.js?v=1.2.0',
                'js/play/native-coach/coach-dialogue.js?v=1.1.0',
                'js/play/native-coach/coach-game-over-presentation.js?v=1.2.0',
                'js/play/native-coach/coach-review-context.js?v=1.0.0',
                'js/play/native-coach/coach-review-exploration.js?v=1.1.0',
                'js/play/native-coach/coach-review-presentation.js?v=1.7.0',
                'js/play/native-coach/coach-panel.js?v=2.7.0'
            ])
        }),
        'native-mentor-review': Object.freeze({
            resourceId: 'native-mentor-review', type: 'module-group', trigger: 'action', priority: 'normal',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze([]),
            styles: Object.freeze(['css/play-native-mentor-review.css?v=1.0.0']),
            sources: Object.freeze([
                'js/play/native-mentor-review/mentor-review-handoff.js?v=1.0.0',
                'js/play/native-mentor-review/mentor-review-analysis.js?v=1.0.0',
                'js/play/native-mentor-review/mentor-review-workspace.js?v=1.0.0'
            ])
        }),
        'mentor-foundation': Object.freeze({
            resourceId: 'mentor-foundation', type: 'module-group', trigger: 'action', priority: 'normal',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze([]),
            sources: Object.freeze([
                'js/mentor/mentor-capabilities.js?v=1.0.0', 'js/mentor/mentor-registry.js?v=1.0.0',
                'js/mentor/mentor-selection-resolver.js?v=1.0.0', 'js/mentor/mentor-context.js?v=1.0.0',
                'js/mentor/mentor-review-readiness.js?v=1.0.0',
                'js/mentor/mentor-review-request.js?v=1.0.0',
                'js/mentor/mentor-review-request-registry.js?v=1.0.0',
                'js/mentor/mentor-foundation.js?v=1.1.0'
            ])
        }),
        'mentor-analysis': Object.freeze({
            resourceId: 'mentor-analysis', type: 'module-group', trigger: 'action', priority: 'normal',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze(['mentor-foundation']),
            sources: Object.freeze([
                'js/mentor/educational-analysis-policy.js?v=1.0.0',
                'js/mentor/educational-analysis-contracts.js?v=1.1.0',
                'js/mentor/educational-engine-analysis.js?v=1.0.0',
                'js/mentor/educational-analysis-pipeline.js?v=1.1.0'
            ])
        }),
        'mentor-critical-moments': Object.freeze({
            resourceId: 'mentor-critical-moments', type: 'module-group', trigger: 'action', priority: 'normal',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze(['mentor-analysis']),
            sources: Object.freeze([
                'js/mentor/critical-moment-contracts.js?v=1.0.0',
                'js/mentor/critical-moment-signals.js?v=1.0.0',
                'js/mentor/critical-moment-scoring.js?v=1.0.0',
                'js/mentor/critical-moment-selector.js?v=1.0.0'
            ])
        }),
        'mentor-guided-replay': Object.freeze({
            resourceId: 'mentor-guided-replay', type: 'module-group', trigger: 'action', priority: 'low',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze(['mentor-critical-moments']),
            styles: Object.freeze(['css/mentor-guided-replay.css?v=1.0.0']),
            sources: Object.freeze([
                'js/mentor/guided-replay-prompts.js?v=1.0.0',
                'js/mentor/guided-replay-contracts.js?v=1.0.0',
                'js/mentor/mentor-guided-replay.js?v=1.1.0',
                'js/mentor/guided-replay-view.js?v=1.1.0'
            ])
        }),
        'mentor-knowledge': Object.freeze({
            resourceId: 'mentor-knowledge', type: 'module-group', trigger: 'action', priority: 'low',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze(['mentor-guided-replay']),
            sources: Object.freeze([
                'js/mentor/concept-evidence.js?v=1.0.0',
                'js/mentor/knowledge-mapping-policy.js?v=1.0.0',
                'js/mentor/knowledge-mapping-contracts.js?v=1.0.0',
                'js/mentor/educational-concept-mapper.js?v=1.0.0',
                'js/mentor/knowledge-mapping-registry.js?v=1.0.0',
                'js/mentor/mentor-future-adapters.js?v=1.0.0'
            ])
        }),
        'mentor-summary': Object.freeze({
            resourceId: 'mentor-summary', type: 'module-group', trigger: 'action', priority: 'low',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze(['mentor-knowledge']),
            sources: Object.freeze([
                'js/mentor/mentor-summary-contracts.js?v=1.0.0',
                'js/mentor/mentor-summary-evidence.js?v=1.0.0',
                'js/mentor/mentor-summary-templates.js?v=1.0.0',
                'js/mentor/mentor-summary-registry.js?v=1.0.0',
                'js/mentor/mentor-summary.js?v=1.0.0'
            ])
        }),
        'analyze-deep': Object.freeze({
            resourceId: 'analyze-deep', type: 'module-group', trigger: 'route', priority: 'high',
            qaOnly: false, productionEligible: true, dependencies: Object.freeze([]),
            sources: Object.freeze(boundary ? [
                'js/analyze-session.js?v=1.0.0', 'js/play/analyze-opening-evidence.js?v=1.0.0',
                'js/play/analyze-review-policy-v1-1.js?v=1.1.0', 'js/analyze-section.js?v=1.4.0'
            ] : [
                'js/analyze-session.js?v=1.0.0', 'js/play/analyze-review-policy.js?v=1.0.0',
                'js/analyze-section.js?v=1.4.0'
            ])
        })
    });

    const admittedDefinitions = boundary
        ? Object.values(definitions).filter(definition => boundary.authorize({
            type: 'dynamic-group', value: definition.resourceId
        }).allowed)
        : Object.values(definitions);
    contracts.validateGraph(admittedDefinitions);
    const records = new Map(admittedDefinitions.map(definition => [
        definition.resourceId, { definition, state: contracts.snapshot(definition) }
    ]));

    return Object.freeze({
        VERSION: '1.3.0',
        get: id => records.get(id) || null,
        definitions: () => Object.freeze([...records.values()].map(record => record.definition)),
        inspect: () => Object.freeze([...records.values()].map(record => record.state)),
        update(id, patch) {
            const record = records.get(id);
            if (!record) throw new Error('Unknown lazy resource');
            record.state = contracts.snapshot({
                ...record.state, ...patch, resourceId: id, schemaVersion: contracts.VERSION
            });
            if (record.state.state === 'failed' && record.state.retryCount >= 1) {
                runtime?.requestAnimationFrame?.(() => {
                    const shell = runtime.CaissaSimplifiedPlayShellInstance;
                    const mode = shell?.getSnapshot?.().mode;
                    const expected = mode === 'bots' ? 'bots-stack'
                        : mode === 'coach' ? 'native-coach-stack' : null;
                    if (id === expected) shell?.setStatus?.('unavailable');
                });
                if (runtime?.CustomEvent) runtime.dispatchEvent?.(new runtime.CustomEvent('caissa-play-load-terminal', {
                    detail: { resourceId: id, state: 'failed' }
                }));
            }
            return record.state;
        }
    });
});
