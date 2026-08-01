(function installPlayLoadRegistry(root, factory) {
    root.CaissaPlayLoadRegistry = factory(root.CaissaPlayLazyLoadContracts);
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRegistry(contracts) {
    'use strict';

    const definitions = Object.freeze({
        'bots-stack': Object.freeze({
            resourceId: 'bots-stack', type: 'module-group', trigger: 'mode', priority: 'normal',
            qaOnly: true, productionEligible: false, dependencies: Object.freeze([]),
            sources: Object.freeze([
                'js/play/bots/bot-profile.js?v=1.0.0', 'js/play/bots/bot-presets.js?v=1.0.0',
                'js/play/bots/bot-registry.js?v=1.0.0', 'js/play/bots/bot-session.js?v=1.0.0',
                'js/play/bots-panel.js?v=1.1.0'
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
            sources: Object.freeze([
                'js/analyze-session.js?v=1.0.0', 'js/analyze-section.js?v=1.3.0'
            ])
        })
    });

    contracts.validateGraph(Object.values(definitions));
    const records = new Map(Object.values(definitions).map(definition => [
        definition.resourceId, { definition, state: contracts.snapshot(definition) }
    ]));

    return Object.freeze({
        VERSION: '1.1.0',
        get: id => records.get(id) || null,
        definitions: () => Object.freeze([...records.values()].map(record => record.definition)),
        inspect: () => Object.freeze([...records.values()].map(record => record.state)),
        update(id, patch) {
            const record = records.get(id);
            if (!record) throw new Error('Unknown lazy resource');
            record.state = contracts.snapshot({
                ...record.state, ...patch, resourceId: id, schemaVersion: contracts.VERSION
            });
            return record.state;
        }
    });
});
