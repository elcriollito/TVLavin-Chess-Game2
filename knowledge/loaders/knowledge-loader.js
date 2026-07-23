import { KNOWLEDGE_UNIT_REGISTRY } from '../indexes/manifest.js';
import { validateKnowledgeRepository } from '../validation/validate-knowledge.js';

const clone = value => structuredClone(value);
const deepFreeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
};

export class KnowledgeRepositoryError extends Error {
    constructor(validation) {
        super(`Knowledge repository validation failed:\n${validation.errors.map(error => `${error.code} ${error.unitId} ${error.path}: ${error.message}`).join('\n')}`);
        this.name = 'KnowledgeRepositoryError';
        this.validation = validation;
    }
}
export function createKnowledgeLoader(options = {}) {
    const includeDrafts = options.includeDrafts === true;
    const source = options.units ?? KNOWLEDGE_UNIT_REGISTRY;
    const validation = validateKnowledgeRepository(source);
    if (!validation.valid) throw new KnowledgeRepositoryError(validation);
    const units = source
        .filter(unit => includeDrafts || unit.status !== 'draft')
        .map(unit => deepFreeze(clone(unit)))
        .sort((a, b) => a.id.localeCompare(b.id));
    const byId = new Map(units.map(unit => [unit.id, unit]));
    const bySlug = new Map(units.map(unit => [`${unit.domain}:${unit.slug}`, unit]));
    const result = value => value ? deepFreeze(clone(value)) : null;
    const filter = criteria => units.filter(unit =>
        (!criteria.domain || unit.domain === criteria.domain) &&
        (!criteria.status || unit.status === criteria.status) &&
        (!criteria.locale || unit.localization.availableLocales.includes(criteria.locale))
    ).map(result);
    return Object.freeze({
        loadAll: (criteria = {}) => filter(criteria),
        loadById: id => result(byId.get(id)),
        loadBySlug: (slug, domain = 'endgames') => result(bySlug.get(`${domain}:${slug}`)),
        validation: () => validation
    });
}
