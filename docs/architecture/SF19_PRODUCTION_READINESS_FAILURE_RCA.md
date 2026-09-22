# Stockfish 19 production readiness failure RCA

Status: corrected and certified on an immutable Vercel preview; production promotion is not authorized by RELEASE-A-RCA-001.

## Incident

The SF18/SF19 release at Git SHA `6678adf04b785e5cde49b3b4e15e4c2936feb7c6` was deployed as `dpl_DLqM1Es9juxrTLFvRLCEK9vSUc7W` at:

`https://tv-lavin-chess-game2-qm1du494q-elcriollitos-projects.vercel.app`

The production smoke used Playwright 1.62.0 with Chromium `151.0.7922.34`. Its preserved failure artifact was last written at `2026-09-22T19:09:11Z`. The four-engine Generation Cup stopped in round 1 with SF19 disabled and the visible reason `The chess engine did not become ready in time.` Production was rolled back to deployment `dpl_DLzX1GyQBStY1Af16MkG6ZmYAA6P`, source SHA `a6473ce0269dc78628de86b010f15a2667db8fcf`.

The failed deployment remains available for inspection.

## Exact failed stage

The message came from `EngineAdapter.armHandshakeDeadline()`. The adapter started one 4,000 ms timer in phase `awaiting-uciok` immediately before sending `uci`. The failed snapshot had no reported UCI name or author, so identity validation and the later `isready`/`readyok` phase had not begun.

An authenticated direct-worker reproduction on the failed immutable deployment produced:

1. Worker constructed and `uci` sent.
2. The SF19 JS and WASM requests succeeded.
3. Chromium rejected `WebAssembly.instantiateStreaming()` with: `Compiling or instantiating WebAssembly module violates ... Content Security Policy ... 'unsafe-eval' is not an allowed source of script`.
4. The worker raised a page error and emitted no UCI line.
5. The adapter remained in `awaiting-uciok` until its 4,000 ms deadline fired.

This was an **uciok timeout caused by a CSP-blocked WASM compile**, not a worker-construction, identity, or `readyok` timeout.

## Failed deployment asset evidence

Both assets were fetched through an authenticated Vercel session from the failed immutable deployment. Neither request redirected, and both byte hashes match the certified local assets.

| Asset | HTTP | Content-Type | Declared/downloaded bytes | Cache-Control | Content-Encoding | SHA-256 |
|---|---:|---|---:|---|---|---|
| `stockfish-19-lite-single.js` | 200 | `application/javascript; charset=utf-8` | 21,415 / 21,415 | `public, max-age=0, must-revalidate` | none | `d3344124ab067fb0b90ee77873bb8e9fbf5fc01bc525fe714b0f942581e889e6` |
| `stockfish-19-lite-single.wasm` | 200 | `application/wasm` | 1,787,571 / 1,787,571 | `public, max-age=0, must-revalidate` | none | `57ac2d72312aba346760e3f173f687a8c211208e97a87268436f7f0e10bb5387` |

The JS/WASM pair was therefore present, same-version, uncorrupted, correctly typed, and reachable at the configured URLs. Hard-reload and clean-context runs used the same versioned paths and hashes. There was no asset-integrity or CDN version-skew failure.

## Root cause

`vercel.json` already assigned the Stockfish 18 versioned asset route a worker-specific policy containing:

`script-src 'self' 'wasm-unsafe-eval'`

No equivalent route existed for `/assets/vendor/stockfish/19.0.0/:path*`. SF19's worker script therefore inherited the global response CSP, whose `script-src` omitted `'wasm-unsafe-eval'`. A dedicated worker is governed by the policy delivered with its worker script. Chromium consequently blocked SF19's streaming WASM compilation.

The production/local difference is deterministic:

- The local Node server did not deliver the Vercel worker CSP, so SF19 initialized normally.
- Vercel delivered the global CSP on the SF19 worker, so the compile was blocked.
- On the same failed deployment and browser, SF18 reached `uciok` and `readyok` in 704 ms because its worker response had the existing scoped WASM policy. SF19 produced zero lines and the CSP exception.

SF19's loader infers its WASM URL from `self.location`, replacing its `.js` suffix with `.wasm`. The resolved request was the correct same-origin versioned path. SF19 uses a custom `instantiateWasm` path that fetches the WASM and calls `WebAssembly.instantiateStreaming()`. SF18 also supports streaming compilation, with an ArrayBuffer fallback in its generated loader. Neither path nor MIME was defective; the missing SF19 worker response policy was causal.

## Correction

The correction adds an asset-specific header rule for `/assets/vendor/stockfish/19.0.0/:path*` matching the already-certified SF18 rule:

- `script-src 'self' 'wasm-unsafe-eval'`
- `connect-src 'self'`
- `worker-src 'self'`
- `object-src 'none'`
- `base-uri 'none'`
- `form-action 'none'`
- `frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- versioned-asset cache policy `public, max-age=86400`

The global CSP was not broadened. Generic `'unsafe-eval'` was not granted. COOP/COEP, engine identity validation, Runtime Manager behavior, SF18 runtime code, engine assets, package versions, and `package-lock.json` were unchanged. The 4,000 ms handshake deadline was also unchanged because corrected production-like measurements are well inside it.

## Corrected boot trace

The first recorded cold-ish direct-worker run on the immutable preview was:

| Event | Time from selection |
|---|---:|
| provider selected | 0.0 ms |
| worker constructed | 0.3 ms |
| `uci` sent | 0.3 ms |
| `id name Stockfish 19 Lite WASM` | 261.6 ms |
| `id author ...` | 261.6 ms |
| `uciok` / identity accepted | 262.1 ms |
| `isready` sent | 262.1 ms |
| `readyok` / provider READY | 262.2 ms |

The JS worker request and WASM request both completed with HTTP 200. The WASM response was `application/wasm`; compilation and runtime initialization completed before the first identity line. No `worker.onerror`, `messageerror`, stderr exception, fetch rejection, or timeout occurred.

## Startup timing

Measurements used the immutable Vercel preview in Playwright Chromium `151.0.7922.34`. Cold-ish runs used a fresh browser context and empty context cache for every iteration. Warm runs reused one authenticated context after an uncounted warm-up. The Vercel CDN itself was warm, so these results do not claim a globally cold edge.

| Cohort / interval | Median | p95 | Maximum | Failures |
|---|---:|---:|---:|---:|
| 20 cold-ish: worker create to `uciok` | 258.3 ms | 327.4 ms | 343.1 ms | 0 |
| 20 cold-ish: `uciok` to `readyok` | 0.2 ms | 0.4 ms | 0.6 ms | 0 |
| 20 cold-ish: total acquire | 258.5 ms | 327.6 ms | 343.7 ms | 0 |
| 20 warm: worker create to `uciok` | 117.4 ms | 163.2 ms | 193.7 ms | 0 |
| 20 warm: `uciok` to `readyok` | 0.2 ms | 0.4 ms | 0.7 ms | 0 |
| 20 warm: total acquire | 117.5 ms | 163.5 ms | 194.1 ms | 0 |

Ten additional full `EngineAdapter` SF19 cycles on `/arena` passed 10/10 with zero failures. Their total initialization samples were 382.2, 267.1, 280.1, 231.2, 250.0, 231.2, 238.4, 259.3, 286.1, and 239.5 ms. Every cycle reported the exact configured UCI identity and terminated cleanly.

## Immutable-preview certification

Candidate:

- Deployment: `dpl_2mJAgiYZ3T3J5BWtp4WsSZJff7NG`
- URL: `https://tv-lavin-chess-game2-3mzp6ungc-elcriollitos-projects.vercel.app`
- Git SHA: `33765e1617dc5e2524e7494b94a21605823635f7`
- Vercel state: `READY`, preview target, source branch `hotfix/engine-arena-sf19-production-readiness`

Corrected asset evidence on that deployment:

| Asset | HTTP / redirects | MIME | Downloaded bytes | Encoding | Cache | SHA-256 |
|---|---|---|---:|---|---|---|
| SF19 JS | 200 / 0 | `application/javascript; charset=utf-8` | 21,415 | `br` | `public, max-age=86400` | `d3344124ab067fb0b90ee77873bb8e9fbf5fc01bc525fe714b0f942581e889e6` |
| SF19 WASM | 200 / 0 | `application/wasm` | 1,787,571 | `br` | `public, max-age=86400` | `57ac2d72312aba346760e3f173f687a8c211208e97a87268436f7f0e10bb5387` |

Both responses carried the scoped SF19 worker CSP. The direct deployed CSP/handshake harness passed 2/2. The exact Generation Cup smoke that failed in production completed all six pairings truthfully in 34.1 seconds.

## Regression

- Arena targeted units: 46/46 passed.
- Complete local Arena Chromium collection: 55/55 executed tests passed; one immutable-deployment header assertion was intentionally skipped on localhost.
- Immutable preview SF19 suite: all 15 cases passed (14 in the full run and the authorization-sensitive fail-closed injection on its targeted rerun).
- Required matchups passed: SF19 vs SF18, SF18 vs SF19, SF19 vs SF19, SF19 vs Stockfish 2019 MV, and the reverse legacy pairing.
- Tournament passed with Stockfish 2019 MV, SF18 Lite, and SF19 Lite; Generation Cup additionally exercised all four provider profiles and all six pairings.
- SAN, PV SAN, evaluation, graph, pause, resume, stop, draw adjudication, standings, worker identity, cleanup, bounded ownership, anti-jitter, accessibility, tablet, mobile portrait, and mobile landscape checks passed.
- Fail-closed tests confirmed SF19 remains unavailable on an injected SF19 failure without fallback, relabeling, or impact to SF18/legacy availability.

The authenticated preview page also created unrelated `blob:` workers. Existing page-wide worker counters were narrowed to the approved Arena worker URLs so those services do not create false Arena ownership peaks. Runtime Manager assertions remained unchanged and continued to prove three owned Arena roles and complete cleanup.

## Remaining risks

- Cold-ish timing covers clean browser contexts against a warm CDN edge from one test location, not every geographic edge or device class.
- The 4,000 ms deadline is approximately 11.6 times the observed 343.7 ms cold-ish maximum, but the adapter still has no automatic retry by design and remains fail-closed.
- Correctness depends on preserving the versioned SF19 route-specific CSP. Unit and immutable-response tests now guard that contract.
- Production has not received this fix in this task. It remains intentionally rolled back pending explicit release authorization.
