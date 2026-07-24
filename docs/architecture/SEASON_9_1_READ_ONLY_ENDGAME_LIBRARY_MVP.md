# Season 9.1 — Read-Only Endgame Library MVP

## Decision

Season 9.1 adds `/endgame-library` as a standalone study surface. It reads one
immutable Season 9.0 release and never imports authoring units, discovers a
mutable “latest” release, writes knowledge, or changes learner state.

The pinned contract is:

- release `rel-a26763c6382b7878595ed8ae0da603c4679bf906e4357fdb406952db5867e2e1`;
- repository fingerprint
  `2635057f80fe1f244fd1c60e7d52af97c76de4102e5ff07e66d9daaa69c77886`;
- release and snapshot schema `1.0.0`;
- taxonomy `1.4.0`;
- 17 published endgame units.

## Boundary and adapter

The canonical Node consumer remains `knowledge/consumer/library-reader.js`.
Because it verifies snapshots from the filesystem, browsers use the narrow
adapter at `js/endgame-library/browser-library-reader.js`. The adapter fetches
only `release.json`, `manifest.json`, `graph.json`, `taxonomy.json`, and the
content-addressed unit shards named by that release. It validates the pinned
identity, schemas, fingerprint, taxonomy, published count, file names, and
shard identity. Unit shards are fetched lazily, cached, and returned as isolated
copies.

Cryptographic hashing and full snapshot verification remain build/test
responsibilities. Browser contract tests compare filtering and graph traversal
with the verified Node reader. Deployment must publish the committed release
directory byte-for-byte.

The UI has no imports from `knowledge/domains` or `knowledge/authoring`, no draft
access, no save endpoint, and no local or remote writes. It does not call the
trainer, coaching, mastery, recommendation, academy, or training-memory
systems. Recommendation-shaped relationships are displayed only as immutable
study links.

## Information architecture

The route opens with search, taxonomy-backed filters, a result count, and cards.
Cards are grouped into four presentation clusters:

- `pawn-foundations` → King and Pawn Foundations;
- `pawn-transformations` → Pawn Structure Transformation;
- `pawn-weaknesses` → Majorities and Weaknesses;
- `pawn-exchanges` → Exchanges and Simplification.

These labels and prefix mappings are UI-owned navigation aids. They do not
modify canonical IDs, taxonomy, relationships, or ordering in the release.
Within a cluster, immutable manifest order is preserved.

Details render localized explanation content, educational goals and criteria,
learning objects, positions, and relationship reasons. Graph relationships use
learner-facing groups: prerequisites, continue, remediation, contrast, and
related study. Links resolve through canonical scoped slugs.

## Board and accessibility

Only one selected position is mounted at a time. The page reuses Board API v1
through `EndgameBoardView` and `ChessRulesFacade`, immediately disables
interaction, and changes positions with `setPosition`. Each preview includes a
text description, side to move, concepts, principal line, purpose, and FEN.

The page includes a skip link, semantic headings and regions, labeled native
controls, keyboard-operable cards and graph links, visible focus, live result
counts, and explicit loading, release-failure, no-results, and missing-unit
states. Responsive grids collapse at tablet and phone widths; the board remains
square and the page prevents horizontal overflow.

## Verification

`npm run test:endgame-library` covers adapter parity, pinned-release rejection,
lazy shard loading, immutable-copy behavior, architectural boundaries, routes,
required instructional content, Board API use, accessibility states, and
responsive constraints. `npm run lint:endgame-library` syntax-checks the new
modules and tests. Full knowledge validation and the pre-existing endgame
trainer suite remain required regressions.
