import { KNOWLEDGE_UNIT_REGISTRY } from '../indexes/manifest.js';
import { TAXONOMY_REGISTRIES, TAXONOMY_VERSION } from '../taxonomy/registries.js';
import { validateTaxonomyRegistries } from '../taxonomy/validate-taxonomy.js';
import { validateKnowledgeRepository } from '../validation/validate-knowledge.js';
import { buildKnowledgeRelease, contentHash, RELEASE_GENERATOR_VERSION, RELEASE_SCHEMA_VERSION } from '../release/build-release.js';
import { canonicalJson, sha256 } from '../release/canonical-json.js';
import {
    DEFAULT_LIBRARY_VERSION, DEFAULT_RELEASE_LABEL, LIBRARY_SNAPSHOT_SCHEMA_VERSION
} from './snapshot-contract.js';

const json = value => `${canonicalJson(value, 2)}\n`;
const publicUnit = unit => {
    const { editorial: _privateEditorial, ...released } = structuredClone(unit);
    return released;
};

export function buildLibrarySnapshot(source = KNOWLEDGE_UNIT_REGISTRY, options = {}) {
    const taxonomyValidation = validateTaxonomyRegistries();
    const unitValidation = validateKnowledgeRepository(source);
    if (!taxonomyValidation.valid || !unitValidation.valid) throw new Error('snapshot-source-invalid');
    const production = source.filter(unit => unit.status === 'published').sort((a, b) => a.id.localeCompare(b.id));
    const working = buildKnowledgeRelease(source);
    const taxonomy = {
        taxonomyVersion: TAXONOMY_VERSION,
        registries: TAXONOMY_REGISTRIES
    };
    const taxonomyHash = sha256(taxonomy);
    const releaseId = `rel-${sha256({
        snapshotSchemaVersion: LIBRARY_SNAPSHOT_SCHEMA_VERSION,
        repositoryFingerprint: working.manifest.repositoryFingerprint,
        taxonomyHash
    })}`;
    const unitRecords = production.map(unit => {
        const hash = contentHash(unit);
        const file = `units/${sha256(unit.id)}.json`;
        return {
            id: unit.id,
            file,
            schemaVersion: unit.schemaVersion,
            contentVersion: unit.contentVersion,
            contentHash: hash
        };
    });
    const release = {
        releaseId,
        snapshotSchemaVersion: LIBRARY_SNAPSHOT_SCHEMA_VERSION,
        releaseSchemaVersion: RELEASE_SCHEMA_VERSION,
        generatorVersion: RELEASE_GENERATOR_VERSION,
        taxonomyVersion: TAXONOMY_VERSION,
        taxonomyHash,
        repositoryFingerprint: working.manifest.repositoryFingerprint,
        libraryVersion: options.libraryVersion ?? DEFAULT_LIBRARY_VERSION,
        releaseLabel: options.releaseLabel ?? DEFAULT_RELEASE_LABEL,
        publication: {
            status: options.status ?? 'development',
            publishedAt: options.publishedAt ?? null
        },
        supportedDomains: Object.keys(working.manifest.counts.byDomain).sort(),
        unitCount: production.length,
        localeCoverage: Object.keys(working.manifest.counts.byLocaleAvailability).sort(),
        compatibility: {
            supportedKnowledgeSchemaVersions: [...new Set(production.map(unit => unit.schemaVersion))].sort(),
            minimumConsumerSnapshotSchema: LIBRARY_SNAPSHOT_SCHEMA_VERSION
        },
        files: {
            manifest: 'manifest.json',
            graph: 'graph.json',
            taxonomy: 'taxonomy.json',
            units: unitRecords
        },
        integrity: {
            algorithm: 'sha256',
            manifestHash: sha256(working.manifest),
            graphHash: sha256(working.graph)
        }
    };
    release.integrity.releaseHash = sha256(release);
    const files = {
        'release.json': json(release),
        'manifest.json': json(working.manifest),
        'graph.json': json(working.graph),
        'taxonomy.json': json(taxonomy)
    };
    for (const [index, unit] of production.entries()) {
        const record = unitRecords[index];
        files[record.file] = json({
            releaseId,
            id: unit.id,
            schemaVersion: unit.schemaVersion,
            contentVersion: unit.contentVersion,
            contentHash: record.contentHash,
            unit: publicUnit(unit)
        });
    }
    return Object.freeze({ releaseId, release, files: Object.freeze(files) });
}
