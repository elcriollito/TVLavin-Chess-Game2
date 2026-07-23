import { KNOWLEDGE_UNIT_REGISTRY } from '../indexes/manifest.js';
import { validateKnowledgeRepository } from '../validation/validate-knowledge.js';

export function buildEditorialReport(units = KNOWLEDGE_UNIT_REGISTRY) {
    const validation = validateKnowledgeRepository(units);
    return {
        valid: validation.valid,
        counts: {
            units: units.length,
            published: units.filter(value => value.status === 'published').length,
            positions: units.reduce((count, value) => count + value.positions.length, 0),
            relationships: units.reduce((count, value) => count + value.relationships.length + value.education.prerequisites.length, 0)
        },
        units: [...units].sort((a, b) => a.id.localeCompare(b.id)).map(value => ({
            id: value.id,
            status: value.status,
            contentVersion: value.contentVersion,
            reviewerAssigned: Boolean(value.editorial.reviewer),
            verificationState: value.editorial.verificationState,
            reviewStatus: value.editorial.reviewStatus,
            localeReadiness: value.localization.translationStatus,
            positions: value.positions.length,
            learningObjects: Object.fromEntries(Object.entries(value.learningObjects).map(([type, items]) => [type, items.length])),
            relationships: value.relationships.length + value.education.prerequisites.length
        })),
        errors: validation.errors
    };
}
