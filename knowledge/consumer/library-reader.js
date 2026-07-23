import { SUPPORTED_KNOWLEDGE_SCHEMA_VERSIONS } from '../schema/knowledge-unit.js';
import { SUPPORTED_LIBRARY_SNAPSHOT_SCHEMAS, assertSafeReleaseId } from '../snapshots/snapshot-contract.js';
import { verifyLibrarySnapshot } from '../snapshots/verify-snapshot.js';

const clone = value => structuredClone(value);
const freeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
};
const output = value => value == null ? null : freeze(clone(value));

export class LibraryReleaseError extends Error {
    constructor(errors) {
        super(`Library release verification failed:\n${errors.map(value => `${value.code} ${value.path}: ${value.message}`).join('\n')}`);
        this.name = 'LibraryReleaseError';
        this.errors = errors;
    }
}

export function createLibraryReader(verifiedData) {
    const { release, manifest, graph, taxonomy, units: payloads } = verifiedData;
    const units = payloads.map(value => value.unit).sort((a, b) => a.id.localeCompare(b.id));
    const byId = new Map(units.map(value => [value.id, value]));
    const summaries = [...manifest.units].sort((a, b) => a.id.localeCompare(b.id));
    const summaryById = new Map(summaries.map(value => [value.id, value]));
    const bySlug = new Map(summaries.map(value => [value.scopedSlug, byId.get(value.id)]));
    const registries = taxonomy.registries;
    const matches = (unit, filters) =>
        (!filters.domain || unit.domain === filters.domain) &&
        (!filters.locale || unit.localization.availableLocales.includes(filters.locale)) &&
        (!filters.difficulty || unit.education.difficulty === filters.difficulty) &&
        (!filters.learnerLevel || unit.education.expectedLearnerLevel === filters.learnerLevel) &&
        (!filters.knowledgeType || unit.education.knowledgeType === filters.knowledgeType) &&
        (!filters.endgameFamily || unit.education.endgameFamily === filters.endgameFamily) &&
        (!filters.theme || unit.education.themes.includes(filters.theme)) &&
        (!filters.skill || unit.education.skills.includes(filters.skill));
    const edges = (section, id, type) => Object.entries(graph[section]?.[id] ?? {})
        .filter(([edgeType]) => !type || edgeType === type)
        .flatMap(([edgeType, targets]) => targets.map(targetId => ({ type: edgeType, targetId })))
        .sort((a, b) => `${a.type}:${a.targetId}`.localeCompare(`${b.type}:${b.targetId}`));
    return Object.freeze({
        getReleaseMetadata: () => output(release),
        getReleaseFingerprint: () => release.repositoryFingerprint,
        getSupportedDomains: () => output(release.supportedDomains),
        getLocaleCoverage: () => output(release.localeCoverage),
        getCounts: () => output(manifest.counts),
        listUnitSummaries: (filters = {}) => output(summaries.filter(summary => matches(byId.get(summary.id), filters))),
        hasUnit: id => byId.has(id),
        getUnitById: id => output(byId.get(id)),
        getUnitByScopedSlug: scopedSlug => output(bySlug.get(scopedSlug)),
        listUnitsByDomain: domain => output(units.filter(unit => unit.domain === domain)),
        filterUnits: (filters = {}) => output(units.filter(unit => matches(unit, filters))),
        getOutgoing: (id, type) => output(edges('forward', id, type)),
        getIncoming: (id, type) => output(edges('reverse', id, type)),
        getDirectPrerequisites: id => output(graph.prerequisites?.[id]?.direct ?? []),
        getDirectDependents: id => output(graph.prerequisites?.[id]?.dependents ?? []),
        getRelatedSummaries: (id, direction = 'outgoing', type) => output(
            edges(direction === 'incoming' ? 'reverse' : 'forward', id, type).map(edge => summaryById.get(edge.targetId)).filter(Boolean)
        ),
        listTaxonomyValues: registryName => output(registries[registryName]?.entries ?? []),
        getTaxonomyEntry: (registryName, idOrAlias) => {
            const entries = registries[registryName]?.entries ?? [];
            return output(entries.find(value => value.id === idOrAlias) ??
                entries.find(value => value.status === 'active' && value.aliases?.includes(idOrAlias)));
        },
        supportsReleaseSchema: version => SUPPORTED_LIBRARY_SNAPSHOT_SCHEMAS.includes(version),
        supportsKnowledgeSchema: version => SUPPORTED_KNOWLEDGE_SCHEMA_VERSIONS.includes(version)
    });
}

export async function loadLibraryRelease({ releasesDirectory, releaseId }) {
    assertSafeReleaseId(releaseId);
    const verification = await verifyLibrarySnapshot({ releasesDirectory, releaseId });
    if (!verification.valid) throw new LibraryReleaseError(verification.errors);
    return createLibraryReader(verification.data);
}
