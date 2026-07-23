# Season 9.0.3 — Immutable Library Releases and Read-Only Consumer API

Status: implemented foundation

## Boundaries

Authored Knowledge Units and taxonomy registries are repository truth.
`knowledge/generated/` is the reproducible working manifest/index output.
`knowledge/releases/<release-id>/` is an immutable, self-contained publication
product. Runtime consumers load only snapshot JSON through the reader; neither
the verifier nor reader imports authored unit modules.

## Immutable release contract

The snapshot contract is `1.0.0`. `release.json` declares:

- immutable release ID and repository fingerprint;
- snapshot, working-release, generator, and taxonomy versions;
- taxonomy hash;
- human library version and release label;
- publication status and nullable publication timestamp;
- supported domains, locales, and unit count;
- compatibility metadata;
- ordered payload references and identity/version/hash pins;
- SHA-256 hashes for manifest, graph, and release metadata.

Deterministic identity and human publication metadata are separate. The
release ID is:

```text
rel- + SHA-256({
  snapshotSchemaVersion,
  repositoryFingerprint,
  taxonomyHash
})
```

The repository fingerprint remains the Season 9.0.2 hash of ordered unit
content hashes and release contract versions. The taxonomy hash covers the
complete copied taxonomy snapshot. A human semantic `libraryVersion`
(`0.1.0`) and label (`season-9-foundation`) aid communication but are not
identity. `publishedAt` is nullable and never affects release identity.

Changing non-identity metadata for an existing ID creates conflicting bytes
and is rejected rather than overwriting history. A future publication registry
may attach mutable attribution to immutable IDs without altering snapshots.
`releaseHash` covers `release.json` except its own field, so independent
verification still detects manual changes to non-identity metadata.

## Snapshot layout and payload policy

```text
knowledge/releases/<rel-sha256>/
├── release.json
├── manifest.json
├── graph.json
├── taxonomy.json
└── units/
    └── <sha256-of-unit-id>.json
```

One file per unit is the smallest layout that avoids loading all full content
and remains suitable for static hosting and 10,000 units. Hash-derived
filenames are portable and do not expose IDs as paths. A later release format
may add domain shards without changing unit identity or reader query semantics.

Each envelope pins release ID, unit ID, schema version, semantic content
version, and content hash. Its `unit` is the exact authored Knowledge Unit
minus `editorial`, matching the existing content-hash transformation.
Localized instruction, positions, learning objects, authored relationships,
and integration declarations remain. Drafts and runtime state never enter.

The current editorial envelope mixes public provenance with private owner,
reviewer, and workflow administration. It is therefore excluded as a whole.
Verification state and update date remain in the lightweight manifest.
Originality, inspiration, copyright, and attribution records remain available
to repository auditors but are not public runtime data. A future
backward-compatible public-provenance field should be introduced only after
that boundary is separately approved.

## Generation and immutability

Snapshot generation validates taxonomy and all source units, requires current
working artifacts, builds every output byte in memory, writes a temporary
directory, and atomically renames it into place. Invalid source leaves no
partial release. Repeating identical generation is idempotent. If the target
ID exists with any differing or unexpected byte, generation fails with
`immutable-release-conflict`.

Generated snapshots are committed for auditing, rollback, deterministic
deployment, and simple consumers. Rollback means explicitly loading a prior
immutable ID; no files are rewritten.

## Independent integrity verification

Verification reads JSON only and does not load authored content. It rejects:

- unsafe or mismatched release IDs and unsupported contracts;
- missing, unexpected, noncanonical, malformed, or symlinked files;
- duplicate or unsorted unit records;
- count, envelope identity, schema, version, and hash mismatches;
- editorial workflow data in payloads;
- invalid locale declarations;
- manifest, graph, taxonomy, fingerprint, or immutable-ID mismatches;
- unknown graph nodes or targets;
- unit values absent from the release taxonomy.

Diagnostics are deterministic and field-specific. Files must be canonical
two-space JSON with one final newline. Verification uses SHA-256 integrity, not
authenticity. Cryptographic signing is deferred.

## Consumer API

`loadLibraryRelease({ releasesDirectory, releaseId })` requires an explicit
safe immutable ID, verifies the entire snapshot, and returns a framework-free
reader. Invalid releases throw `LibraryReleaseError`; missing units return
`null`.

Release access:

- `getReleaseMetadata`, `getReleaseFingerprint`;
- `getSupportedDomains`, `getLocaleCoverage`, `getCounts`.

Unit access:

- `listUnitSummaries`, `hasUnit`;
- `getUnitById`, `getUnitByScopedSlug`;
- `listUnitsByDomain`, `filterUnits`.

Filters support domain, locale, difficulty, learner level, knowledge type,
endgame family, theme, and skill. Results are ID ordered.

Graph access:

- `getOutgoing`, `getIncoming`;
- `getDirectPrerequisites`, `getDirectDependents`;
- `getRelatedSummaries`.

Only authored direct edges are exposed; no inverse, transitive, or
recommendation relationship is inferred.

Taxonomy and compatibility access:

- `listTaxonomyValues`, `getTaxonomyEntry`;
- active alias resolution;
- `supportsReleaseSchema`, `supportsKnowledgeSchema`.

Every object/array result is a deeply frozen clone, so callers cannot mutate
reader state. Public results contain no filesystem paths.

## Channels and selection

Channels are deferred. One foundation release does not justify mutable
development/beta/stable pointers. Callers must pass an immutable ID; there is
no implicit “latest.” A future channel file may contain only a validated
channel name and release ID, require explicit opt-in resolution, and return the
resolved immutable ID.

## Security and trust

Release IDs accept only `rel-` plus 64 lowercase hexadecimal characters.
Resolved paths must remain within the configured release root. Directories and
files are enumerated; symlinks and unexpected file types are rejected. Only
JSON data is parsed—no generated JavaScript, functions, or dynamic imports are
executed. Hashes are verified before a reader is returned.

This protects integrity against corruption and unsafe local path selection. It
does not prove publisher authenticity; signing and key management are future
work.

## Commands and reproducibility

```text
npm run knowledge:release:snapshot
npm run knowledge:release:verify [-- <release-id>]
npm run knowledge:release:reproduce
npm run knowledge:validate
```

Snapshot generation creates or idempotently confirms the deterministic release.
Verification reads only that snapshot. Reproduction independently rebuilds
expected bytes from authored sources and compares without rewriting.

A future module consumes a pinned release by loading its explicit ID, checking
compatibility methods, querying summaries/facets/graph, and loading complete
units only through the reader.

## Deferred scope

No UI, database, network transport, deployment automation, channel pointer,
search engine, recommendation scoring, transitive graph, signing, public
provenance schema, bulk content, or sharding is implemented. Board API,
Coaching, Hints, Training Memory, Mastery, Recommendations, and the Guided
Workspace remain unchanged.
