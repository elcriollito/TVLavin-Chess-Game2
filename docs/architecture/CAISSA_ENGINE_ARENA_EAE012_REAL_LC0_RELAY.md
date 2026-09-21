# CAISSA Engine Arena — EAE-012 real Lc0 preview relay

Status: preview experiment only. This is **not** an Engine Arena provider, Match or Tournament entry, mobile certification, production header change, or production rollout.

## Checkpoints and provenance

- EAE-011 certified relay commit: `77d1483f891e6a1a0b8ecb8b9a21ce1d88ad2328`; annotated remote tag `engine-arena-expansion-eae011-preview-relay-certified` peels to that exact commit. EAE-012 branched from it as `experiment/lc0-eae012-real-relay-client`.
- EAE-008A certified lifecycle commit: `9afa02c5d0c731609d0cc749eb7ba042897b0bc3`. The browser runtime/lifecycle source was already in the EAE-011 ancestry: `experiments/lc0-browser-lab/src/lab-runtime.js` has the identical Git blob `9fb098fc7a3977ea3f3bcea0ae4a876356602fc6` at both checkpoints. EAE-012 adapts its asset paths and transport but retains its stop, cooperative quit and emergency fallback logic. The EAE-011 broker architecture was retained; no old experimental branch was merged wholesale.
- Lc0 fork `https://github.com/jalpp/lc0.js.git`, upstream browser work `https://github.com/LeelaChessZero/lc0/pull/2432`, source `482bb4a830287b726ebe7d42f14ab7f5f17c18a0`, version `v0.33.0-dev+git.482bb4a` (GPL-3.0-or-later).
- Patch order is `0001-browser-stop-signal.patch` (`89db61927a6e4709460ef8eabcdcd0b053d7f39793a333d4e21bc0595d5eb015`), `0002-cooperative-exit.patch` (`0d47b067fd237e4730233b2511de84b79d2d878628e86b3c104bb0f39554c9f4`), then `0003-opt-in-native-uci-trace.patch` (`1a370fb23195d097c0ff3c12d0c1a004e5a6ab3ac952475334cc9cb06bd6f75d`). These remain in `experiments/lc0-browser-lab/patches/`.
- Toolchain: Emscripten 3.1.64, Meson 1.8.3, Ninja 1.11.1.4, ONNX Runtime Web 1.27.0; CPU/WASM with SIMD, pthreads, Asyncify and memory growth. Lc0 and ORT are configured to one thread each. No dependency, binary, network or pthread configuration upgrade was made.
- Network: CSSLab Maia 1100 v1.0, `https://github.com/CSSLab/maia-chess`, source `37de81e2bef89336e03266b3b5f7e1155ba68f5d`, release `https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1100.pb.gz`, GPL-3.0, Lc0 protobuf gzip, exactly 1,313,193 bytes and SHA-256 `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`. The exact network and five runtime artifacts were checked byte-for-byte against `engine/lab-manifest.json`; a corrupt network fails before READY.
- The complete manifest has SHA-256 `b1a28b43918980191d62fc9c67892a00a5458126a1005ea139615c9c9b633c2a`. Artifact hashes and byte lengths are in that manifest; the experiment does not accept a substitute artifact.

## Two-origin architecture and trust boundary

The authenticated main harness is `https://eae012-main-elcriollitos-projects.vercel.app/experiments/lc0-preview-relay/main/`; the isolated engine is `https://eae012-engine-elcriollitos-projects.vercel.app/experiments/lc0-preview-relay/engine/`. Both are protected preview aliases of a preview deployment. The engine path alone has COOP `same-origin`, COEP `require-corp`, same-origin resource policy and a WASM/worker CSP. The main page keeps the normal CAISSA policy. Actual engine runs observed `crossOriginIsolated === true` and `SharedArrayBuffer` available. No opener, cross-window message, transferred port or shared auth cookie is used. The browser clients communicate only through the durable `/api/eae011` relay backed by **staging** Supabase project `aqizagaskicotorfpwfn`.

Main uses a real Clerk session JWT to create a competition-scoped session. The broker returns a 30-second, single-use claim capability. The engine claims it before fetching artifacts or creating workers; the broker replaces it with a scoped engine credential, stores only salted token verifiers, and never sends a Clerk JWT to the engine origin. Owner, engine credential and origin checks are separate. The preview API does not use wildcard CORS. A third origin was rejected with 403; User B received 404 for User A inspect, stream, POSITION, GO, STOP, QUIT and terminate, and an unrelated engine credential received 403. No production Auth or Supabase schema was changed.

After claim the engine verifies all artifact lengths and SHA-256 hashes, starts the real worker, completes UCI/`isready`, verifies actual `id name Lc0 v0.33.0-dev+git.482bb4a` and `id author The LCZero Authors.`, and only then publishes READY. The broker and main client independently require the exact immutable identity: provider class `lc0-browser-experimental`, version/source commit/UCI name/author, backend `cpu-wasm`, network ID/hash, manifest hash, and a UUID runtime instance. A mere claim never means READY. On reload, the main client re-verifies the persisted relay identity before displaying it.

## Real protocol and ordering

The broker accepts only normalized HELLO, POSITION, GO, STOP, RESET and QUIT, never arbitrary UCI strings. The engine maps POSITION (`startpos` plus validated UCI history, or validated FEN) to UCI; `chess.js` validates legality locally. GO is constrained to `nodes` 1–64 or `infinite` for active-stop tests. UCI `info` is parsed into bounded `{depth,nodes,score,pv}` fields; local throttling and the broker's replaceable low-priority INFO journal prevent stdout flooding. Control/ACK/BESTMOVE/CLEANUP remain high priority. The preview main validates the UCI BESTMOVE against its chess position and converts it to SAN for display.

Each GO has a unique search ID and monotonic command and engine event sequences. STOP is accepted for only the active ID. The certified EAE-008A atomic signal interrupts active search; one legal BESTMOVE is associated with that ID, followed by the queued UCI stop and relay STOPPED. RESET and verified READY gate reuse. Late BESTMOVE A for search B is rejected by the broker: both a unit test and live injection in the real client returned `BESTMOVE_STATE_INVALID` (409), while search B still produced one legal BESTMOVE and cleaned normally. A duplicated GO cannot execute twice. The broker also expires an ACKed STOP without a BESTMOVE after five seconds, avoiding a false terminal result.

QUIT is rejected during SEARCHING. Following STOPPED, QUIT ACK is followed by *actual* local cooperative ORT/Lc0 teardown. Only after local worker counts reach zero does the engine send CLEANUP. The broker requires parent=0, pthread=0, `runtimeState=TERMINATED`, `cleanupAcknowledged=true` and forced=0 before CLEANED/release. No successful path uses the emergency force-termination fallback. Emergency force termination is retained for a genuinely crashed/unresponsive worker and is reported separately, never presented as a certified normal cleanup.

## Reconnect and failure policy

- Idle engine stream reconnect recovers the same runtime instance with a new lease epoch and stored cursor, without a second claim.
- On stream loss during a search, the engine stops locally and treats the transport as uncertain. After reconnect it reconciles the same search ID and awaits the relay STOP. It never blindly repeats GO or emits a duplicate BESTMOVE. This policy passed live.
- Main stream cursor recovery passed both via a fresh authenticated SSE consumer and an actual preview-page reload: the page re-verified identity, recovered cursor 3, received the subsequent BESTMOVE, and advanced to cursor 18. The browser test replaced only the interactive sign-in widget; its API calls used a real Clerk-issued test-user JWT. It explicitly released the first stream lease before reload.
- Wrong-network bytes failed closed before READY with zero workers and zero forced kills. Worker-script load failure failed closed with zero remaining workers; emergency fallback was exercised. A deliberate post-READY worker crash failed closed and required emergency forced termination. Claim expiry rejected before artifact requests. QUIT during SEARCHING returned 409 and then a normal STOP/QUIT cleaned cooperatively. Suppressing the real stop signal caused local timeout and broker `STOP_RESULT_TIMEOUT`/session expiry rather than a fabricated BESTMOVE or STOPPED event. A staging state-store interruption was injected in broker tests; no live production store fault was induced.

Only relay truth is stored durably: owner, competition/role, hashed capabilities, sequence/search/ACK state, lease/terminal state, bounded event journal and identity summary. WASM, network bytes, worker state, full stdout and high-frequency PV history stay in the browser.

## Certification evidence and limits

- 20/20 sequential legal node-bounded searches reused one real runtime (20 raw/20 normalized INFO, 20 main BESTMOVE events); 20/20 active infinite-search STOP cycles passed over the relay without normal forced termination (117 raw/51 normalized INFO, 20 main BESTMOVE events, median/p95 STOP→STOPPED 1,073/1,340 ms). Both final runs ended with zero workers and forced kills. Control completed under INFO traffic.
- 20/20 independent full lifecycles passed on the preview: create, claim, initialize, READY, POSITION, active GO, STOP, legal BESTMOVE, QUIT, CLEANUP and termination. Each successful cleanup had zero parent/pthread workers and zero forced terminations. The final complete sweep was against EAE-012 preview commit `60d462ce6c717218f76557b7477d893e7ce9aa53` (runtime and main UI code unchanged by subsequent test/documentation-only commits). An earlier preliminary sweep had 14 clean runs then one wait for CLEANED failed; the harness discarded that sample and did not capture enough detail to attribute its cause. One standalone retry and the new 20/20 sweep passed. This preview tail anomaly remains a reliability follow-up, not a claimed success.
- Two real Lc0 sessions ran concurrently for 11.243 seconds in the final preview check. Each peaked at five workers (ten total); both cleaned to zero with no forced termination. Ten-session real-engine stress was intentionally not attempted. The working assumption remains one Lc0 per future competition.
- The 120-second hard session TTL remains. Current single and repeated spike flows fit, but a real Tournament needs a substantially longer lease with explicit liveness, crash expiry and resource budgeting. A candidate starting point is 10–15 minutes per game/renewable session, subject to measured mobile and desktop search/idle behavior; this is **not** implemented here. Mobile remains unsupported/untested.
- Current Engine Registry and ArenaRuntimeManager tests (44), lab contracts (4), broker contracts (15), plus all five Generation Cup Chromium browser scenarios passed. No Lc0 provider, Match/Tournament choice, navigation entry or production asset path was added. Production aliases, global COOP/COEP and production Supabase were untouched. A live HEAD check of `www.caissa-chess.org` still returned COOP `same-origin-allow-popups` and no COEP. The staging relay table finished at zero total rows and zero unexpired rows.

### Latency and traffic

Measurements are preview, not production SLA. `create`, ACK, STOP→STOPPED and QUIT→CLEANUP include network/relay transport and polling. `claim`, artifact verification, runtime initialization, GO→local BESTMOVE, STOP→local BESTMOVE and local cleanup are engine-page measurements; they must not be conflated with the end-to-end columns. Values below are median/p95 in milliseconds from the successful 20-fresh-lifecycle sweep, nearest millisecond. p95 is the 19th sorted sample of 20 (nearest-rank). INFO and BESTMOVE propagation are measured separately by browser-emitted and main-received timestamps; INFO had 31 observed samples, BESTMOVE 20. Raw Lc0 INFO lines across these runs numbered 110; 32 normalized INFO messages were sent and the relay journal coalesced further.

| Metric | Median | p95 |
| --- | ---: | ---: |
| Session create | 208 | 982 |
| Engine claim | 120 | 356 |
| Artifact verification | 818 | 1,061 |
| Runtime initialization | 2,545 | 4,360 |
| HELLO→verified READY | 805 | 1,243 |
| POSITION→ACK | 557 | 934 |
| GO→ACK | 678 | 982 |
| GO→local BESTMOVE | 1,816 | 1,924 |
| STOP→local BESTMOVE | 430 | 538 |
| STOP→relay STOPPED | 1,214 | 1,333 |
| INFO propagation | 279 | 453 |
| BESTMOVE propagation | 280 | 389 |
| QUIT→local cleanup | 90 | 129 |
| QUIT→relay CLEANUP | 749 | 1,090 |

## Production blockers and stop line

This certifies only a protected preview spike. Production integration requires an Arena provider design, competition ownership/lifetime model beyond 120 seconds, cross-device/mobile resource testing, explicit desktop concurrency budget, robust recovery after tab/process death, authorization review, licensing/asset delivery review, production-compatible isolation deployment strategy and a separate promotion approval. Do not merge this branch to `main`, move prior certification tags, change production headers or aliases, or deploy Lc0 to production as part of EAE-012.
