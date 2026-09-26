# CAISSA Engine Arena — Lc0 Dormant Analyzer Reserve

Status: `LC0_ARENA_RETIRED_DORMANT`

Effective product state:

- Engine Arena release stage: `DISABLED`
- Engine Arena mode: `DISABLED`
- Standard Arena participation: disabled
- Infrastructure disposition: preserved, dormant
- Future owner: `caissa-analyzer-future`

## Product decision

Lc0 — Maia 1100 completed its technical, reliability, compliance, and public
Experimental Beta certification. Its browser CPU/WASM runtime is materially
slower and more resource-intensive than the Stockfish providers for
clock-sensitive engine-versus-engine play. It is therefore retired from Match
and Tournament discovery in Engine Arena.

This is a product-surface retirement, not a technical rollback and not an
infrastructure deletion. The certified pipeline is retained for workloads that
fit its characteristics: deep position analysis, long think times, comparison
with Stockfish evaluations, Maia-style human-like analysis, and future Engine
Lab research.

## Certified technical baseline

- Runtime generation: `tc1r1`
- Deployment manifest SHA-256:
  `9980a755a44b3d704f70505a803b6dd112c97a39853260bc648499b5bed4fd45`
- Browser client SHA-256:
  `61555ff04e76ea804940f728552188905e9e544f3109368ca2878ca26b0f8809`
- Maia 1100 SHA-256:
  `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`
- Corresponding-source release: `lc0-browser-source-v0.1.3`
- Historical product release tag: `lc0-experimental-beta-v1`

These identifiers remain immutable provenance. Earlier certification tags,
branches, source archives, and release records must not be moved or deleted.

## Preserved infrastructure

The following remain intact and are not loaded by an ordinary Arena visit:

- isolated Lc0 runtime project and its runtime assets;
- relay project, authentication boundary, and durable lifecycle broker;
- Lc0 WASM, worker, Maia 1100 network, and ONNX Runtime assets;
- manifest and runtime-identity verification;
- STOP/CLEANUP lifecycle, cleanup cron, and observability;
- Supabase relay/session tables and policies;
- kill switch and protected environment configuration;
- corresponding-source bundle, third-party notices, legal sign-off, and all
  other compliance evidence.

No Vercel project, Supabase object, credential, source release, or certified
artifact is removed by EAE-020.

## Engine Arena boundary

The Lc0 provider implementation remains in source with:

- `supportsStandardArena = false`
- `productOwner = "caissa-analyzer-future"`
- `status = "dormant"`

Engine Arena does not render the Experimental Engines control or consent UI,
does not register the provider, and does not load the rollout controller.
Consequently, ordinary Match and Tournament setup expose only the four standard
Stockfish providers and make no Lc0 eligibility, relay, runtime, WASM, ORT, Maia,
or dedicated-window requests.

`/api/eae016` remains a healthy, fail-closed control-plane endpoint and reports
the Arena product state as `releaseStage=DISABLED`, `mode=DISABLED`, and
`productStatus=LC0_ARENA_RETIRED_DORMANT`. Protected engineering observability
and the independent runtime/relay health surfaces remain available.

## Reactivation prerequisites

Lc0 must not be reactivated by changing an existing rollout variable alone.
Any reuse requires a new explicit product task, suggested as:

> CAISSA Analyzer — Lc0 Deep Analysis Integration

That task may reuse the certified runtime, relay, Maia network, cleanup,
compliance, and provenance, but must define and certify:

1. a new Analyzer-owned UX and product gate;
2. long-running/non-clock-critical workload assumptions and resource limits;
3. authorization, privacy, abuse, and concurrency policy;
4. lifecycle and cleanup behavior in the Analyzer context;
5. current manifest and corresponding-source verification;
6. browser/mobile support and failure messaging;
7. preview certification followed by a separately authorized production release.

Until those prerequisites are satisfied, the only authorized state is
`LC0_ARENA_RETIRED_DORMANT`.
