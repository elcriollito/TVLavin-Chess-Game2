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

See
`docs/architecture/SEASON_9_0_2_CONTROLLED_TAXONOMY_AND_RELEASE_INTELLIGENCE.md`
for governance, hashing, and release semantics.
