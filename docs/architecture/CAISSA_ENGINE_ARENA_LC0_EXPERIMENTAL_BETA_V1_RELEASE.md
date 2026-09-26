# CAISSA Engine Arena — Lc0 Experimental Beta v1 release

## Release identity

EAE-019 publishes **Lc0 — Maia 1100** as a publicly visible, explicitly
opt-in Experimental engine. The release started from `origin/main` at
`608355fa290cf2bffb1b5efbc3ffa4958e22be18`. The certified cleanup hotfix
`d3063afa67ce7e61760662c072eb388a65d674bb` was integrated by PR #14; its
production code merge is `486a650c95c4ed7da311a57b5e68955a32194d30`.

The immutable final release SHA is the peeled commit target of the annotated
tag `lc0-experimental-beta-v1`. This tag is the authority for the final main
SHA because embedding a commit's own SHA in this tracked file would be
self-referential. The release report records the same exact peeled SHA after
the documentation-only closeout merge.

The pre-change safety ref `backup/main-pre-lc0-public-final` points exactly to
`608355fa290cf2bffb1b5efbc3ffa4958e22be18`.

## Production deployments

The physical release smoke used these READY production deployments:

- main: `dpl_3BxMUa4xUyGokGi8q6i2E1kU4qBj`;
- relay: `dpl_St4Mvn9AqzZzTG5XqXdf62723atF`;
- isolated runtime: `dpl_FXhpXU584jgLKDUQysUSSQYxro5x`.

The main project was first deployed after the merge with both controls
disabled as `dpl_BbPXnt9vZFy5yDfEjTQFmgGi6L6P`. The relay was likewise
deployed disabled as `dpl_C3ZyXtH7xzvr8a27hspYpAuaGkvz`. The final
documentation-only main deployment does not alter executable/runtime code and
is recorded in the release report.

## Runtime provenance

- Runtime release: `eae017-lc0-0.33.0-maia1100-tc1r1`.
- Manifest SHA-256:
  `9980a755a44b3d704f70505a803b6dd112c97a39853260bc648499b5bed4fd45`.
- Deployed `client.js`: 212,443 bytes, SHA-256
  `61555ff04e76ea804940f728552188905e9e544f3109368ca2878ca26b0f8809`.
- Maia 1100 SHA-256:
  `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`.

All eight deployed runtime artifacts were downloaded and matched the live
certified manifest byte-for-byte. No runtime artifact changed in EAE-019.

## Public opt-in, authentication, and browser policy

Final controls are `releaseStage=EXPERIMENTAL_OPT_IN` and `mode=ENABLED`.
The Experimental Engines control and **Lc0 — Maia 1100 / Experimental** are
publicly discoverable on supported desktop browsers. Enabling the provider is
an explicit first-use consent; doing nothing loads no Lc0 runtime, WASM, Maia,
ORT, relay session, or engine window.

Anonymous users may see the control but cannot create a session. Actual Lc0
session creation requires a valid CAISSA Clerk identity. Public Experimental
eligibility does not consult the former internal Beta Tester allowlist.
Desktop Chrome and Edge are supported. Firefox, Safari, iOS, Android, and
other mobile browsers are blocked before provider registration and fetch no
heavy Lc0 assets.

The existing Clerk instance and publishable key were not changed by EAE-019.
The rotated Clerk server secret remains active in the main and relay projects;
the retired default secret remains revoked. Roles, entitlements, users, and
allowlists were not changed.

## Match and identity policy

Certified Match Lab modes are Blitz, Rapid, Long Game, and Fixed Depth.
Bullet is disabled and rejected truthfully when Lc0 is selected. A competition
may contain at most one Lc0 participant; Lc0 versus Lc0 is prohibited. Lc0 may
play Stockfish 2019 MV, its Lite profile, Stockfish 18 Lite, or Stockfish 19
Lite. Stockfish remains the evaluator.

The permanent invariant is requested engine = provider = actual runtime =
visible identity. There is no silent Stockfish fallback for an Lc0 failure.

## Production certification

Focused regression passed 189/189 Node tests, 26/26 durable-broker/cleanup
tests, and 61/61 focused Chromium Arena checks. Physical production checks
passed with Lc0 as White and Black against Stockfish 19 Lite in Blitz 3+2,
same-game Pause/Resume with frozen then resumed clocks, cooperative STOP,
representative Rapid and Long games, Fixed Depth 12, and Bullet rejection.
A final Stockfish-only Blitz 3+2 match then produced a legal move and live
evaluation and stopped normally, proving Stockfish remained independent.

The physical STOP path reported `CLEANED`. The cleanup contract suite proves
duplicate and post-delete cleanup return successful `ALREADY_CLEANED` instead
of HTTP 500. After all physical smoke and the Stockfish post-smoke, direct
authorized aggregate reads reported control `ENABLED`, active sessions `0`,
relay rows `0`, and triggered critical alerts `0`. The current smoke produced
no cleanup failure, forced-termination spike, STOP-timeout spike, scheduled
cleanup failure, or relay-error spike.

## Security rotation closure

Supabase uses the current ECC P-256 signing key and current `sb_secret`
backend credentials. The legacy HS256 signing key is revoked; legacy
`service_role` is rejected both as an API key and as a bearer JWT, and legacy
`anon` is rejected. Main, relay, cron, lifecycle cleanup, and Stockfish were
verified healthy after the rotation. No secret value is stored here.

## Corresponding source and licenses

The About / engine-sources surface links to immutable release
`lc0-browser-source-v0.1.3`. Its corresponding-source archive SHA-256 is
`9b87bc53ce6bb75388f70158faf40c4b73434ff137e58fef06998ec7cc5e7def`.
The release is discoverable with its license information and was not modified.

## Kill switch and rollback

The independent emergency path is:

`EXPERIMENTAL_OPT_IN → DRAINING → DISABLED`

`DRAINING` rejects new work while bounded cooperative cleanup finishes;
`DISABLED` rejects new Lc0 sessions. Neither step requires a main rollback and
Stockfish is unaffected. Full rollback can restore the previous executable
main deployment `dpl_BbPXnt9vZFy5yDfEjTQFmgGi6L6P`, or use the pre-release
code deployment `dpl_Eo7MKYHZzAvCUVYjwJoTfRRGbnqb`, together with safety ref
`backup/main-pre-lc0-public-final` as appropriate.

Immediate drain/disable conditions remain auth bypass, cross-user access,
identity or manifest mismatch, unexplained `SESSION_GONE`, `STOP_TIMEOUT`,
cleanup HTTP 500/residue, orphan workers, normal-play forced termination, or a
relay-error spike attributable to the current release.

## Known non-blocking debt

`EAE015A_RATE_ARGUMENT_INVALID` remains known, separate telemetry debt. It did
not affect runtime correctness, authentication, cleanup, or the final gates and
is not redesigned in this release.
