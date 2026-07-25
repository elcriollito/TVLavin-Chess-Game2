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

The Season 9.1 read-only browser at `/endgame-library` is pinned to the current
17-unit immutable release. Its narrow fetch adapter reads release artifacts
only; it cannot read authoring sources or write knowledge or learner state. See
`docs/architecture/SEASON_9_1_READ_ONLY_ENDGAME_LIBRARY_MVP.md` for its boundary,
presentation-only cluster mapping, Board API integration, and verification
contract.

Authors start with `knowledge/AUTHORING.md`, inspect active values through the
draft scaffold, and run `npm run knowledge:editorial:report` before publication.
The scaffold creates no prose, chess positions, relationships, or review
claims.

The current authored library contains seventeen published units in four bounded
clusters: foundational king-and-pawn conversion, pawn-structure transformation,
majorities with structural weaknesses, and pawn exchanges with favorable
simplification. The newest cluster is
documented in
`docs/architecture/SEASON_9_0_7_PAWN_EXCHANGES_AND_FAVORABLE_SIMPLIFICATION.md`.

See the Season 9.0.2 architecture document for taxonomy and hashing governance,
and `docs/architecture/SEASON_9_0_3_IMMUTABLE_LIBRARY_RELEASES_AND_CONSUMER_API.md`
for snapshot and consumer contracts.

Knowledge schema `1.1.0` adds validated item-level `activityItems` while
preserving consumer support for historical schema `1.0.0`. The current
immutable release provides one independent-practice item and one assessment
item for each of the 17 published endgame units. Browser runtime code evaluates
only these released answer contracts and never invents answer keys.
