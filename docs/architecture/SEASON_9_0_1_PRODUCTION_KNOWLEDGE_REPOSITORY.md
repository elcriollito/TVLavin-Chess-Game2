# Season 9.0.1 — Production Knowledge Repository Contract

Status: implemented foundation
Schema version: `1.0.0`

## Decision and integration boundary

CAISSA stores canonical educational meaning under the top-level `knowledge/`
directory, separate from UI (`js/`, HTML and CSS) and runtime state. The
repository is a deterministic, version-controlled source of immutable
Knowledge Units. It reads FEN validity through the frozen
`ChessRulesFacade`; it does not write to or redefine Board API v1, Coaching,
Training Memory, mastery, recommendations, curriculum, or workspace behavior.

The current Endgame Trainer remains a compact lesson-driven beta. Future
adapters may reference Knowledge Unit IDs without changing existing lesson or
theme IDs.

## Repository structure

```text
knowledge/
├── domains/
│   └── endgames/<family>/<unit>/unit.js
├── indexes/
│   └── manifest.js
├── loaders/
│   └── knowledge-loader.js
├── schema/
│   └── knowledge-unit.js
├── validation/
│   ├── validate-knowledge.js
│   └── validate-repository.js
└── README.md
```

Domains and families partition authoring sources for review and future scale.
One file owns one unit. The structure permits future domains without changing
consumers and permits locale payloads to be split into adjacent files when
their size justifies it.

## Contract

Required identity fields are stable global `id`, domain-scoped `slug`,
`domain`, lifecycle `status`, `schemaVersion`, and `contentVersion`. IDs are
locale-neutral, never derived from array order, and never recycled.

Required educational fields are knowledge type, themes, skills, difficulty,
learner level, learning objectives, mastery criteria, localization metadata,
at least one instructional position, and original localized instruction.
Positions declare side to move, role, expected concepts, and separate
structural and educational validation states.

Optional enrichment includes endgame family, principal move ideas, graph
relationships, learning objects, and detailed integration declarations.
Integration fields are declarative compatibility hints; runtime systems remain
authoritative. Editorial-only metadata includes ownership, review, provenance,
copyright, originality, verification, dates, and deprecation.

Runtime-derived values—legal moves, engine evaluation, learner mastery,
recommendation ranking, resolved coaching output, and session state—are
deliberately excluded. The loader returns frozen clones so consumers cannot
mutate authoring records.

## Schema and content versioning

Schema versions use SemVer and identify document shape. The loader accepts only
the explicit allow-list in `schema/knowledge-unit.js`; unsupported versions
fail before any content is returned. `1.0.0` is the sole supported version.

Content versions also use SemVer but identify revision of educational meaning:
patch for wording corrections that preserve scope, minor for additive
relationships or enrichment, and major for changed scope or objectives.
Published versions are treated as immutable; revisions replace the repository
record with a reviewed higher version, while release snapshots will retain
history in a later season.

No migration engine is justified yet. A future schema change adds a validator
and pure migration from a specifically supported older version, followed by
manifest regeneration. Deprecated fields are first documented, then accepted
with warnings during a bounded compatibility window, and finally rejected in
a schema major version. This foundation silently accepts no unknown schema
version.

## Validation boundaries

Repository validation deterministically checks required fields; supported
schema and SemVer; lifecycle and editorial consistency; locale syntax,
declarations, readiness, and payload presence; unique IDs and domain-scoped
slugs; relationship type, target, self-edge, and duplication rules;
repository-visible prerequisite cycles; instructional position shape, FEN,
and side to move; originality/provenance; and deprecation consistency.

FEN validation reuses `ChessRulesFacade`, proving parseability and chess.js
legality. Educational claims, historical reachability, theoretical outcome,
engine truth, instructional suitability, and copyright judgment require
separate review evidence. Position metadata makes that boundary explicit.

## Loader and manifest

`manifest.js` explicitly imports every authoring unit. This avoids
filesystem-order, bundler-glob, network, and clock-dependent discovery.
Registration is the editorial publication step. The lightweight manifest
duplicates only browse/index fields, never full instruction, positions, or
evidence.

The loader validates the entire registry before returning anything. It loads
all units, by ID, or by domain-scoped slug; filters by domain, status, or
available locale; sorts by stable ID; and returns immutable clones. Drafts are
excluded by default and require `includeDrafts: true` for development or
editorial use. Duplicate or malformed repositories throw a structured
`KnowledgeRepositoryError`.

At larger scale, a deterministic build can generate the same manifest shape,
reverse graph indexes, search documents, and content-addressed shards without
changing loader consumers.

## Localization and editorial lifecycle

Identity, chess facts, classification, and graph edges are stored once.
Localized instruction is keyed by BCP 47-like locale and declares independent
`draft`, `review`, or `ready` state. The default locale must be declared and
complete. Published content requires its default locale to be ready.

Lifecycle is `draft → verification → review → approved → published →
deprecated`. Approved and published units require approved review and verified
editorial state. Deprecation retains identity and requires a reason and
effective date; an optional replacement uses another stable unit ID.

## Adding a unit safely

1. Copy the contract shape, assign a globally unique namespaced ID and a
   domain-scoped slug, and start with `draft`.
2. Write original instruction and declare provenance, copyright, localization,
   position validation, objectives, and mastery criteria.
3. Add only relationships whose targets are already registered.
4. Register the unit explicitly in `indexes/manifest.js`.
5. Run `npm run validate:knowledge` and `npm run test:knowledge`.
6. Complete review and verification metadata before changing publication
   status.

## Intentionally not implemented

This season adds no UI, database, authoring interface, mass migration, source
ingestion, generated lessons, runtime AI, schema migration engine, release
sharding, search engine, or changes to stable Endgame Trainer systems. The one
exemplar has no graph edge because no second production Knowledge Unit exists;
   inventing a dangling target would violate the repository contract.
