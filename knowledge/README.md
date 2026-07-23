# CAISSA production knowledge repository

This directory contains version-controlled educational knowledge, not UI code,
learner state, or live chess decisions. Start with
`docs/architecture/SEASON_9_0_1_PRODUCTION_KNOWLEDGE_REPOSITORY.md`.

Authoring files are registered explicitly in `indexes/manifest.js`. Generated
indexes and release shards may be added later; generated artifacts must never
be edited as authoring sources.

Controlled vocabulary is authored in `taxonomy/registries.js`. Release
artifacts under `generated/` are derived, committed, and must be refreshed with
`npm run knowledge:release:generate`. Use `npm run knowledge:validate` to check
taxonomy, source units, and generated-artifact freshness without rewriting
files.

Immutable runtime products live under `releases/<release-id>/`. After authored
content and working artifacts pass validation:

```text
npm run knowledge:release:snapshot
npm run knowledge:release:verify
npm run knowledge:release:reproduce
npm run knowledge:validate
```

Consumers explicitly load a release ID through
`consumer/library-reader.js`; they do not import authored units or resolve a
mutable “latest” release.

Authors start with `knowledge/AUTHORING.md`, inspect active values through the
draft scaffold, and run `npm run knowledge:editorial:report` before publication.
The scaffold creates no prose, chess positions, relationships, or review
claims.

The current authored library contains nine published units in two bounded
clusters: foundational king-and-pawn conversion and pawn-structure
transformation. The second cluster is documented in
`docs/architecture/SEASON_9_0_5_PAWN_STRUCTURE_TRANSFORMATION_CLUSTER.md`.

See the Season 9.0.2 architecture document for taxonomy and hashing governance,
and `docs/architecture/SEASON_9_0_3_IMMUTABLE_LIBRARY_RELEASES_AND_CONSUMER_API.md`
for snapshot and consumer contracts.
