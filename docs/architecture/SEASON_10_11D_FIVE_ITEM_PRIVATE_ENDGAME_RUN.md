# Season 10.11D — Five-Item Private Endgame Run

## Baseline and purpose

Season 10.11D starts from published commit `07992d6fb7cbe81834665c58c78a08560fcf6b34`.
It adds a private, deterministic, five-exercise technical session without replacing
`endgame-run-technical-two-item@1.0.0`.

The new identity is `five-item-private-endgame-run@1.0.0`. Its fixed order is:

1. `kp-coordinate-support-promote@1.0.0`
2. `rule-square-a-pawn-catch-stop-promotion@1.0.0`
3. `convert-material-advantage@1.0.0`
4. `hold-draw@1.0.0`
5. `activate-king@1.0.0`

The manifest contains only identity, integrity, approval-digest where applicable,
and pedagogical-order bindings. It does not duplicate moves, evidence, packets,
review records, or source graphs.

## Runtime and integrity

The technical flag is:

`?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item`

The flag parser accepts the exact three parameters once each. Empty, repeated,
unknown, injected, or mixed private modes fail closed as `technical-unavailable`.
The manifest and all five source artifacts are validated before the first item is
started. A missing, reordered, duplicated, extra, unknown, or digest-mismatched
item blocks the entire run.

The run controller is objective-agnostic. It reads `orderedItems[index]`, resolves
the allowlisted binding, instantiates the existing multi-move controller, and owns
only sequence, Continue, retry, restart, exit, summary, and run-wide hint
eligibility. Chess rules and move classifications remain in source artifacts.

The canonical manifest uses `caissa-stable-json-v1`, FNV-1a compatibility
fingerprinting, and SHA-256. Its generated private JSON is reproducible and is
excluded from deployment by the existing `endgame-pools/private/**` rule.

## Ephemeral state and independence

State exists only in the controller instance. It is never written to localStorage,
sessionStorage, IndexedDB, cookies, accounts, analytics, or telemetry. Refresh,
exit, or disposal removes current position, completed items, hints, and summary.

Run-wide independent eligibility begins `true`. Stage 1 and Stage 2 preserve it.
Any Stage 3 reveal changes it permanently to `false` for that run, including after
item retry. A full in-memory restart creates a new run state and restores `true`.
The final summary reports only five completion rows and `Independent completion:
yes|no`; it contains no score, time, rating, streak, stars, or historical attempt.

## Privacy, Clarity, and exposure

The page installs `noindex,nofollow` dynamically and removes the public canonical
link for the technical session. It is absent from navigation, sitemap, robots,
IndexNow, homepage, About, Academy, and Endgame Library.

Clarity suppression checks the presence of `privateEndgameRun` before consent,
storage, cookie, script, event, or network initialization. Public Clarity behavior
and project `xskndnmhky` remain unchanged.

Because the current application executes in the browser, the served JavaScript
contains the minimum allowlisted artifact IDs and integrity values required to
resolve the session. It does not expose human approvals, reviewer identity,
packets, evidence, tablebase responses, graphs, or private source files. Physical
private paths remain excluded from Vercel and must return 404.

## Terminal flow and technical failure

Only `objective-success` enables manual Continue. Accepted alternatives,
authored-concept misses, and objective misses retain the current item and use its
truthful feedback. Chess-result failure permits current-item retry. Technical
unavailability is neutral, preserves already completed indexes in memory, and
permits retry, restart, or exit.

## Verification and risks

Verification covers canonical regeneration, bindings, complete five-item play,
manual advancement, semantic deviations, hints, restart, refresh reset, mode
isolation, zero persistence/analytics, accessibility, responsive geometry,
protected paths, historical fingerprints, public-release audit, and production.

The principal constraint is that minimum technical IDs are observable in served
JavaScript. This is an acknowledged consequence of the current client-only
runtime, not publication of private evidence.

## Deferred work and Season 10.12 handoff

Public Endgame Practice, public Modes, previews, navigation, scoring, timers,
ratings, random/adaptive order, session history, resume, accounts, learning
systems, telemetry, analytics experiments, monetization, and replacement of the
historical two-item run remain explicitly deferred. Season 10.12 may evaluate a
public product surface only through a separate approval and release decision.
