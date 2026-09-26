# CAISSA Engine Arena EAE-017 — Lc0 Match Lab time controls

## Scope and baseline

- Baseline: public `main` at `b2255ba7a2f5d2d1d17254c438d3ef601a62f050`.
- Branch: `feature/lc0-eae017-match-lab-time-control`.
- Rollout remains `INTERNAL_ONLY`; this work does not change Clerk, cohorts,
  browser/mobile gates, Maia identity, or the one-Lc0-per-competition rule.
- The Lc0 binary, Emscripten pthread worker, ONNX Runtime files, Maia 1100
  network, and Lc0 worker source retain their certified RC1 digests.

## Capability audit

Before EAE-017, Match Lab already owned the authoritative clock and generated
correct search options, but the isolated Lc0 adapter discarded them. Every Lc0
search was relayed as `GO mode=infinite`; the engine client emitted `go infinite`,
waited for an adapter timer, and required an explicit STOP before publishing the
best move. The relay schema accepted only `infinite` and bounded `nodes` modes.

The existing lifecycle remains authoritative:

- STOP is cooperative and bounded by the certified relay deadlines.
- Pause freezes the Match Lab clock before waiting for the matching STOP result.
- Resume allocates a fresh Arena search token and relay search ID.
- Durable sequence reconciliation never replays an accepted GO.
- A transport suspension locally stops uncertain search work while the Match Lab
  clock continues unless the user explicitly paused.

EAE-017 extends only the Arena adapter, relay command schema/lifecycle, isolated
runtime client, capability model, and Match Lab gate. It does not rebuild or
change Lc0, ORT, or Maia bytes.

## Final capability matrix

| Mode | Lc0 — Maia 1100 | Match Lab presets | Result |
| --- | --- | --- | --- |
| Bullet | No | 1+0, 1+1 | Disabled; transport/cold-response margin is not certified |
| Blitz | Yes | 3+0, 3+2, 5+0, 5+3 | Standard UCI clock fields |
| Rapid | Yes | 10+0, 10+5, 15+10 | Standard UCI clock fields |
| Long Game | Yes | 30+0, 30+20, 60+30 | Standard UCI clock fields |
| Fixed Depth | Yes | 8, 12, 16, 20, 24 | Exact `go depth N` |

The visible Bullet explanation is: “Lc0 Experimental does not currently
support Bullet Match time control.”

## UCI and relay mapping

The Match Lab clock remains the only clock. Its per-search snapshot is passed
unchanged through the adapter and validated again by the relay:

```text
GO { mode: "clock", wtime: 180000, btime: 179250, winc: 2000, binc: 2000 }
→ go wtime 180000 btime 179250 winc 2000 binc 2000

GO { mode: "depth", depth: 12 }
→ go depth 12
```

Clock values must be safe integers between zero and 86,400,000 milliseconds.
Fixed depth is restricted to 8, 12, 16, 20, or 24. Unknown fields, incomplete
clock tuples, and unapproved depths fail closed. Clock commands contain no
hidden `movetime`, nodes, or depth. Fixed-depth commands contain no clock.

Bounded searches may now publish their natural BESTMOVE and STOPPED result
without a fabricated STOP. A real STOP racing natural completion is idempotent:
the same search generation completes once and the STOP acknowledgement cannot
reopen it.

## Match Lab integration

Available modes are the generic intersection of the selected white and black
provider capability sets. Lc0 declares Blitz, Rapid, Long Game, and Fixed Depth;
Stockfish keeps its existing five modes. The UI disables an unavailable mode,
selects the first compatible fallback, and shows the provider-supplied reason.
The start path independently validates the same capability intersection before
allocating runtimes.

Runtime initialization, session claim, manifest verification, Maia load, and
position setup happen before `beginSearch`; they do not consume chess time.
Clock ownership follows board color, not provider identity, so the two-game
series reversal maps `wtime` and `btime` correctly and each game creates a fresh
clock controller.

## Flag fall, Pause/Resume, and transport

- Match Lab owns the deadline and records `termination=time-forfeit`.
- Flag fall invalidates the Arena search token, sends STOP for cleanup, and
  rejects any late BESTMOVE.
- Pause freezes elapsed time, invalidates the active token, then waits for the
  asynchronous STOP barrier.
- Resume begins a new search generation with the same remaining clock values.
- During transport suspension, the authoritative Match Lab clock continues.
  Durable relay reconciliation accepts only the current search ID and never
  fabricates a move.

## Compliance and immutable artifacts

The EAE-017 appliance release ID is
`eae017-lc0-0.33.0-maia1100-tc1`. Its client adapter is intentionally new, so
its deployment manifest is distinct from RC1. The certified engine artifacts
remain unchanged:

| Artifact | SHA-256 |
| --- | --- |
| `lc0.js` | `c2b1786ff568d0d5042588b5b9bbf7a78623e47930ad4358803f2a37e3ca66a9` |
| `lc0.wasm` | `5c3cc8c72b5794092790ab2c7615a7a7e9757e1c899fa2a4cc1ca158547a07f0` |
| `lc0.worker.mjs` | `7e6dad4bca61807357acfcb3789c781deaca3e20214ccd76dd82ddcb0be0a153` |
| `ort-wasm-simd-threaded.mjs` | `0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3` |
| `ort-wasm-simd-threaded.wasm` | `d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6` |
| `maia-1100.pb.gz` | `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4` |

Corresponding adapter source is committed beside the generated client. No
certified Lc0 source patch, binary, network, or Stockfish provider changed.

## Verification

The EAE-017 unit matrix covers provider capability intersection, exact Blitz,
Rapid, Long, and Fixed Depth payloads, white/black clock ownership, increments,
natural completion, STOP races, flag fall, stale BESTMOVE rejection,
Pause/Resume generations, durable transport reconciliation, and fail-closed
schema validation. Chromium covers the authoritative clocks, flag fall,
Pause/Resume, series reset/color reversal, fixed depth, background elapsed time,
mobile cleanup, and the Lc0 Bullet gate.

Deployment IDs, authenticated real-runtime results, cleanup counts, and the
final verdict are recorded only after the internal preview certification run.

## Internal preview checkpoint (2026-09-25)

The EAE-017 branch is deployed only to protected Preview infrastructure:

| Surface | Preview deployment | Deployment ID | Status |
| --- | --- | --- | --- |
| Main Arena | `eae017-main-elcriollitos-projects.vercel.app` | `dpl_7ndEg8bX7hsaQMeRPStapCxJ1eDj` | READY |
| Lc0 runtime | `eae017-engine-elcriollitos-projects.vercel.app` | `dpl_EUHdAdBz1QewFrrPbisnmZxpaVMc` | READY |
| Lc0 relay | `eae017-relay-elcriollitos-projects.vercel.app` | `dpl_6YLvTLf3ATAjBeXxk9WKgbxgQ53D` | READY |

The relay health response is HTTP 200 with `releaseStage=INTERNAL_ONLY`,
`productionShape=true`, and `mode=ENABLED`. The anonymous relay eligibility
request is rejected with `AUTH_REQUIRED`. The main EAE-016 gateway likewise
returns `authenticated=false`, `eligible=false`, `enabled=false`, and
`reason=AUTH_REQUIRED` for an anonymous request while retaining the exact
EAE-017 origins and deployment manifest.

The relay Preview environment contains one protected internal identity: the
same owner identity already authorized in production. The value remains hidden
and was neither printed nor committed. Production allowlist contents, Clerk,
roles, entitlements, publishable key, and rollout stage were not changed.

Automated verification at branch SHA
`cf5fbe8c25d80d4fab228b340d125719c6214c64` records:

- targeted EAE-017, rollout, and relay unit matrix: 87/87 passed;
- Match Lab Chromium matrix: 10/10 passed;
- full Arena Chromium regression: 106 passed, 1 skipped, with the single stale
  manifest fixture updated and its targeted regression rerun at 3/3 passed;
- immutable appliance verification: 8/8 artifacts verified, including a
  successful tamper-detection self-test;
- Git worktree clean and remote feature branch at the same SHA.

Authenticated physical A-J runtime certification remains pending. The owner is
authenticated on production and production still visibly exposes Experimental
Engines, but the local WOT browser extension blocks the protected `vercel.app`
Preview with its security-warning interstitial. That warning must be resolved
by the owner; automation must not bypass it. Until the physical run records the
authenticated eligibility result, actual Lc0/SF19 games, two-game series,
flag-fall cleanup, zero active sessions, zero relay rows, and zero critical
alerts, the release verdict remains pending rather than certified.

## EAE-017R STOP/BESTMOVE recertification checkpoint (2026-09-25)

### Root cause and bounded fix

The physical D run exposed two callers completing the same active search. A
late natural BESTMOVE started normal completion while the concurrent STOP path
also parsed and applied that line. The first application was legal; the second
validated the already-applied move against the new position, failed, and could
prevent QUIT/CLEANUP.

`engine/client-source.js` now gives each active search object one
`completionPromise`. Natural completion and STOP both call the same
`completeSearch(active, line)` operation. That promise owns validation,
BESTMOVE, STOPPED, and local state transition, so the move, clock settlement,
increment, next-search scheduling, and relay events can occur at most once.
The promise is stored on the exact active search generation; a later turn or a
resumed search receives a new active object and remains independently valid.

The deterministic directed matrix exercised all five required orderings over
50 iterations, plus a fresh next-generation search. The complete targeted
EAE-017/rollout/relay matrix passed 106/106 twice after manifest regeneration:
zero duplicate moves, zero double clock settlements, and zero cleanup failures.

### Runtime delta

| Item | Previous | Recertified |
| --- | --- | --- |
| Release ID | `eae017-lc0-0.33.0-maia1100-tc1` | `eae017-lc0-0.33.0-maia1100-tc1r1` |
| Manifest SHA-256 | `a38862ac2113cf4e5962aa35e30a315046bafe650fedb24471b9feab954b4ed3` | `9980a755a44b3d704f70505a803b6dd112c97a39853260bc648499b5bed4fd45` |
| Generated `client.js` bytes | 212,875 | 212,443 |
| Generated `client.js` SHA-256 | `1a1144463992ddc42b074302139213dea10c5851bfaad92b0c88e6f5c97c4ffb` | `61555ff04e76ea804940f728552188905e9e544f3109368ca2878ca26b0f8809` |

Only the CAISSA-owned browser client source and generated client changed. The
Lc0 source commit remains
`482bb4a830287b726ebe7d42f14ab7f5f17c18a0`, the toolchain is unchanged, and
the following runtime artifact hashes remain byte-identical:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `lc0-worker.js` | 108,891 | `7a2c0076871117e52e85dd7e0ae441ae2c080bc6bed3d48dadb0a0fa6f682287` |
| `lc0.js` | 255,351 | `c2b1786ff568d0d5042588b5b9bbf7a78623e47930ad4358803f2a37e3ca66a9` |
| `lc0.wasm` | 9,399,301 | `5c3cc8c72b5794092790ab2c7615a7a7e9757e1c899fa2a4cc1ca158547a07f0` |
| `lc0.worker.mjs` | 299 | `7e6dad4bca61807357acfcb3789c781deaca3e20214ccd76dd82ddcb0be0a153` |
| `ort-wasm-simd-threaded.mjs` | 24,180 | `0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3` |
| `ort-wasm-simd-threaded.wasm` | 13,479,978 | `d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6` |
| `maia-1100.pb.gz` | 1,313,193 | `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4` |

### Recertified Preview deployment

| Surface | Preview deployment | Deployment ID | Status |
| --- | --- | --- | --- |
| Main Arena | `eae017-main-elcriollitos-projects.vercel.app` | `dpl_9BVZzfYnGUbtVwVedsFzPAwQy5g2` | READY |
| Lc0 runtime | `eae017-engine-elcriollitos-projects.vercel.app` | `dpl_FMLKAZc8zWde7hUMWntGNk8httzd` | READY |
| Lc0 relay | `eae017-relay-elcriollitos-projects.vercel.app` | `dpl_DAA5AKTN53gzXpmnUJwpyEnvR5Jr` | READY |

The two previously authorized Deployment Protection exceptions remain limited
to the relay and runtime Preview aliases. No production deployment, merge,
Clerk, allowlist, role, entitlement, Maia, Stockfish, or rollout-stage change
occurred. Final health probes returned HTTP 200 for both the relay and runtime;
the relay reported `INTERNAL_ONLY`, `productionShape=true`, and `mode=ENABLED`.

### Physical matrix result

| Case | Result | Physical evidence |
| --- | --- | --- |
| A | retained PASS | Lc0 white vs SF19, Blitz 3+2; runtime-source delta does not alter capability/clock mapping |
| B | PASS | SF19 white vs Lc0 black; legal Lc0 moves followed by one STOP/BESTMOVE/STOPPED and acknowledged CLEANUP |
| C | retained PASS | Pause/Resume same game and fresh search generation; stale BESTMOVE rejected |
| D | PASS | STOP during live Lc0 search produced one authoritative `5.Be3`, one BESTMOVE, one STOPPED, then ACK and CLEANUP |
| E | PASS (series semantics) | Two-game Blitz series completed 2/2, colors reversed, both games recorded, and the second game received fresh clocks |
| F | PASS | Rapid 10+0 emitted real `GO mode=clock` with 600,000 ms and cleaned cooperatively |
| G | PASS | Long 30+0 emitted real `GO mode=clock` with 1,800,000 ms and cleaned cooperatively |
| H | PASS | Fixed Depth emitted exact `GO mode=depth, depth=12` and cleaned cooperatively |
| I | PASS | Chromium controlled flag fall recorded `time-forfeit`, applied no late move, and rejected the late BESTMOVE (1/1); focused clock race unit cases passed 5/5 |
| J | retained PASS | Bullet remains disabled by the unchanged provider-capability intersection |

For every captured live-search STOP in D, B, F, G, and H, the runtime trace
contains exactly one terminal BESTMOVE and one STOPPED for the current search,
followed by `QUIT`, `ACK`, and `CLEANUP`. The broker rejects CLEANUP unless its
evidence is exactly `parentWorkers=0`, `pthreadWorkers=0`,
`runtimeState=TERMINATED`, `cleanupAcknowledged=true`, and
`forcedTerminations=0`. After that accepted event, the main client passes the
release advance gate and calls `terminate`; `DurableBroker.terminate()` deletes
the session row. The runtime also retains a truthful `CLEANED LOCALLY; broker
acknowledgement unavailable` state for transport-loss cleanup and never labels
that path as broker-acknowledged.

The owner-supplied real Chrome console log is retained as corroborating physical
evidence: registry 4 to 5, actual Lc0 Maia 1100 vs SF19 match, legal engine
moves, pause, stale-result rejection, successful resume, stop, and destruction
of all Arena engines.

### Control-plane correlation

Repeated `/api/eae016` 503 responses in the earlier console sample were caused
by Preview infrastructure/config availability while the relay/runtime aliases
were still being corrected and protected. They are not engine-search failures.
After the exact alias exceptions and manifest/origin correction, authenticated
GET diagnostics recorded `authenticated=true`, `cohortEligible=true`,
`runtimeHealthy=true`, `relayHealthy=true`, `manifestValid=true`,
`mode=ENABLED`, and `releaseStage=INTERNAL_ONLY`; Experimental Engines became
visible again. Runtime searches and cleanup continued successfully while the
auxiliary `/api/user/sync` 403, `/api/beta/access` 503, and EAE-016 telemetry
POST `EAE015A_RATE_ARGUMENT_INVALID` remained separately observable.

### EAE-017.1 compliance and residue closure

The exact tc1r1 corresponding source is published as the immutable public
release `lc0-browser-source-v0.1.3` (v0.1.2 was already an immutable RC3 source
release and was not overwritten):

`https://github.com/elcriollito/TVLavin-Chess-Game2/releases/download/lc0-browser-source-v0.1.3/caissa-lc0-browser-corresponding-source-v0.1.3.zip`

The 1,481,846-byte archive SHA-256 is
`9b87bc53ce6bb75388f70158faf40c4b73434ff137e58fef06998ec7cc5e7def`.
An unauthenticated download returned HTTP 200, matched that digest, extracted
successfully, and verified all 444 manifest-covered members. Clean appliance
reconstruction reproduced the 212,443-byte client SHA-256
`61555ff04e76ea804940f728552188905e9e544f3109368ca2878ca26b0f8809`,
runtime-manifest SHA-256
`9980a755a44b3d704f70505a803b6dd112c97a39853260bc648499b5bed4fd45`,
and all seven unchanged runtime artifact digests. Legal status is
`LEGAL_SIGNOFF_RC3R1_COVERED`: the delta is CAISSA-owned integration source;
all previously approved third-party inputs and terms are unchanged.

Direct aggregate evidence came from an authorized read-only query against
production `public.eae011_sessions`. An active relay row is any retained row
whose `state.lifecycle` is not one of `CLEANED`, `FAILED`, or `EXPIRED`; null or
unknown lifecycle values are deliberately counted as residue. The final result
was `active_row_count=0`. The same read-only checkpoint reported
`mode=ENABLED`, zero triggered alerts, and zero critical alerts.

The separate telemetry POST failure is non-blocking operational debt. The
telemetry handler passes `eae016_telemetry_<actor-hash>` as the session ID and
lowercase `product` as the rate bucket to the session-scoped
`eae015a_allow_rate` RPC. Those arguments violate the RPC's session-ID length
and uppercase-bucket contract and telemetry has no relay-session row to bind
to. This breaks aggregate product telemetry only; it does not participate in
engine search, clock settlement, STOP/BESTMOVE handling, cleanup, or relay-row
deletion.

`COMPLIANCE_UPDATE_COMPLETE` and `RELAY_ZERO_RESIDUE_CERTIFIED` are both met.
The final verdict is `LC0_MATCH_LAB_TIME_CONTROL_CERTIFIED`. Rollout remains
`INTERNAL_ONLY`; `CANARY_OPT_IN` and `EXPERIMENTAL_OPT_IN` remain disabled.
