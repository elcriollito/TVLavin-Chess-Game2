# Season 10.15 — Endgame Trainer V2 Public Canonical Migration

## Baseline and scope

The verified baseline was `50fdb099352bb17aba4e7b2138fc1987a9b867e9` on `main`, equal to
`origin/main`, with a clean worktree and ahead/behind `0/0`.

This release changes only public Trainer routing, presentation, discovery metadata, compatibility
handling, and their tests. Endgame Practice, its five-item private run, reviewed exercise content,
approval bindings, pools, Knowledge releases, kill switch, and protected evidence remain unchanged.

## Pre-migration audit

Before this release, `/endgame-trainer` mounted the legacy Stockfish workspace. V2 was embedded in
the same document but mounted only with `trainerV2=1`. Guided Study owned its established query
contract. Multi-move, historical-run, objective-artifact, and private-run entry points each used
strict technical selectors and delegated to separate bounded runtimes. The HTML document owned SEO,
navigation, and the shared board host; the entry module owned runtime selection.

Legacy and V2 therefore shared a document and navigation shell, while runtime ownership remained
separate. The prior fallback was the default legacy mount. No automatic error fallback contract
existed.

## Route decision

`/endgame-trainer` now mounts public V2 without a query. `trainerV2=1` is a redundant compatibility
alias and does not redirect. `legacy=1` is the only explicit general legacy selector. It retains the
canonical link to `/endgame-trainer`, receives `noindex, nofollow` at runtime, and is absent from
navigation and the sitemap.

One centralized resolver rejects duplicate keys, empty or invalid selector values, arbitrary IDs,
unknown keys, and mixed modes. The effective precedence is:

1. reject invalid, duplicate, or conflicting selectors;
2. retain valid Guided Study ownership;
3. resolve an allowlisted objective artifact;
4. resolve the historical two-item run;
5. resolve the private five-item run;
6. resolve an allowlisted multi-move pilot;
7. resolve isolated `legacy=1`;
8. use canonical public V2.

Technical modes accept their historical `trainerV2=1` form and their new equivalent without that
alias. The compatibility is applied at the new routing boundary, so immutable historical runtime
parsers and artifacts do not change.

The historical homepage states `/?section=endgameTrainer` and `/?section=endgame` are supported
aliases. Exact, otherwise-unparameterized forms use one `location.replace` to reach
`/endgame-trainer`; this avoids a Back/forward redirect loop. Other homepage section states are
unchanged.

## Failure and rollback

V2 failures never mount legacy silently. Invalid routing, board initialization failure, and content
bootstrap failure show a neutral technical state with Retry, Open Compatibility View, and Return to
Endgame Practice actions. Internal IDs and stack traces are not rendered.

Rollback uses a normal revert or known-good deployment at
`50fdb099352bb17aba4e7b2138fc1987a9b867e9`. It restores the legacy default while retaining V2,
Endgame Practice, and private artifacts. No data migration is needed because V2 introduces no
persistence. Force push and history rewriting are not part of rollback.

## Product, shell, accessibility, and responsive behavior

The public identity is “CAISSA Endgame Trainer,” described as a general training workspace. It is
distinct from Endgame Practice, the limited preview of five reviewed exercises. Custom Lab links to
the explicit compatibility view and does not loop back to V2.

The canonical navigation inventory remains the only inventory, with Endgame Trainer as the sole
active item on this route. The existing responsive drawer, board adapter, keyboard and pointer
controls, focus-return behavior, live feedback, reduced-motion rules, and mobile-first ordering are
retained. No-JS visits receive a readable page identity, a JavaScript requirement message,
functional navigation, and a return link rather than a blank workspace.

The verification matrix covers 320×568, 360×800, 390×844, 412×915, 768×1024, 820×1180,
1024×768, 1280×720, 1366×768, 1440×900, and 1920×1080, plus 200% zoom, reduced motion, keyboard,
tap/click, drag behavior where supported, and Axe critical/serious checks.

## SEO and discovery

The canonical is exactly `https://www.caissa-chess.org/endgame-trainer`. The title is
“CAISSA Endgame Trainer — Practice Chess Endgames”; the description is
“Practice essential chess endgames with guided positions, clear objectives, and immediate feedback
in CAISSA Endgame Trainer.” Structured data is an honest `WebPage`, not a Course.

The sitemap contains the canonical route exactly once and no query variants. A single IndexNow
submission for the canonical URL may occur only after production is READY and verified. IndexNow
failure is external and does not invalidate an otherwise verified release.

## Privacy and integrity

Public Clarity policy is unchanged. Existing early suppression for `objectiveArtifact` and
`privateEndgameRun` remains based on the real browser URL, before the routing compatibility proxy is
created. No exercise analytics, telemetry, cookies, account writes, session storage, IndexedDB, or
new local progress storage are introduced.

Required integrity gates reproduce the five-item run, historical run, promote, stop-promotion,
convert-material-advantage, hold-draw, and activate-king fingerprints and SHA-256 digests. Approval
records, public pools, manifest signing status, Knowledge release, protected paths, and deterministic
generation remain release gates.

## Verification and release record

Focused unit coverage exercises default V2, the redundant alias, isolated legacy, noindex behavior,
canonical metadata, allowlisted technical modes, duplicate and conflict rejection, Guided Study,
historical aliases, sitemap uniqueness, explicit technical failure, and no silent fallback.
Browser coverage exercises the canonical five-position challenge, approved alternatives, honest
assistance, keyboard and pointer input, legacy, no-JS, failure UI, responsive layouts, Axe, content
integrity failure, single-board ownership, and zero engine workers.

The final commit, deployment ID, production status, smoke results, IndexNow decision, and exact
integrity outputs are recorded in the Season 10.15 release report after all gates pass.

Legacy retirement is deliberately deferred. A future phase must separately approve removal after
usage, support, accessibility, and rollback evidence are reviewed.
