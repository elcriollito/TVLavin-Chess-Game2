(function installEducationalConceptMapper(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const operation = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    function create() {
        const results = new Map();
        const diagnostics = { mappingRequests: 0, evidenceObjects: 0, conceptsInferred: 0,
            exactKnowledgeLookups: 0, duplicateConceptsSuppressed: 0, lowConfidenceLinksSuppressed: 0,
            engineRequests: 0, workers: 0, storageWrites: 0, memoryWrites: 0,
            masteryWrites: 0, recommendationsCreated: 0 };
        const band = score => score >= 0.8 ? 'high' : score >= 0.6 ? 'medium' : 'low';
        function inferConcepts(evidence) {
            const policy = global.CaissaKnowledgeMappingPolicy;
            return policy.rules.filter(rule =>
                rule.categories.includes(evidence.category)
                && (!rule.phase || evidence.phase === rule.phase)
                && rule.tags.every(tag => evidence.technicalTags.includes(tag)))
                .map(rule => {
                    const confidence = Math.min(1, rule.score
                        + (evidence.signals.attemptMatchedReference === true ? 0.05 : 0));
                    return freeze({ conceptId: rule.conceptId,
                    confidence,
                    confidenceBand: band(confidence),
                    reasonCodes: freeze([
                        `CATEGORY_${String(evidence.category).toUpperCase().replace(/-/g, '_')}`,
                        ...rule.tags.map(tag => `SIGNAL_${tag.toUpperCase().replace(/-/g, '_')}`)
                    ]), exactUnitKey: rule.exactUnitKey });
                })
                .sort((a, b) => b.confidence - a.confidence || a.conceptId.localeCompare(b.conceptId));
        }
        function resolveKnowledgeUnit(concept, releaseId) {
            const policy = global.CaissaKnowledgeMappingPolicy;
            diagnostics.exactKnowledgeLookups += 1;
            if (releaseId !== policy.releaseId || concept.confidenceBand !== 'high' || !concept.exactUnitKey) {
                if (concept.exactUnitKey && concept.confidenceBand !== 'high')
                    diagnostics.lowConfidenceLinksSuppressed += 1;
                return null;
            }
            return policy.units[concept.exactUnitKey] || null;
        }
        function map(input) {
            const request = input?.schemaVersion
                ? global.CaissaKnowledgeMappingContracts.createRequest(input) : input;
            if (!request?.ok) return operation(false, request?.reasonCode || 'INVALID_KNOWLEDGE_MAPPING_REQUEST');
            const value = request.value; diagnostics.mappingRequests += 1;
            diagnostics.evidenceObjects += value.evidence.length;
            const chosen = []; const seen = new Set();
            for (const evidence of value.evidence) {
                const inferred = inferConcepts(evidence)[0];
                if (!inferred) continue;
                if (seen.has(inferred.conceptId)) {
                    diagnostics.duplicateConceptsSuppressed += 1; continue;
                }
                seen.add(inferred.conceptId);
                const unit = resolveKnowledgeUnit(inferred, value.knowledgeReleaseId);
                const scaffold = global.CaissaKnowledgeMappingPolicy.scaffolds[inferred.conceptId] || [];
                chosen.push(freeze({
                    mappingId: `mapping:${value.mappingRequestId}:${chosen.length + 1}`,
                    sourceMomentId: evidence.momentId, replayStepId: evidence.replayStepId,
                    conceptId: inferred.conceptId, confidence: inferred.confidence,
                    confidenceBand: inferred.confidenceBand, reasonCodes: inferred.reasonCodes,
                    knowledgeUnit: unit ? freeze({ ...unit }) : null,
                    scaffolding: freeze({ promptTemplateId: scaffold[0] || null,
                        explanationTemplateId: scaffold[1] || null })
                }));
                if (chosen.length >= value.requestedConceptLimit) break;
            }
            const result = freeze({
                schemaVersion: SCHEMA_VERSION,
                mappingResultId: `knowledge-result:${value.mappingRequestId}`,
                mappingRequestId: value.mappingRequestId, knowledgeReleaseId: value.knowledgeReleaseId,
                status: chosen.length ? 'mapped' : 'unmapped', mappings: freeze(chosen),
                unmappedEvidenceCount: Math.max(0, value.evidence.length - chosen.length),
                partial: chosen.length < value.evidence.length,
                capabilities: freeze({ replayEnrichment: true, postGameSummary: true,
                    trainingMemoryWrite: false, masteryWrite: false, recommendations: false }),
                diagnostics: freeze({ deterministic: true, privateFields: 0 })
            });
            if (!global.CaissaKnowledgeMappingContracts.validateResult(result).ok)
                return operation(false, 'INVALID_KNOWLEDGE_MAPPING_RESULT');
            while (results.size >= global.CaissaKnowledgeMappingPolicy.limits.results)
                results.delete(results.keys().next().value);
            results.set(result.mappingResultId, result);
            diagnostics.conceptsInferred += chosen.length;
            return operation(true, chosen.length ? 'KNOWLEDGE_MAPPED' : 'NO_DEFENSIBLE_MAPPING', result);
        }
        return freeze({
            schemaVersion: SCHEMA_VERSION,
            validateEvidence: value => global.CaissaConceptEvidence.validate(value),
            inferConcepts, resolveKnowledgeUnit, map,
            getResult: id => results.get(id) || null,
            inspect: () => freeze({ schemaVersion: SCHEMA_VERSION, registryEntries: results.size,
                ...diagnostics }),
            dispose: () => { results.clear(); return operation(true, 'DISPOSED'); }
        });
    }
    const mapper = create();
    global.CaissaEducationalConceptMapper = freeze({
        schemaVersion: SCHEMA_VERSION, create,
        validateEvidence: value => mapper.validateEvidence(value),
        inferConcepts: (...args) => mapper.inferConcepts(...args),
        resolveKnowledgeUnit: (...args) => mapper.resolveKnowledgeUnit(...args),
        map: request => mapper.map(request), getResult: id => mapper.getResult(id),
        inspect: () => mapper.inspect(), dispose: () => mapper.dispose()
    });
})(typeof window !== 'undefined' ? window : globalThis);
