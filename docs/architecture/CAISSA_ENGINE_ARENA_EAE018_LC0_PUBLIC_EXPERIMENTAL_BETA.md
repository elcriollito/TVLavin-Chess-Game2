# CAISSA Engine Arena EAE-018 — Lc0 Public Experimental Beta

## Release boundary

EAE-018 exposes the already certified `Lc0 — Maia 1100` provider as a public,
explicitly opt-in Experimental engine. It does not make Lc0 automatic or a
default, broaden runtime support, or change the certified search/runtime code.

The integration baseline is the actual `origin/main` observed at release start:
`925e2e014bcc2ca1ae40f0ec33468567865ddd15`. The safety ref
`backup/main-pre-lc0-experimental-public` points to that exact commit. The
certified source branch is `feature/lc0-eae017-match-lab-time-control` at
`1163c79382c9cc699fc27538612445a7ce36a51e`.

## Certified runtime provenance

- Runtime release: `eae017-lc0-0.33.0-maia1100-tc1r1`
- Runtime deployment manifest SHA-256:
  `9980a755a44b3d704f70505a803b6dd112c97a39853260bc648499b5bed4fd45`
- Runtime client: 212,443 bytes, SHA-256
  `61555ff04e76ea804940f728552188905e9e544f3109368ca2878ca26b0f8809`
- Maia 1100 SHA-256:
  `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`

All eight manifest artifacts were downloaded from the isolated EAE-017 runtime
origin and verified byte-for-byte against the certified manifest. The generated
`client.js` in the Git tree is a pre-deployment build output and is identical
between EAE-017 and EAE-018; the authoritative tc1r1 reference output is the
212,443-byte file in the published corresponding-source archive and the
deployed isolated runtime. Both match the manifest hash above.

## Corresponding source and licenses

The discoverable About / Licenses entry links to GitHub release
`lc0-browser-source-v0.1.3`. Its archive
`caissa-lc0-browser-corresponding-source-v0.1.3.zip` has SHA-256
`9b87bc53ce6bb75388f70158faf40c4b73434ff137e58fef06998ec7cc5e7def`.
The archive's `reference-runtime/client.js` is byte-identical to the certified
deployed client.

## Public opt-in and authentication

In `EXPERIMENTAL_OPT_IN`, desktop Chrome and Edge users can see the compact
Experimental Engines control and its first-use consent. Visibility is distinct
from session eligibility:

- anonymous users can inspect the control and consent text;
- anonymous confirmation shows `Sign in to use Lc0 Experimental.`;
- anonymous users cannot register the provider or create a relay session;
- any authenticated CAISSA user may explicitly opt in;
- the internal Beta Tester allowlist is not consulted for public Experimental
  eligibility.

`INTERNAL_ONLY`, `CANARY_OPT_IN`, `DRAINING`, and `DISABLED` remain
server-authoritative. The client never elevates a denied server response.

## Browser and capability boundary

Supported clients are desktop Chrome and desktop Edge. Firefox, Safari, iOS,
Android, and other mobile browsers remain blocked and load no Lc0 adapter or
runtime assets.

The Match Lab capability intersection remains provider-driven. Lc0 supports
Blitz, Rapid, Long, and Fixed Depth. Bullet is rejected in the UI and start
validation with the exact reason:

`Lc0 Experimental does not currently support Bullet Match time control.`

Competition invariants remain: at most one Lc0 participant, no Lc0 versus Lc0,
and Stockfish remains the evaluator. A failed Lc0 request is reported as Lc0;
Stockfish is never substituted silently.

## Lazy loading

Normal Arena load includes only the small rollout coordinator. It does not
request the isolated adapter, Lc0 runtime, WebAssembly, ORT, Maia network,
relay session, or runtime window. The adapter is loaded only after explicit,
authenticated consent. Runtime assets and the dedicated runtime window are
created only when the opted-in user actually starts an Lc0 competition.

## Production sequence and smoke

The production application is deployed first with `releaseStage=DISABLED`.
After normal Arena, Stockfish, and zero-Lc0-load checks pass, the relay and main
control plane may move to `EXPERIMENTAL_OPT_IN` while mode remains `ENABLED`.
Certification covers Lc0 as White and Black in Blitz 3+2, Pause/Resume,
STOP/cleanup, representative Rapid and Long games, Fixed Depth 12, and Bullet
rejection. Post-smoke state must show zero active sessions, zero relay rows, no
critical alerts, and a healthy cleanup path.

Deployment IDs, PR/merge SHA, production smoke evidence, and final operational
counts are recorded in the release report after the production run.

## Kill switch and rollback

The emergency engine-only rollback is:

`EXPERIMENTAL_OPT_IN → DRAINING → DISABLED`

`DRAINING` rejects new sessions and tournament assignments while existing
sessions receive bounded cooperative cleanup. `DISABLED` rejects all new Lc0
sessions and hides/disables the Experimental control. Stockfish is unaffected,
and no main-code rollback is required. A full application rollback can use the
previous production deployment and
`backup/main-pre-lc0-experimental-public`.

Stop conditions include auth bypass, cross-user access, identity or manifest
mismatch, unexplained `SESSION_GONE`, repeated `STOP_TIMEOUT`, orphan workers,
relay residue growth, repeated normal-play forced termination, or cleanup
failure. A stop condition requires the kill-switch sequence above and must
finish in `DISABLED`, never `DRAINING`.

## Known operational debt

`EAE015A_RATE_ARGUMENT_INVALID` remains separate, known, non-blocking telemetry
debt. EAE-018 does not redesign telemetry. Operational authority remains with
the existing session, STOP timeout, worker, transport, reconnect, cleanup,
relay, active-session, and relay-row metrics.
