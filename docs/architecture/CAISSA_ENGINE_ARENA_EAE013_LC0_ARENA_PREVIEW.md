# EAE-013 — isolated Lc0 Arena preview integration

This checkpoint starts from EAE-012 commit `cab919f0f009d9d409739d92fb1c35256416ca8e` and the annotated remote tag `engine-arena-expansion-eae012-real-relay-certified` (peeled to that exact commit). Work is isolated on `experiment/lc0-eae013-arena-preview-integration`. No production merge, production deployment, `www.caissa-chess.org` header change, or production Arena provider registration is part of this phase.

## Architecture and provider

The normal `EngineRegistry` and `ArenaRuntimeManager` remain the owners of provider selection and white/black/evaluator role lifecycle. The preview route `/arena-preview` resolves to the existing Arena section, board, Match, Tournament and Game tab. A branch-scoped `/api/eae013` gate must return `enabled` before the UI registers `lc0-maia-1100-preview`. The gate requires Vercel preview, the exact EAE-013 Git branch, `EAE013_ARENA_PREVIEW=1`, and distinct HTTPS main and isolated `.vercel.app` origins. Normal `/arena` does not register Lc0. The generic registry list used by production engines is unchanged.

The preview provider is displayed as “Lc0 — Maia 1100 (Experimental)”, class neural, transport isolated-browser-relay, backend CPU/WASM, desktop-only, requiring an isolated origin. Its adapter binds the EAE-012 pinned Lc0 version `v0.33.0-dev+git.482bb4a`, source `482bb4a830287b726ebe7d42f14ab7f5f17c18a0`, UCI name, author, CPU/WASM backend, CSSLab Maia 1100 v1.0 network SHA-256 `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`, manifest SHA-256 and ephemeral runtime instance ID. READY is rejected if any pinned field changes.

The adapter obtains a real short-lived Clerk owner bearer token for the main-origin relay. The isolated engine page receives a one-use claim in the URL fragment, validates pinned assets, starts the real Lc0 WASM worker/pthreads, and communicates only through the durable authenticated relay. The popup is created in a keyboard-accessible button click, then navigated one way; no `window.opener` communication, transferred port or shared auth cookie is used after navigation. A blocked popup is reported in the live status region.

The existing Stockfish evaluator remains the evaluator. Lc0 INFO is separately labeled and capped at four presentations per second; it is not substituted for Game-tab Stockfish evaluation. Lc0 and Stockfish players use the same chess.js board, legal-move application, SAN history, PV SAN evaluation formatting, LED and graph presentation. Lc0-vs-Lc0 is rejected; Tournament selection contains at most one Lc0 provider. Mobile widths at or below 1050px do not register Lc0 in the preview UI, and the registry returns an explicit desktop-only availability reason.

## Runtime Manager mapping

`acquire` constructs the preview adapter through `EngineRegistry` and waits for relay CLAIMED, HELLO/READY, and strict identity verification. `newGame` waits for acknowledged STOP if needed; reuse sends RESET with `newGame: true`, causing `ucinewgame` in the real engine client, waits for READY and the broker's reuse gate. Search sends one POSITION and one GO per random search ID. Search callbacks are bound to a game ID, role and requested FEN; stale BESTMOVE/INFO is ignored. The adapter validates BESTMOVE as a legal chess.js move in the requested position, while the Arena controller rechecks the current board FEN and legal application before recording it. No Stockfish fallback occurs.

`stop` waits for STOP ACK and matching BESTMOVE/STOPPED before `ArenaRuntimeManager` transitions to IDLE. `terminate` stops an active search, sends QUIT, waits for ACK and the actual CLEANUP event, validates zero parent/pthread workers, zero forced kills and cooperative acknowledgement, then releases and deletes the relay session. The manager does not mark TERMINATED before adapter cleanup resolves. A pause cannot resume while its STOP is pending, and a new Match waits for any prior termination promise.

The prior EAE-012 CLEANED tail-event observation is distinguished in adapter metrics: `DURABLE_CLEANED_BUT_TAIL_EVENT_MISSING`, `LOCAL_CLEANUP_NOT_ACKNOWLEDGED`, another durable phase, or `DURABLE_STATE_UNAVAILABLE`. A durable CLEANED flag without the CLEANUP evidence event is **not** counted as a certified cleanup. Selection-to-READY, start-to-first-search, STOP and cleanup timings are recorded. The preview status uses `role=status` and `aria-live=polite` so multi-second initialization is visible.

## Preview boundaries and evidence

The staging relay store is Supabase project `aqizagaskicotorfpwfn`; its service-role key is set only in this Vercel preview branch's environment. The two EAE-013 aliases point to the same immutable preview deployment but serve distinct origins. The isolated engine path retains the EAE-012 COOP/COEP/CORP and worker/WASM CSP; normal site and production headers are unchanged. The branch-gated configuration and normal registry absence are covered by `tests/arena-lc0-preview-gate.test.js`; acknowledged async STOP and cleanup ownership by `tests/arena-lc0-async-lifecycle.test.js`; broker READY QUIT and new-game RESET by `experiments/lc0-preview-relay/tests/durable-broker.test.mjs`.

The live browser probe is `experiments/lc0-arena-preview/tests/live-preview.mjs`. It requires an explicit opt-in, a protected-preview bypass secret, and a Clerk test key supplied only through process environment. It creates and deletes a temporary Clerk test user, drives real Arena Match controls and the isolated engine page, checks both colors, legal moves, pause/resume, cooperative cleanup, zero workers/pthreads/forced kills, zero Arena records, and relay session deletion. A failed cycle is recorded and stops the run; no later retry can hide it.

## Results and certification boundary

Initial immutable preview deployment: `dpl_3RPKTFywYfdQrdpWcA3PaD1gDWAj`. Routing-corrected deployment: `dpl_EFGVhSkxjaBc17U9gS3VCYfnbkZu`. Both are Preview, not Production. The `/api/eae013` gate returned the expected provider configuration on the main EAE-013 alias, and the engine alias returned a healthy preview relay response. The existing four-engine Generation Cup browser regression passed 5/5 Chromium tests, including mobile and tournament paths. The provider, runtime and broker unit suites passed locally.

Real Match, Tournament, 50-cycle soak, window-close, network interruption, Axe, cleanup-row and latency certification results must be appended from actual evidence. Until those complete, the only honest outcome is `LC0_ARENA_PREVIEW_PARTIAL`.
