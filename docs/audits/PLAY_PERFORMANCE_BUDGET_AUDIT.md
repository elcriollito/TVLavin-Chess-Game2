# Simplified Play Performance Budget Audit

Audit version: 1.0.0
Baseline date: 2026-07-30

## Ownership and measurement boundary

`CaissaPlayPerformanceBudget` owns fixed metric definitions, evaluation, and bounded diagnostics. `CaissaPlayPerformanceProbe` observes browser timing, resources, DOM, and existing lifecycle diagnostics. Neither module owns routes, board state, game state, engine strength, Worker lifecycle, lazy-load lifecycle, FairPlay, persistence, provider state, telemetry, or release decisions.

## Measured environment

The committed baseline is a local lab measurement on Windows, Playwright Chromium 151.0.7922.34, headless, unthrottled CPU/network, device scale 1, local server, cold page context. Desktop was 1440×900 and mobile was 390×844. Results are not production field claims and must not be compared with an incompatible environment without labeling.

## Baseline matrix

| Metric | Desktop | Mobile | Source | Reliability | Risk |
|---|---:|---:|---|---|---|
| Board/interaction/Quick Play ready | 4,132 ms | 967 ms | navigation plus visible usable board | local-lab | environment variance |
| Initial scripts | 85 / 1,594,427 bytes | same | Resource Timing | local-lab | high startup weight |
| Stylesheets | 19 / 488,028 bytes | same | Resource Timing | local-lab | medium |
| Images | 12 / 28,127 bytes | same | Resource Timing | local-lab | low |
| DOM nodes | 5,572 | 5,572 | DOM count | high | high |
| Lifecycle listeners | 5 | 5 | EventLifecycle diagnostics | high | low |
| Timers / observers | 0 / 0 | 0 / 0 | EventLifecycle diagnostics | high | low |
| Boards / live regions | 1 / 2 | 1 / 2 | DOM invariants | high | release blocker |
| JS heap | unsupported | unsupported | Chromium exposed only a coarse value | unsupported | profiling pending |

Timing target equals the measured compatible-environment baseline; warning is 125% and fail is 175%. These margins disclose local variance rather than asserting field performance. Unsupported metrics have null thresholds and cannot pass. Deterministic correctness budgets fail immediately for board count other than one, Play Worker count other than one when active, listener growth, timer/observer leaks, or live-region count other than two.

## Deferred and action measurements

Bots, Coach, Players, Mentor, Analyze, PostGame, engine initialization, stop, and restart retain their existing observable lifecycle APIs. Cold/cached values must be recorded by the benchmark harness in a compatible run; absent measurements remain unsupported rather than receiving invented thresholds. Lazy load failures and the single bounded retry remain functional failures, not performance passes.

## Long tasks, layout shift, memory, and field data

The probe uses `PerformanceObserver` only when the browser supports `longtask` or `layout-shift`. Unsupported engines report unsupported. Heap is a proxy only when a precise browser API exists. There is no telemetry upload, persistent profiling data, PII, or field-data claim.

## Release blockers

Functional regression, accessibility regression, more than one board, more than one Play Worker, positive listener growth, surviving scoped timers/observers, duplicate scripts, or an unsupported metric mislabeled as passing blocks readiness. Simplified Play remains QA-only; Legacy Play and Classic defaults are unchanged.
