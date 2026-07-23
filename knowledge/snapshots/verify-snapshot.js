import { canonicalJson, sha256 } from '../release/canonical-json.js';
import { RELEASE_GENERATOR_VERSION, RELEASE_SCHEMA_VERSION } from '../release/release-contract.js';
import { readSnapshotFiles } from './snapshot-files.js';
import {
    assertSafeReleaseId, LIBRARY_SNAPSHOT_SCHEMA_VERSION, SUPPORTED_LIBRARY_SNAPSHOT_SCHEMAS
} from './snapshot-contract.js';

const json = value => `${canonicalJson(value, 2)}\n`;
const error = (code, path, message) => ({ code, path, message });
const parse = (files, path, errors) => {
    if (!(path in files)) { errors.push(error('missing-file', path, `Missing ${path}`)); return null; }
    try {
        const value = JSON.parse(files[path]);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected object');
        if (files[path] !== json(value)) errors.push(error('noncanonical-file', path, `${path} is not canonical JSON`));
        return value;
    } catch (cause) {
        errors.push(error('malformed-json', path, `Invalid JSON object: ${cause.message}`));
        return null;
    }
};

export function verifySnapshotFiles(files, requestedReleaseId) {
    const errors = [];
    let safeId = requestedReleaseId;
    try { safeId = assertSafeReleaseId(requestedReleaseId); } catch (cause) {
        errors.push(error('invalid-release-id', 'releaseId', cause.message));
    }
    const release = parse(files, 'release.json', errors);
    if (!release) return { valid: false, errors, data: null };
    if (!SUPPORTED_LIBRARY_SNAPSHOT_SCHEMAS.includes(release.snapshotSchemaVersion)) {
        errors.push(error('unsupported-snapshot-schema', 'release.snapshotSchemaVersion', String(release.snapshotSchemaVersion)));
    }
    if (release.releaseSchemaVersion !== RELEASE_SCHEMA_VERSION) errors.push(error('incompatible-release-schema', 'release.releaseSchemaVersion', String(release.releaseSchemaVersion)));
    if (release.generatorVersion !== RELEASE_GENERATOR_VERSION) errors.push(error('incompatible-generator', 'release.generatorVersion', String(release.generatorVersion)));
    if (release.releaseId !== safeId) errors.push(error('release-id-mismatch', 'release.releaseId', `${release.releaseId} != ${safeId}`));
    const { releaseHash, ...integrityWithoutReleaseHash } = release.integrity ?? {};
    const releaseWithoutSelfHash = { ...release, integrity: integrityWithoutReleaseHash };
    if (releaseHash !== sha256(releaseWithoutSelfHash)) errors.push(error('release-metadata-hash-mismatch', 'release.integrity.releaseHash', 'Release metadata hash does not match'));
    const manifestPath = release.files?.manifest;
    const graphPath = release.files?.graph;
    const taxonomyPath = release.files?.taxonomy;
    for (const [name, path] of Object.entries({ manifest: manifestPath, graph: graphPath, taxonomy: taxonomyPath })) {
        if (!['manifest.json', 'graph.json', 'taxonomy.json'].includes(path)) errors.push(error('invalid-file-reference', `release.files.${name}`, String(path)));
    }
    const manifest = parse(files, manifestPath ?? 'manifest.json', errors);
    const graph = parse(files, graphPath ?? 'graph.json', errors);
    const taxonomy = parse(files, taxonomyPath ?? 'taxonomy.json', errors);
    const unitRecords = Array.isArray(release.files?.units) ? release.files.units : [];
    if (!Array.isArray(release.files?.units)) errors.push(error('invalid-unit-index', 'release.files.units', 'Expected ordered unit records'));
    const ids = unitRecords.map(value => value?.id);
    if (new Set(ids).size !== ids.length) errors.push(error('duplicate-unit-id', 'release.files.units', 'Duplicate unit IDs'));
    if (JSON.stringify(ids) !== JSON.stringify([...ids].sort())) errors.push(error('unstable-unit-order', 'release.files.units', 'Unit records must be ID sorted'));
    if (release.unitCount !== unitRecords.length) errors.push(error('unit-count-mismatch', 'release.unitCount', `${release.unitCount} != ${unitRecords.length}`));
    const units = [];
    for (const [index, record] of unitRecords.entries()) {
        const path = record?.file;
        if (typeof path !== 'string' || !/^units\/[a-f0-9]{64}\.json$/.test(path)) {
            errors.push(error('invalid-unit-file', `release.files.units[${index}].file`, String(path)));
            continue;
        }
        const payload = parse(files, path, errors);
        if (!payload) continue;
        if (!payload.unit || typeof payload.unit !== 'object' || Array.isArray(payload.unit)) {
            errors.push(error('invalid-unit-shape', `${path}.unit`, 'Unit payload must be a JSON object'));
            continue;
        }
        if (payload.releaseId !== release.releaseId) errors.push(error('unit-release-mismatch', path, String(payload.releaseId)));
        for (const field of ['id', 'schemaVersion', 'contentVersion', 'contentHash']) {
            if (payload[field] !== record[field]) errors.push(error('unit-index-mismatch', `${path}.${field}`, `${payload[field]} != ${record[field]}`));
        }
        if (payload.id !== payload.unit?.id || payload.schemaVersion !== payload.unit?.schemaVersion || payload.contentVersion !== payload.unit?.contentVersion) {
            errors.push(error('unit-identity-mismatch', path, 'Payload envelope and unit identity differ'));
        }
        if ('editorial' in (payload.unit ?? {})) errors.push(error('private-editorial-exposed', `${path}.unit.editorial`, 'Released unit contains editorial administration'));
        const actualHash = sha256(payload.unit);
        if (actualHash !== payload.contentHash) errors.push(error('unit-content-hash-mismatch', `${path}.contentHash`, `${actualHash} != ${payload.contentHash}`));
        if (!Array.isArray(payload.unit?.localization?.availableLocales) ||
            !payload.unit.localization.availableLocales.includes(payload.unit.localization.defaultLocale)) {
            errors.push(error('invalid-unit-locales', `${path}.unit.localization`, 'Default locale must be available'));
        }
        units.push(payload);
    }
    const expectedFiles = new Set(['release.json', manifestPath, graphPath, taxonomyPath, ...unitRecords.map(value => value?.file)]);
    for (const path of Object.keys(files).sort()) if (!expectedFiles.has(path)) errors.push(error('unexpected-file', path, `Unexpected snapshot file: ${path}`));
    if (manifest) {
        if (release.integrity?.manifestHash !== sha256(manifest)) errors.push(error('manifest-hash-mismatch', 'release.integrity.manifestHash', 'Manifest hash does not match'));
        if (manifest.repositoryFingerprint !== release.repositoryFingerprint) errors.push(error('repository-fingerprint-mismatch', 'manifest.repositoryFingerprint', 'Manifest and release fingerprints differ'));
        if (manifest.units?.length !== unitRecords.length) errors.push(error('manifest-unit-count-mismatch', 'manifest.units', 'Manifest count differs'));
        if (JSON.stringify((manifest.units ?? []).map(value => value.id)) !== JSON.stringify(ids)) {
            errors.push(error('manifest-unit-order-mismatch', 'manifest.units', 'Manifest summaries must match release unit order'));
        }
        for (const record of unitRecords) {
            const summary = manifest.units?.find(value => value.id === record.id);
            if (!summary || summary.contentHash !== record.contentHash) errors.push(error('manifest-unit-mismatch', `manifest.units.${record.id}`, 'Missing or mismatched unit summary'));
        }
        const fingerprint = sha256({
            releaseSchemaVersion: manifest.releaseSchemaVersion,
            generatorVersion: manifest.generatorVersion,
            taxonomyVersion: manifest.taxonomyVersion,
            units: [...(manifest.units ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map(value => ({ id: value.id, contentHash: value.contentHash }))
        });
        if (fingerprint !== release.repositoryFingerprint) errors.push(error('repository-fingerprint-invalid', 'release.repositoryFingerprint', `${fingerprint} != ${release.repositoryFingerprint}`));
        if (JSON.stringify(release.supportedDomains) !== JSON.stringify(Object.keys(manifest.counts?.byDomain ?? {}).sort())) {
            errors.push(error('supported-domains-mismatch', 'release.supportedDomains', 'Supported domains differ from manifest'));
        }
        if (JSON.stringify(release.localeCoverage) !== JSON.stringify(Object.keys(manifest.counts?.byLocaleAvailability ?? {}).sort())) {
            errors.push(error('locale-coverage-mismatch', 'release.localeCoverage', 'Locale coverage differs from manifest'));
        }
    }
    if (graph) {
        if (release.integrity?.graphHash !== sha256(graph)) errors.push(error('graph-hash-mismatch', 'release.integrity.graphHash', 'Graph hash does not match'));
        const known = new Set(ids);
        for (const section of ['forward', 'reverse']) {
            for (const [id, groups] of Object.entries(graph[section] ?? {})) {
                if (!known.has(id)) errors.push(error('broken-graph-node', `graph.${section}.${id}`, 'Unknown graph node'));
                for (const targets of Object.values(groups ?? {})) for (const target of targets) {
                    if (!known.has(target)) errors.push(error('broken-graph-target', `graph.${section}.${id}`, `Unknown target: ${target}`));
                }
            }
        }
        for (const [id, links] of Object.entries(graph.prerequisites ?? {})) {
            if (!known.has(id)) errors.push(error('broken-graph-node', `graph.prerequisites.${id}`, 'Unknown prerequisite node'));
            for (const target of [...(links.direct ?? []), ...(links.dependents ?? [])]) {
                if (!known.has(target)) errors.push(error('broken-graph-target', `graph.prerequisites.${id}`, `Unknown target: ${target}`));
            }
        }
    }
    if (taxonomy) {
        const actual = sha256(taxonomy);
        if (actual !== release.taxonomyHash) errors.push(error('taxonomy-hash-mismatch', 'release.taxonomyHash', `${actual} != ${release.taxonomyHash}`));
        if (taxonomy.taxonomyVersion !== release.taxonomyVersion || taxonomy.taxonomyVersion !== manifest?.taxonomyVersion) {
            errors.push(error('taxonomy-version-mismatch', 'taxonomy.taxonomyVersion', 'Taxonomy versions differ'));
        }
        const lookup = name => new Set((taxonomy.registries?.[name]?.entries ?? []).map(value => value.id));
        for (const payload of units) {
            const unit = payload.unit;
            const controlled = [
                ['domains', unit.domain],
                ['knowledgeTypes', unit.education?.knowledgeType],
                ['endgameFamilies', unit.education?.endgameFamily],
                ['difficulties', unit.education?.difficulty],
                ['learnerLevels', unit.education?.expectedLearnerLevel],
                ...((unit.education?.themes ?? []).map(value => ['themes', value])),
                ...((unit.education?.skills ?? []).map(value => ['skills', value])),
                ...((unit.positions ?? []).map(value => ['positionRoles', value.role])),
                ...((unit.integrations?.capabilities ?? []).map(value => ['integrationCapabilities', value]))
            ];
            for (const [registry, value] of controlled) {
                if (value && !lookup(registry).has(value)) errors.push(error('unit-taxonomy-mismatch', `${payload.id}.${registry}`, `Unknown released taxonomy value: ${value}`));
            }
        }
    }
    if (release && taxonomy) {
        const expectedId = `rel-${sha256({
            snapshotSchemaVersion: LIBRARY_SNAPSHOT_SCHEMA_VERSION,
            repositoryFingerprint: release.repositoryFingerprint,
            taxonomyHash: release.taxonomyHash
        })}`;
        if (expectedId !== release.releaseId) errors.push(error('immutable-release-id-invalid', 'release.releaseId', `${expectedId} != ${release.releaseId}`));
    }
    const supportedSchemas = [...new Set(unitRecords.map(value => value.schemaVersion))].sort();
    if (JSON.stringify(release.compatibility?.supportedKnowledgeSchemaVersions) !== JSON.stringify(supportedSchemas)) {
        errors.push(error('knowledge-schema-compatibility-mismatch', 'release.compatibility.supportedKnowledgeSchemaVersions', 'Knowledge schema coverage differs from payloads'));
    }
    errors.sort((a, b) => [a.path, a.code, a.message].join('|').localeCompare([b.path, b.code, b.message].join('|')));
    return { valid: errors.length === 0, errors, data: errors.length ? null : { release, manifest, graph, taxonomy, units } };
}

export async function verifyLibrarySnapshot({ releasesDirectory, releaseId }) {
    try {
        const files = await readSnapshotFiles(releasesDirectory, releaseId);
        return verifySnapshotFiles(files, releaseId);
    } catch (cause) {
        return { valid: false, errors: [error('release-read-failed', 'release', cause.message)], data: null };
    }
}
