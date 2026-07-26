# Season 10.14.1 — Limited Preview Post-Release Validation

## Validation record

- Validation started: `2026-07-26T23:00:39.8272085Z`
- Validation completed: `2026-07-26T23:09:08.1125767Z`
- Baseline and production commit: `e4df2a701c1a3a32dfb4a2db503d1a1bcbd1632f`
- Production deployment: `dpl_3ACo8HcUbywYNNVCGApMfrq11UQA`
- Production alias: `https://www.caissa-chess.org`
- Release mode: `limited-preview`
- Runtime mode: `enabled`

This was a point-in-time post-release validation. It does not claim continuous
monitoring, traffic, user completion, engagement, conversion, or retention.

## Scope and production checks

The homepage, Endgame Practice, Endgame Trainer, Endgame Library, sitemap,
robots file, and operational availability endpoint returned HTTP 200 without an
unexpected redirect. Endgame Practice retained its approved title,
description, canonical, `index, follow` directive, `WebPage` JSON-LD, public
navigation entry, five-exercise copy, and enabled Start Limited Preview action.

The availability response identified `five-item-private-endgame-run`, reported
the `limited-preview` boundary, `enabled` runtime mode, `operational` reason,
valid configuration, and fail-closed behavior. Its response retained
`Cache-Control: no-store, max-age=0` and `Referrer-Policy: no-referrer`.

The sitemap contained the canonical Endgame Practice URL exactly once. Its URL
entries contained no query strings, technical selectors, operational API URLs,
or private sources.

## Runtime, privacy, and pedagogy

Production browser validation covered Chromium, Firefox, and WebKit. The public
CTA performed a full-page transition and focused Start Run. The five reviewed
exercises completed in their approved order with manual continuation and an
ephemeral 5/5 summary. Independent completion, assisted completion, Stage 3
confirmation, accepted alternatives, authored-concept misses,
objective-preserving misses, chess-result failure, neutral technical failure,
retry, restart, summary, exit, refresh reset, and fail-closed selector handling
passed.

The first summary-exit probe queried the DOM before summary rendering had
settled. Repeating it with the summary visibility condition produced five
summary items and one visible summary Exit Run action. This is classified as
`not-a-defect`; no product change was made.

The exercise runtime produced no Clarity requests and exposed no
`window.clarity`. Browser privacy instrumentation observed no exercise-specific
localStorage, sessionStorage, IndexedDB, cookie, analytics, telemetry, account,
move, FEN, or full-URL upload behavior. No progress was retained after refresh
or restored through Back after exit.

## Navigation, accessibility, and responsive behavior

Endgame Practice remained a single canonical Learning-group destination in the
shared inventory, main shell, standalone shell, and mobile navigation. It was
not duplicated, moved under Tools, or relabeled Limited Preview.

The shell, CTA, runtime, hints, feedback, dialogs, summary, exit, focus flow,
keyboard behavior, reduced motion, and responsive layout passed browser
validation at the approved mobile, tablet, and desktop viewport set. Axe found
zero critical and zero serious violations. No horizontal overflow blocker was
observed.

## Integrity and regression

The five-item run, historical run, five source artifacts, three approval
records, human release approval, pools, Knowledge release, packets, graphs,
evidence, navigation, Clarity contracts, IndexNow workflow, and the Season
10.12, 10.13, and 10.13A boundaries passed their versioned integrity tests.
Canonical regression completed with 1,063 passes and zero failures. External
WORKER_URL, local FICS, and live-tablebase integrations remained explicit,
separate opt-in skips.

Curated pool check, Knowledge validation and reproducibility, public-release
audit, relevant syntax checks and lints, repository build, and Vercel build
passed. The committed tree remained unchanged by deterministic validation.

Representative private pool, approval, review, evidence, operations,
generator, test, architecture, and Knowledge authoring paths all returned HTTP
404 in production.

## IndexNow retry

After all release gates passed, the existing workflow made exactly one retry
for:

`https://www.caissa-chess.org/endgame-practice`

The request failed before an HTTP response was available with `fetch failed`.
There was no response status or safe response body to summarize, and acceptance
could not be confirmed. No additional URL was submitted and no automatic retry
was made.

- Attempt count in Season 10.14.1: `1`
- Request status: `attempted`
- HTTP status: `not available`
- Acceptance: `not confirmed`
- Classification: `external`

## Rollback readiness and recommendation

The known-good baseline remains
`8826fdf1b3b7d4e45d73f4e5b68c0854377d6129`; the validated release baseline is
`e4df2a701c1a3a32dfb4a2db503d1a1bcbd1632f`. Controlled state-matrix tests
confirmed that runtime disabled and paused states preserve the public shell
while preventing runtime loading. Emergency disable remains neutral and
fail-closed.

Containment can use the kill switch first. A normal revert or known-good
deployment remains sufficient; there is no release database, migration,
persisted preview progress, or learner data to reconcile, and no force push is
required.

No critical, high, medium, or low product finding was demonstrated. The only
open finding is the external IndexNow failure. Keep the preview in
`limited-preview` with runtime `enabled`; do not hotfix or alter artifacts,
approvals, copy, metadata, navigation, or runtime behavior.
