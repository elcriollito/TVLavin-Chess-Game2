const PINNED_RELEASE = Object.freeze({
  id: 'rel-a26763c6382b7878595ed8ae0da603c4679bf906e4357fdb406952db5867e2e1',
  fingerprint: '2635057f80fe1f244fd1c60e7d52af97c76de4102e5ff07e66d9daaa69c77886',
  releaseSchemaVersion: '1.0.0',
  snapshotSchemaVersion: '1.0.0',
  taxonomyVersion: '1.4.0',
  unitCount: 17
});

export class LibraryReleaseError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'LibraryReleaseError';
  }
}

const clone = value => structuredClone(value);
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
const freeze = value => deepFreeze(clone(value));

function assert(condition, message) {
  if (!condition) throw new LibraryReleaseError(message);
}

async function fetchJson(fetchImpl, url) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new LibraryReleaseError(`Could not load ${url}.`, error);
  }
  if (!response.ok) {
    throw new LibraryReleaseError(`Could not load ${url} (HTTP ${response.status}).`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new LibraryReleaseError(`Invalid JSON in ${url}.`, error);
  }
}

function safeReleasePath(path, expected) {
  assert(path === expected, `Unexpected release file path: ${path}.`);
  return path;
}

function safeUnitPath(path) {
  assert(/^units\/[a-f0-9]{64}\.json$/.test(path), `Unexpected unit file path: ${path}.`);
  return path;
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function includesAny(values, selected) {
  return !selected || (values || []).some(value => normalize(value) === normalize(selected));
}

export async function loadPinnedEndgameLibrary({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = '/knowledge/releases'
} = {}) {
  assert(typeof fetchImpl === 'function', 'A fetch implementation is required.');
  const root = `${baseUrl.replace(/\/$/, '')}/${PINNED_RELEASE.id}`;
  const release = await fetchJson(fetchImpl, `${root}/release.json`);

  assert(release.releaseId === PINNED_RELEASE.id, 'The loaded release ID does not match the pinned release.');
  assert(release.releaseSchemaVersion === PINNED_RELEASE.releaseSchemaVersion, 'Unsupported release schema.');
  assert(release.snapshotSchemaVersion === PINNED_RELEASE.snapshotSchemaVersion, 'Unsupported snapshot schema.');
  assert(release.repositoryFingerprint === PINNED_RELEASE.fingerprint, 'The release fingerprint does not match the pinned release.');
  assert(release.taxonomyVersion === PINNED_RELEASE.taxonomyVersion, 'Unsupported taxonomy version.');
  assert(release.unitCount === PINNED_RELEASE.unitCount, 'The release unit count is incomplete.');

  const files = release.files || {};
  const [manifest, graph, taxonomy] = await Promise.all([
    fetchJson(fetchImpl, `${root}/${safeReleasePath(files.manifest, 'manifest.json')}`),
    fetchJson(fetchImpl, `${root}/${safeReleasePath(files.graph, 'graph.json')}`),
    fetchJson(fetchImpl, `${root}/${safeReleasePath(files.taxonomy, 'taxonomy.json')}`)
  ]);

  assert(manifest.releaseSchemaVersion === PINNED_RELEASE.releaseSchemaVersion, 'Manifest schema mismatch.');
  assert(manifest.repositoryFingerprint === PINNED_RELEASE.fingerprint, 'Manifest fingerprint mismatch.');
  assert(manifest.counts?.totalProductionUnits === PINNED_RELEASE.unitCount, 'Manifest unit count mismatch.');
  assert((manifest.units || []).length === PINNED_RELEASE.unitCount, 'Manifest summaries are incomplete.');
  assert(graph.schemaVersion === PINNED_RELEASE.snapshotSchemaVersion, 'Graph schema mismatch.');
  assert(taxonomy.taxonomyVersion === PINNED_RELEASE.taxonomyVersion, 'Taxonomy snapshot mismatch.');
  assert((manifest.counts?.byStatus?.published ?? PINNED_RELEASE.unitCount) === PINNED_RELEASE.unitCount,
    'The immutable library contains non-published content.');

  const entriesById = new Map((files.units || []).map(entry => [entry.id, entry]));
  const summariesById = new Map(manifest.units.map(summary => [summary.id, summary]));
  assert(entriesById.size === PINNED_RELEASE.unitCount, 'Release unit shards are incomplete.');
  assert(manifest.units.every(summary => entriesById.has(summary.id)), 'Manifest and release unit identities differ.');
  const unitCache = new Map();

  async function getUnitById(id) {
    const entry = entriesById.get(id);
    if (!entry) return null;
    if (!unitCache.has(id)) {
      unitCache.set(id, fetchJson(fetchImpl, `${root}/${safeUnitPath(entry.file)}`).then(shard => {
        assert(shard.releaseId === PINNED_RELEASE.id, `Unit ${id} belongs to another release.`);
        assert(shard.id === id && shard.unit?.id === id, `Unit identity mismatch for ${id}.`);
        return freeze(shard.unit);
      }));
    }
    return clone(await unitCache.get(id));
  }

  async function getUnitByScopedSlug(scopedSlug) {
    const summary = manifest.units.find(item => item.scopedSlug === scopedSlug);
    return summary ? getUnitById(summary.id) : null;
  }

  function filterUnits(filters = {}) {
    const query = normalize(filters.query);
    return manifest.units.filter(unit => {
      const haystack = [
        unit.title, unit.summary, unit.scopedSlug,
        ...(unit.themes || []), ...(unit.skills || [])
      ].map(normalize).join(' ');
      return (!query || haystack.includes(query))
        && (!filters.difficulty || normalize(unit.difficulty) === normalize(filters.difficulty))
        && (!filters.learnerLevel || normalize(unit.learnerLevel) === normalize(filters.learnerLevel))
        && includesAny(unit.themes, filters.theme)
        && includesAny(unit.skills, filters.skill);
    }).map(clone);
  }

  function edges(section, id, type) {
    return Object.entries(graph[section]?.[id] || {})
      .filter(([edgeType]) => !type || edgeType === type)
      .flatMap(([edgeType, targets]) => targets.map(targetId => ({ type: edgeType, targetId })))
      .sort((a, b) => `${a.type}:${a.targetId}`.localeCompare(`${b.type}:${b.targetId}`))
      .map(clone);
  }

  return Object.freeze({
    getReleaseMetadata: () => freeze(release),
    getReleaseFingerprint: () => PINNED_RELEASE.fingerprint,
    getRepositoryFingerprint: () => PINNED_RELEASE.fingerprint,
    getSupportedDomains: () => clone(release.supportedDomains),
    getLocaleCoverage: () => clone(release.localeCoverage),
    getCounts: () => freeze(manifest.counts),
    getManifest: () => freeze(manifest),
    getTaxonomy: () => freeze(taxonomy),
    listUnitSummaries: filterUnits,
    getUnitSummaries: () => manifest.units.map(clone),
    getUnitSummaryById: id => summariesById.has(id) ? clone(summariesById.get(id)) : null,
    hasUnit: id => entriesById.has(id),
    filterUnits,
    getUnitById,
    getUnitByScopedSlug,
    getOutgoing: (id, type) => edges('forward', id, type),
    getIncoming: (id, type) => edges('reverse', id, type),
    getOutgoingRelationships: (id, type) => edges('forward', id, type),
    getIncomingRelationships: (id, type) => edges('reverse', id, type),
    getDirectPrerequisites: id => clone(graph.prerequisites?.[id]?.direct || []),
    getDirectDependents: id => clone(graph.prerequisites?.[id]?.dependents || []),
    listTaxonomyValues: name => freeze(taxonomy.registries[name]?.entries || []),
    getTaxonomyEntry: (name, idOrAlias) => {
      const entries = taxonomy.registries[name]?.entries || [];
      const entry = entries.find(value => value.id === idOrAlias)
        || entries.find(value => value.status === 'active' && value.aliases?.includes(idOrAlias));
      return entry ? freeze(entry) : null;
    },
    supportsReleaseSchema: version => version === PINNED_RELEASE.releaseSchemaVersion,
    supportsKnowledgeSchema: version => version === '1.0.0'
  });
}

export { PINNED_RELEASE };
