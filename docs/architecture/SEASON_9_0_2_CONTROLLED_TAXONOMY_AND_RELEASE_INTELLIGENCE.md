# Season 9.0.2 — Controlled Taxonomy and Release Intelligence

Status: implemented foundation
Taxonomy version: `1.0.0`
Release schema version: `1.0.0`
Generator contract version: `1.0.0`

## Purpose and ownership

Knowledge Units remain the source of educational meaning. Taxonomies classify
that meaning with stable vocabulary; they do not contain lessons or substitute
for Knowledge Units. Release files are derived intelligence for browsing,
integrity checking, traversal, deployment, and future search ingestion.

Taxonomy source is owned by the curriculum architecture and editorial review
process. Unit authors consume registered IDs and may not create production
vocabulary by typing a new string into a unit.

## Structure

```text
knowledge/
├── domains/                 # authored Knowledge Units
├── indexes/manifest.js      # authored explicit unit registration
├── taxonomy/
│   ├── registries.js        # authored controlled vocabulary
│   └── validate-taxonomy.js
├── release/                 # canonicalization, hashing and generation code
└── generated/               # committed derived artifacts
    ├── release-manifest.json
    └── graph-indexes.json
```

Registries are immutable arrays of plain records. Derived `Map` lookups provide
constant-time validation without becoming serialized truth. This gives
JavaScript authors type-like discoverability, readable semantic IDs, stable
serialization, and no generated constants or database-style identifiers.

Each entry requires `id`, short label, concise definition, and status. Optional
metadata includes parent, aliases, domain scope, and a deprecation replacement.
Labels support review and tooling but are not presentation copy.

## Registry boundaries

The first taxonomy version controls domains, knowledge types, endgame
families, themes, skills, difficulty levels, learner levels, instructional
position roles, learning-object types, relationship types, verification
states, editorial statuses, translation statuses, and integration capability
identifiers.

Lifecycle status remains part of the versioned Knowledge Unit schema because
it controls document publication rather than classifying educational
knowledge. Side to move and position-validation states remain structural
contract values for the same reason.

## Governance

Registry validation requires:

- unique IDs within each registry;
- valid parent references and no parent cycles;
- unique aliases within a registry;
- domain scopes that target a registered domain;
- replacements only on deprecated entries;
- valid, non-self replacement targets and no replacement cycles;
- deterministic validation and source ordering.

Statuses are `active`, `proposed`, and `deprecated`. Production units may use
only active values. A proposed value is accepted only when the unit is a draft
and validation explicitly sets `allowProposedTaxonomy`; proposed values never
enter a production release. Deprecated use is rejected with replacement
guidance. Registry changes require definition/scope review, collision checks,
consumer-impact review, a taxonomy version change when semantics require it,
and regenerated artifacts.

Knowledge validation reports the unit ID, exact field path, invalid value,
registry name, and whether the failure is unknown, proposed, deprecated, or
incorrectly scoped.

Season 9.0.2 corrects one 9.0.1 classification issue: learner level is now the
stable ID `foundation-rules-aware`, rather than audience prose. The original
instruction and educational scope are unchanged. Integration capabilities are
now declared as controlled IDs; existing integration detail objects remain
non-executing compatibility metadata.

## Release manifest

Only `published` units enter the release. The manifest contains:

- release schema, generator, and taxonomy versions;
- repository fingerprint;
- total count and counts by domain, status, and locale availability;
- ID, domain-scoped slug, default title and summary;
- educational facets and direct prerequisites;
- relationship counts;
- schema and content versions;
- locale declarations, verification state, updated date, and content hash.

Complete explanations, prompts, positions, learning objects, evidence, and
editorial records are excluded from the lightweight manifest.

## Canonical serialization and content hashes

Canonical JSON recursively sorts object keys. Array order remains meaningful;
release builders explicitly sort set-like facets, IDs, edges, and summaries.
Output uses UTF-8 JSON, two-space indentation, and exactly one final newline.
No clock, machine path, filesystem order, or runtime state participates.

Each content hash is lowercase SHA-256 over canonical serialization of the
complete authored Knowledge Unit except `editorial`. It therefore includes
identity, status, schema/content versions, educational fields, every localized
payload, positions, learning objects, relationships, and integrations.
Editorial owner, review state, provenance records, copyright notes, and dates
do not participate. Consequently `updatedAt` appears for browsing but cannot
change the content hash. A hash detects byte-independent structural content
change; it never replaces author-controlled semantic `contentVersion`.

## Repository fingerprint

The fingerprint is SHA-256 over canonical JSON containing release schema
version, generator version, taxonomy version, and the ID-sorted list of
`{ id, contentHash }` pairs. Identical eligible content and contracts therefore
produce an identical fingerprint regardless of source registration order or
machine. Taxonomy changes are visible through `taxonomyVersion`.

## Graph indexes

Graph artifacts are generated solely from published units. The forward index
groups authored outgoing targets by relationship type. The reverse index
groups incoming source IDs by type. The prerequisite index records direct
prerequisites and direct dependents. `education.prerequisites` is normalized as
the authored `prerequisite` edge type; explicit relationships retain their
authored type. IDs, types, and targets are sorted, and no transitive,
bidirectional, or recommendation edge is inferred.

Draft units and their relationships are absent. A production unit targeting a
draft is invalid rather than silently truncated.

## Generated-artifact policy

`knowledge/generated/` is committed because the files are small, reviewable,
deployment-ready, and allow consumers to avoid executing authoring modules.
They must never be manually edited. Generation writes both artifacts; check
mode computes expected bytes in memory and exits non-zero on a missing or stale
file without rewriting it.

Commands:

```text
npm run knowledge:taxonomy:validate
npm run knowledge:release:generate
npm run knowledge:release:check
npm run knowledge:validate
npm run test:knowledge
npm run lint:knowledge
```

Downstream consumers should pin the release schema and repository fingerprint,
use summaries for browsing/filtering, use reverse indexes for traversal, and
load canonical Knowledge Units by stable ID when full instruction is needed.
They must not treat generated summaries or indexes as editable truth.

## Intentionally unimplemented

This increment adds no UI, database, filesystem discovery, full-text search,
content shards, transitive graph closure, recommendation scoring, migration
engine, release signing, authoring interface, AI pipeline, or additional
production Knowledge Units. It makes no changes to Board API, Coaching,
Training Memory, Mastery, Recommendations, or the Guided Workspace.
