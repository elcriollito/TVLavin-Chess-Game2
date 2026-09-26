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
