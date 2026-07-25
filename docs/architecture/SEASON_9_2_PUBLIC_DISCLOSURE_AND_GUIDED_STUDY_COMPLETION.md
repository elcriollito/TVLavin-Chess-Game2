# Season 9.2 Public Disclosure and Guided Study Completion

## Scope and existing implementation

Season 9.2 was completed from the authorized `aa8c91a177a12304a9ea6373a26d04ce79bdd962` baseline. Earlier Season 9.2 commits had already modernized About copy, bounded privacy language, reduced the public roadmap, introduced an audited public-release builder, and added the Endgame Library to Guided Workspace handoff. Hotfix 9.2.1 subsequently added the first-class Help page and Play-specific Game Options. This completion pass preserved those systems and changed only verified gaps.

## Disclosure classification and decisions

Required public information includes user-relevant online-service behavior, account and payment behavior, and third-party license attribution. Harmless details include visible chess libraries and browser-based analysis. Protected details include internal architecture documents, authored Knowledge sources, release-generation machinery, machine paths, credentials, deployment instructions, and promotional links to protected core source.

The public About page describes CAISSA's mission, player benefits, analysis, study, organization, and exploration. It does not serve as an architecture inventory. CAISSA's complete core is not marketed as open source or wholly auditable on GitHub; repository licenses and required third-party attribution are unchanged.

Privacy language is deliberately bounded: some data can remain in browser storage, while imports, downloads, accounts, payments, synchronization where offered, and optional AI features can involve online services. It avoids absolute no-network or no-tracking promises. A formal privacy policy and legal review remain advisable before broader account/payment rollout.

The public roadmap communicates active development and broad learning goals without engineering seasons, provider plans, protected system names, implementation order, or curriculum inventories. User-facing terms such as lesson, concept, guided study, progress, and mastery are allowed where they describe visible behavior. Private architecture terminology remains in private repository documentation.

## Public artifact boundary

The audited builder publishes runtime pages and the pinned immutable Knowledge release while excluding `docs/`, authored Knowledge modules, schemas, consumers, release tooling, validation tooling, repository architecture files, tests, maintenance scripts, experimental clients, deployment tooling, gateway sources, database schemas, archives, and local launch helpers. Diagnostic pages, engine/board harnesses, and ad-hoc test pages are also excluded. Required engine attribution remains public. The completion document itself is excluded by both `.vercelignore` and the public builder.

## Guided Study contract

All 17 units in the pinned release qualify objectively: each is published, uses the supported schema, has a structurally valid instructional position, contains demonstration or guided-practice material, supplies deterministic authored coaching prompts, and has a learning objective. Eligibility is derived only from released browser-consumable data; no missing lesson material is invented.

The Endgame Library action transfers a stable unit ID and the explicit immutable release ID:

`rel-a26763c6382b7878595ed8ae0da603c4679bf906e4357fdb406952db5867e2e1`

Repository fingerprint:

`2635057f80fe1f244fd1c60e7d52af97c76de4102e5ff07e66d9daaa69c77886`

There is no `latest` alias, authored-module import, draft access, or browser filesystem access. Missing units, malformed identifiers, release mismatch, unavailable release data, ineligible units, and board/position initialization failure produce a safe state with a return to Endgame Library.

The existing Guided Workspace is reused. The handoff displays released title, objective, explanation, instructional positions, position purpose, side to move, and deterministic coaching prompts. Position switching reuses Board API v1 through `boardView`, and the board is explicitly read-only. The URL supports refresh and direct cold load; the return URL restores the originating Library unit.

## No-write and no-AI boundary

Guided Study preview does not record completion, save training progress, update Training Memory or Mastery, mutate Recommendations, or call personalized recommendation logic. It does not call an LLM or AI provider and does not generate explanations at runtime. Released objects are cloned for the view and are never modified.

Progress integration, mastery updates, personalized recommendations, and any generated coaching remain deferred. Future Season work must define those contracts independently and must not weaken the immutable-release boundary.
