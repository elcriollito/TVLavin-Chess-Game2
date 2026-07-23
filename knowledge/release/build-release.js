import { KNOWLEDGE_UNIT_REGISTRY } from '../indexes/manifest.js';
import { TAXONOMY_VERSION } from '../taxonomy/registries.js';
import { validateKnowledgeRepository } from '../validation/validate-knowledge.js';
import { canonicalJson, sha256 } from './canonical-json.js';

export const RELEASE_SCHEMA_VERSION = '1.0.0';
export const RELEASE_GENERATOR_VERSION = '1.0.0';

export function contentHash(unit) {
    const { editorial: _editorial, ...content } = unit;
    return sha256(content);
}

const countBy = (units, select) => Object.fromEntries([...units.reduce((counts, unit) => {
    for (const value of select(unit)) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
}, new Map()).entries()].sort(([a], [b]) => a.localeCompare(b)));

function authoredEdges(unit) {
    return [
        ...(unit.education.prerequisites ?? []).map(targetId => ({ type: 'prerequisite', targetId })),
        ...(unit.relationships ?? []).map(edge => ({ type: edge.type, targetId: edge.targetId }))
    ].sort((a, b) => `${a.type}:${a.targetId}`.localeCompare(`${b.type}:${b.targetId}`));
}

export function buildGraphIndexes(units) {
    const ids = units.map(unit => unit.id).sort();
    const forward = Object.fromEntries(ids.map(id => [id, {}]));
    const reverse = Object.fromEntries(ids.map(id => [id, {}]));
    for (const unit of units) {
        for (const edge of authoredEdges(unit)) {
            (forward[unit.id][edge.type] ??= []).push(edge.targetId);
            (reverse[edge.targetId][edge.type] ??= []).push(unit.id);
        }
    }
    for (const index of [forward, reverse]) {
        for (const id of ids) {
            index[id] = Object.fromEntries(Object.entries(index[id]).sort(([a], [b]) => a.localeCompare(b))
                .map(([type, targets]) => [type, [...new Set(targets)].sort()]));
        }
    }
    const prerequisites = Object.fromEntries(ids.map(id => [id, {
        direct: [...(forward[id].prerequisite ?? [])],
        dependents: [...(reverse[id].prerequisite ?? [])]
    }]));
    return { schemaVersion: RELEASE_SCHEMA_VERSION, forward, reverse, prerequisites };
}

export function buildKnowledgeRelease(source = KNOWLEDGE_UNIT_REGISTRY) {
    const validation = validateKnowledgeRepository(source);
    if (!validation.valid) throw new Error(`Cannot build invalid knowledge release:\n${validation.errors.map(value => `${value.code} ${value.unitId} ${value.path}`).join('\n')}`);
    const units = source.filter(unit => unit.status === 'published').sort((a, b) => a.id.localeCompare(b.id));
    const hashes = new Map(units.map(unit => [unit.id, contentHash(unit)]));
    const summaries = units.map(unit => {
        const locale = unit.localization.defaultLocale;
        const relationships = authoredEdges(unit);
        return {
            id: unit.id,
            scopedSlug: `${unit.domain}/${unit.slug}`,
            title: unit.localization.content[locale].title,
            summary: unit.localization.content[locale].summary,
            domain: unit.domain,
            knowledgeType: unit.education.knowledgeType,
            endgameFamily: unit.education.endgameFamily ?? null,
            themes: [...unit.education.themes].sort(),
            skills: [...unit.education.skills].sort(),
            difficulty: unit.education.difficulty,
            learnerLevel: unit.education.expectedLearnerLevel,
            prerequisites: [...unit.education.prerequisites].sort(),
            relationshipCounts: countBy([{ relationships }], value => value.relationships.map(edge => edge.type)),
            schemaVersion: unit.schemaVersion,
            contentVersion: unit.contentVersion,
            defaultLocale: locale,
            availableLocales: [...unit.localization.availableLocales].sort(),
            verificationState: unit.editorial.verificationState,
            updatedAt: unit.editorial.updatedAt,
            contentHash: hashes.get(unit.id)
        };
    });
    const fingerprint = sha256({
        releaseSchemaVersion: RELEASE_SCHEMA_VERSION,
        generatorVersion: RELEASE_GENERATOR_VERSION,
        taxonomyVersion: TAXONOMY_VERSION,
        units: units.map(unit => ({ id: unit.id, contentHash: hashes.get(unit.id) }))
    });
    const manifest = {
        releaseSchemaVersion: RELEASE_SCHEMA_VERSION,
        generatorVersion: RELEASE_GENERATOR_VERSION,
        taxonomyVersion: TAXONOMY_VERSION,
        repositoryFingerprint: fingerprint,
        counts: {
            totalProductionUnits: units.length,
            byDomain: countBy(units, unit => [unit.domain]),
            byStatus: countBy(units, unit => [unit.status]),
            byLocaleAvailability: countBy(units, unit => unit.localization.availableLocales)
        },
        units: summaries
    };
    return Object.freeze({ manifest, graph: buildGraphIndexes(units) });
}

export function serializeKnowledgeRelease(source = KNOWLEDGE_UNIT_REGISTRY) {
    const release = buildKnowledgeRelease(source);
    return Object.freeze({
        manifest: `${canonicalJson(release.manifest, 2)}\n`,
        graph: `${canonicalJson(release.graph, 2)}\n`
    });
}
