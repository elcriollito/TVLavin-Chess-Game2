# CAISSA Engine Arena EAE-015A — Lc0 production-hold remediation

Date: 2026-09-22/23 EDT
Branch: `experiment/lc0-eae015a-production-infrastructure`
EAE-014 review lineage: `a0d4062c7640f858e95c7622cee6ed838f9e224d`
Verdict: **LC0_HOLD_BLOCKERS_PARTIAL**

This work is preview/staging evidence only. It does not register Lc0 in the public Engine Arena, assign production DNS, change `www.caissa-chess.org`, migrate the production database, merge to `main`, or authorize a production rollout.

## EAE-014 preservation

The annotated remote tag `engine-arena-expansion-eae014-production-hold` has tag object `40e1eaf8c83e27f45f2f3bca020efb72c87014cf` and peels exactly to `a0d4062c7640f858e95c7622cee6ed838f9e224d`. Its message is `CAISSA Lc0 EAE-014 — production readiness HOLD review`.

## Isolated preview architecture

The verified preview topology is:

```text
protected main preview
  https://eae015a-main-elcriollitos-projects.vercel.app
          |
          v
protected relay preview (separate Vercel project)
  https://eae015a-lc0-relay-elcriollitos-projects.vercel.app
          |
          v
protected runtime appliance (separate Vercel project)
  https://eae015a-lc0-runtime-elcriollitos-projects.vercel.app
```

The aliases are Vercel preview aliases, not CAISSA production DNS. The Ready deployment records are main `dpl_FZUSgwhm31Szen8HgN64R5uffv8b`, relay `dpl_87i5q9t8YWb339EDy3rCU4RXcEV7`, and runtime `dpl_7CLemQ8Vw9Y4bsJ4drRack4LKTp3`; each reports target `preview`.

The runtime appliance contains only its shell, stylesheet, health document, release manifest, Lc0 client/worker/runtime, ONNX Runtime Web WASM loader/runtime, and Maia network. It contains no CAISSA navigation, Clerk UI, payment UI, or unrelated application surface. The live browser check found zero forms, zero links, and only the versioned Lc0 client script. A direct load, without an Arena-issued claim, failed closed as `MAIN_ORIGIN_MISMATCH`.

Verified live runtime properties:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: same-origin`
- `crossOriginIsolated === true`
- `typeof SharedArrayBuffer === "function"`
- restrictive CSP, `noindex`, no-store shell, and immutable versioned assets

The main site's global headers were not changed. The relay has a separate project and an exposed route allowlist; however, Vercel's deployment inspection still shows unrelated hidden functions in the relay build artifact. This means relay project separation exists, but the desired minimal relay artifact/blast-radius boundary is not yet complete.

During setup, Vercel classified the first deployment of each new project as a production target despite the preview request. None was retained as an active production release: the transient runtime and relay production-classified deployments were deleted, as was an accidentally created `dist` project. The current runtime and relay deployment inventories contain preview targets only. No production DNS or public alias was assigned.

## Server-authoritative lifecycle

`production-policy.mjs` defines these states and validates every transition:

`CREATED`, `CLAIMED`, `INITIALIZING`, `READY`, `SEARCHING`, `STOPPING`, `IDLE`, `DISCONNECTED_GRACE`, `CLEANING`, `CLEANED`, `FAILED`, and `EXPIRED`.

`CLEANED`, `FAILED`, and `EXPIRED` are terminal. Transition attempts out of a terminal state fail and terminal entry invalidates the engine credential, so requests cannot resurrect a terminal session.

| Policy | Value | Meaning |
|---|---:|---|
| one-use claim window | 60 s | engine must claim before expiry |
| client heartbeat | 5 s | renewable signal cadence |
| heartbeat lease | 30 s | short server-authoritative lease |
| reconnect grace | 20 s | bounded transport turnover grace |
| idle timeout | 10 min | bounded between legitimate activity |
| absolute cap | 2 h | finite competition-session safety cap |
| STOP acknowledgement | 10 s | preserves certified long-tail tolerance |
| STOP result | 5 s | bounded terminal result wait |
| terminal audit retention | 7 d | bounded tombstone retention |

The database clock creates timestamps and the two-hour cap. Caller timestamps remain only for RPC compatibility and are not trusted. Session identity is bound to a server-generated competition identifier.

## Scheduled cleanup

Staging project `aqizagaskicotorfpwfn` owns the preview-only migration. Production project `jczauvkfkweuvdpurpem` was not modified.

Supabase Cron job `eae015a-lc0-cleanup` executes once per minute:

```sql
select * from public.eae015a_cleanup(0, 100, 604800000)
```

The function uses the database clock, a 100-row bounded batch, row locking with `skip locked`, a version-checked reasoned delete RPC, and seven-day audit retention. It removes unclaimed, hard-expired, idle-expired, heartbeat-expired, and retained-terminal sessions. Repeated calls are harmless.

Five consecutive live Cron runs returned `succeeded`. A synthetic staging session with an expired hard cap produced exactly one removal, no live row remained, and the audit row recorded:

```text
delete_reason=SESSION_HARD_EXPIRY
delete_actor=SCHEDULED_CLEANUP
expiry_check_source=eae015a_cleanup
```

No `UNKNOWN` deletion reason is accepted. The unit contract also proved cleanup batches of `2, 1, 0` across repeated passes.

## Relay load and bounds

Rate windows live outside the authoritative session document. Invalid claims and rate-rejected INFO/command/reconnect attempts update only a minimal bounded counter; tests prove rejected INFO and invalid-claim traffic cause zero full-session rewrites. The rate RPC is serialized by a per-session/bucket advisory lock and uses the database clock.

INFO remains low priority and is accepted at no more than four messages per second. STOP, QUIT, ACK, BESTMOVE, STOPPED, CLEANUP, and ERROR retain priority and are not coalesced behind raw analysis chatter. Request payloads remain bounded.

Idle polling now backs off per stream from 100 ms through 200/400/800 ms to 1 s, resetting to 100 ms when events arrive. A separate 15-second SSE comment keeps the transport alive without a database write. Function turnover is safe because the cursor and authoritative state remain durable.

### Synthetic idle-read model

The model counts both streams and does not instantiate real engines:

| Concurrent sessions | Before, 250 ms polling | After, adaptive polling | Reduction |
|---:|---:|---:|---:|
| 1 | 480 reads/min (8.0/s) | 124 reads/min (2.07/s) | 74.17% |
| 10 | 4,800 reads/min | 1,240 reads/min | 74.17% |
| 100 | 48,000 reads/min | 12,400 reads/min | 74.17% |

Each session maintains two long-lived stream requests rather than reconnecting per poll. Nominal heartbeats add 24 POSTs/min/session (two roles, every five seconds). Reconnects are capped at 12/min/session and INFO persistence at 240 accepted updates/min/session. Exact database writes depend on game/search activity; rejected excess INFO performs one minimal counter write and no full-row write. Cleanup scans at most 100 candidate rows per invocation.

This is materially better than EAE-014's idle profile, but is not yet adequate evidence for a public rollout: the staging workload model has not been supplemented by hosted telemetry from a 100-client run, and heartbeats still update the full session row.

## Immutable release manifest and READY gate

Release ID: `eae015a-lc0-0.33.0-maia1100`
Manifest SHA-256: `40f1e5433415ce33e57c16fc164b53b0edeabf5f2f09cd357faa81778f567a81`
Versioned root: `/assets/lc0/eae015a-lc0-0.33.0-maia1100/`

The manifest pins Lc0 source commit `482bb4a830287b726ebe7d42f14ab7f5f17c18a0`, three local patch SHA-256 values, Emscripten `3.1.64`, Meson `1.8.3`, Ninja `1.11.1.4`, esbuild `0.28.1`, ONNX Runtime Web `1.27.0`, chess.js `1.4.0`, and Maia commit/network provenance. All eight runtime artifacts contain byte counts, SHA-256, license identifiers, source references, and `verifyBeforeReady: true`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `client.js` | 203,889 | `e956482e38423f4787fcc6f2043548d469edba19f35d7ddde34a0e64c96bccf5` |
| `lc0-worker.js` | 108,527 | `1bdef9685ae3363704f4f7900f06c18fe822a24b41cf25b5c208a5ee89c1f358` |
| `lc0.js` | 255,351 | `c2b1786ff568d0d5042588b5b9bbf7a78623e47930ad4358803f2a37e3ca66a9` |
| `lc0.wasm` | 9,399,301 | `5c3cc8c72b5794092790ab2c7615a7a7e9757e1c899fa2a4cc1ca158547a07f0` |
| `lc0.worker.mjs` | 299 | `7e6dad4bca61807357acfcb3789c781deaca3e20214ccd76dd82ddcb0be0a153` |
| `ort-wasm-simd-threaded.mjs` | 24,180 | `0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3` |
| `ort-wasm-simd-threaded.wasm` | 13,479,978 | `d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6` |
| `maia-1100.pb.gz` | 1,313,193 | `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4` |

The total manifest-listed first load is 24,784,718 bytes, plus 9,693 bytes for the shell, stylesheet, health file, manifest, and Vercel configuration in the staged upload (24,794,411 bytes total). The versioned asset path sends `Cache-Control: public, max-age=31536000, immutable`; repeat loads can be served from browser/CDN cache. The shell is `private, no-store`.

Before `READY`, the client verifies the manifest digest and every critical artifact's byte length and SHA-256. The build verifier independently validates all eight artifacts, client SRI, isolation headers, forbidden UI strings, and a one-byte tamper self-test. The observed verifier result was eight artifacts, 24,784,718 bytes, tamper `DETECTED`. Any critical mismatch fails closed.

## Reproducible build

From `experiments/lc0-browser-lab`, a fresh Windows checkout runs:

```powershell
.\scripts\build-runtime.ps1 -ProvisionToolchain
$env:EAE015A_MAIN_ORIGIN='https://eae015a-main-elcriollitos-projects.vercel.app'
$env:EAE015A_RELAY_ORIGIN='https://eae015a-lc0-relay-elcriollitos-projects.vercel.app'
npm run build:appliance
npm run verify:appliance
```

The build script clones the pinned source commit, checks and applies the three pinned patches, provisions the pinned Emscripten/Meson/Ninja versions, builds Lc0, fetches and verifies the pinned Maia network, stages pinned ONNX Runtime Web assets, and creates the appliance. The resulting manifest is the artifact identity. A fresh independent byte-for-byte rebuild has not been performed in EAE-015A; therefore the published hashes certify the staged bytes and source/toolchain provenance, not a claim that every host produces identical compiler output.

## Kill switch and drain behavior

The independent control row defaults to `DISABLED` and is readable/updatable only by the server service role. The main preview configuration and separate relay query it on every request; no main-site redeploy is required.

- `ENABLED`: new Lc0 sessions and valid active traffic are allowed.
- `DRAINING`: new sessions are rejected with `LC0_DRAINING`; valid existing sessions may continue inside lease/idle/absolute bounds.
- `DISABLED`: new sessions are rejected; GO/ordinary INFO are rejected. STOP, QUIT, ACK, BESTMOVE, STOPPED, CLEANUP, and ERROR remain allowed so an active engine can stop and clean up during its bounded grace.

The live staging exercise observed both relay health and main configuration in `ENABLED`, then `DRAINING` with provider unavailable, then `DISABLED` with provider unavailable. The final persisted state is `DISABLED` with reason `EAE-015A exercise complete; preview hold restored`. Policy tests prove new-session denial and cleanup-only traffic in disabled mode. Stockfish is outside the Lc0 control path.

The requested active-match drain exercise was not completed because the dedicated relay preview does not yet have its isolated Clerk verifier configuration and no test-user credential was introduced. No authorization was weakened to manufacture a pass.

## Licensing and distribution checklist

This is engineering evidence, not legal advice.

| Component | Recorded license | Technical distribution action | Status |
|---|---|---|---|
| patched Lc0/lc0.js runtime | GPL-3.0-or-later | ship copyright/license notices; publish exact corresponding modified source, build scripts, and three-patch series for the distributed object code | source and hashes reproducible locally; public corresponding-source location/source offer not yet established |
| Maia 1100 network | GPL-3.0 in the pinned repository/release evidence | preserve copyright/license notice and make the pinned network/source provenance available | provenance/hash recorded; human review of network redistribution package still required |
| ONNX Runtime Web | MIT | include MIT copyright/license notice with distribution | version, source, and artifact hashes recorded; notice bundle not yet shipped |
| Emscripten-generated glue/runtime | manifest records MIT and Apache-2.0 with LLVM exception for the toolchain | retain applicable notices for incorporated runtime portions | toolchain pinned; generated-artifact notice review remains required |
| Meson/Ninja/esbuild/chess.js | Apache-2.0/MIT/BSD-2-Clause as recorded | retain applicable notices in the distribution notice bundle | versions/sources recorded; final notice bundle not yet shipped |

The authoritative evidence begins with the pinned [Lc0 COPYING](https://github.com/LeelaChessZero/lc0/blob/482bb4a830287b726ebe7d42f14ab7f5f17c18a0/COPYING), [Maia source revision](https://github.com/CSSLab/maia-chess/tree/37de81e2bef89336e03266b3b5f7e1155ba68f5d), [ONNX Runtime license](https://github.com/microsoft/onnxruntime/blob/v1.27.0/LICENSE), and [Emscripten license](https://github.com/emscripten-core/emscripten/blob/3.1.64/LICENSE). Final human/legal review must decide the exact public corresponding-source delivery mechanism, Maia notice package, and combined third-party notice contents before production distribution. Because those obligations are not yet operationally resolved, this task cannot declare the hold cleared.

## Security and observability evidence

Focused contracts cover cross-user rejection, one-use claim replay, invalid claims, origin/host rejection, request/message/PV bounds, durable rate limits, late BESTMOVE, stale search IDs, cleanup races/idempotence, lease/hard expiry, terminal non-resurrection, and switch policy. The live relay rejected an unapproved origin as `ORIGIN_REJECTED`. The two new control/rate tables have RLS enabled, all anon/authenticated privileges revoked, and service-role-only grants; advisor INFO findings report “RLS enabled with no policy” because denial is intentionally privilege based. No EAE-015A ERROR-level security advisor was returned.

Safe structured cleanup logs include reason counts and latency. Memory-store test instrumentation measures reads, full writes, minimal writes, and cleanup scans. The intended production metric names are: active sessions, create, claim success/failure, READY latency/failure, STOP latency/timeout, cleanup latency/failure, forced kill, worker crash, `SESSION_GONE`, lease expiry, scheduled cleanup count, rate rejection, relay read/write rates, and kill-switch rejection. A durable metrics sink/dashboard and alerts for the complete list are not wired in this branch, so observability remains a rollout blocker rather than a claimed pass. Logs must never contain claim tokens, bearer tokens, service-role credentials, FEN/PV payloads, or user identifiers.

The staging database advisor also reports unrelated baseline INFO notices (RLS-with-no-policy tables, three unindexed foreign keys, and unused indexes). The two EAE-015A cleanup indexes are new and naturally reported unused in the new staging workload. See the Supabase remediation references for [RLS policy lint](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

During staging credential discovery, the legacy staging service-role JWT appeared in a local tool transcript. It was not written to the repository and no production credential was involved. Rotate that staging legacy key and update the protected preview environment before any further live exercise.

## Verification summary

- focused relay/infrastructure/store tests: 28 passed, 0 failed, 1 explicitly skipped staging integration case
- Arena/Stockfish/Lc0 unit contracts: 44 passed, 0 failed
- Generation Cup Chromium smoke: 5 passed, 0 failed while the Lc0 switch was `DISABLED`
- isolated lab contracts: 4 passed, 0 failed
- real local Chromium Lc0 regression: 6 passed, 0 failed; 20 legal positions, 20 STOP/restart operations, 20 full active-search lifecycle cycles, fault/race coverage, zero residual workers after normal cleanup, and zero forced terminations in the normal lifecycle cycles
- runtime manifest verifier: passed; eight artifacts; tamper detected
- live runtime: isolated/SAB/minimal-surface checks passed
- live runtime assets: all eight returned expected byte lengths
- scheduled cleanup: active every minute; repeated successes; reasoned synthetic expiry passed
- live control sequence: `ENABLED → DRAINING → DISABLED`; final state `DISABLED`
- unapproved live relay origin: rejected
- current Vercel runtime/relay deployments: preview only
- production database, production DNS, public provider catalog, main branch: unchanged

## Exact remaining blockers

1. Build the relay project from a minimal deployment root so unrelated CAISSA functions are absent from the artifact, not merely unreachable through routes.
2. Configure isolated relay authentication safely and run the full live active-session sequence: enabled match, draining denial of a second session, bounded completion of the first, disabled cleanup, and switch-independent Stockfish Match/Tournament.
3. Run the required post-change real-engine matrix: Lc0–SF19, SF19–Lc0, and one SF18/SF19/Lc0 tournament, including READY, legal moves, Pause/Resume, STOP, and cleanup. Generation Cup already passes with the Lc0 switch disabled, but the active-session transition still needs its paired Stockfish check.
4. Run a hosted 10/100 dummy-client load exercise and capture actual relay requests, durable reads/writes, reconnects, cleanup latency, and heartbeat-write cost; the deterministic model alone is insufficient for rollout capacity.
5. Wire and verify the complete production metrics sink/dashboard/alerts rather than relying on cleanup logs and unit counters.
6. Complete human/legal sign-off and publish the exact corresponding modified source/patch/build and third-party notice delivery plan.
7. Perform a clean-host rebuild comparison and document whether the pinned compiler output is byte-identical; if it is not, document deterministic provenance/functional equivalence acceptance.
8. Rotate the exposed legacy staging service-role JWT, update only the protected preview environment, and verify the old key is invalid.

These gaps prevent a truthful `LC0_HOLD_BLOCKERS_CLEARED` result. The next step is not EAE-015B yet; close the eight items above in a follow-up preview-only remediation pass.
