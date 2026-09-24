# CAISSA Engine Arena EAE-016 — Experimental Opt-In Rollout

## Scope and immutable provenance

EAE-016 integrates the certified Lc0 limited-production RC into the public Engine Arena without redesigning the runtime. The integration branch is `feature/lc0-eae016-experimental-optin`, based on public main `1d2f05e1d4214e3a9e067e0e16199f20f29feca2`. The certified source is `daf3404fbfaf9401783875626bb7eed403c0d9c4`, archived by `archive/lc0-limited-production-certified` and tag `lc0-limited-production-rc1`.

The two manifest values have distinct meanings and are intentionally both pinned:

- corresponding-source/build manifest: `492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f`
- deployed RC1 release manifest (`eae015b2-lc0-0.33.0-maia1100-r3`): `648daa880e131ebe0b83784b68ce63abb50eee571c0328158cc8a94a7f444d3d`
- Maia 1100 network: `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`
- corresponding-source archive: `lc0-browser-source-v0.1.1`, SHA-256 `7d0a514f6f212a2d151bb340708d485670fba0ee338145e63f5cc8db46f731ec`

Runtime-sensitive imported Git blobs are compared to the certified RC commit. Rollout-only changes are confined to product UI, server-authoritative cohort policy, telemetry, configuration, development fallback, and documentation. Lc0 source, lifecycle patches, WASM/worker runtime, Maia network, ORT, asset manifest, STOP, Pause/Resume, transport reconciliation, cleanup, and relay lifecycle behavior remain frozen.

The Stage 2 origin set is `https://www.caissa-chess.org`, `https://caissa-lc0-relay-eae015a.vercel.app`, and `https://caissa-lc0-runtime-eae015a.vercel.app`. The runtime appliance changes only its root-document origin metadata and CSP; every manifest-listed artifact remains byte-identical to RC1.

## Public integration and UX

The normal Arena registry contains only the existing Stockfish providers. An `Experimental Engines` control appears only after the server reports an eligible user and the desktop browser capability gate passes. The panel identifies the participant truthfully as `Lc0 — Maia 1100`, with `Experimental`, `CPU/WASM`, and `Desktop browser` details plus a source/licenses link.

The first enable attempt shows the required consent dialog. Only the preference is stored locally; local storage grants no authority. Disable unregisters the provider at an idle boundary. During a running or paused game the user is asked to stop the game first.

Unsupported users receive no control and no Lc0 adapter/runtime/network requests. Supported browsers are desktop Chrome and desktop Edge. Firefox, Safari, iOS, Android, and mobile browsers are rejected before adapter loading.

User-facing failures are deliberately non-technical. Relay codes, JWT details, database errors, `SESSION_GONE`, and cleanup classifications are not displayed. Lc0 failure never substitutes a Stockfish runtime.

## Capability and authority gates

Availability requires all of the following:

1. `EAE016_PUBLIC_ROLLOUT=1` and production-candidate/production-shape guards.
2. A recognized release stage.
3. The independent database control mode `ENABLED`.
4. An authenticated Clerk subject.
5. Server-side internal or canary cohort membership where required.
6. Exact main, relay, and engine origins.
7. Runtime health with deployed manifest `648daa…`.
8. Relay health with a matching release stage and production shape.
9. Client capability support and explicit consent.
10. Exact source and deployment manifest pins in the public controller.

The client cannot widen eligibility. The relay repeats authentication and cohort enforcement when a session is created. Existing broker limits retain one active Lc0 session per user, bounded create/command/INFO rates, one Lc0 participant per Arena competition, and no Lc0-vs-Lc0. The evaluator remains Stockfish.

The main rollout gateway asks the relay for the current subject's eligibility. Internal and canary identifiers therefore remain in one server-side allowlist on the relay and are neither duplicated to main nor returned to the browser.

Unknown release states normalize to `DISABLED`.

## Release states

- `DISABLED`: no new Lc0 access; normal Arena remains available.
- `INTERNAL_ONLY`: only the certified internal allowlist may opt in.
- `CANARY_OPT_IN`: internal users plus the bounded `EAE016_CANARY_USER_IDS` cohort may opt in.
- `EXPERIMENTAL_OPT_IN`: all authenticated, supported desktop users may opt in. This state is prepared but is not authorized by EAE-016.
- `DRAINING`: denies new sessions while bounded cleanup finishes.

The database control mode is an independent kill switch. It can move an enabled stage to `DRAINING` and then `DISABLED` without a main-site deployment.

## Lazy loading and performance

The public page loads only the small rollout controller. The certified Arena adapter is dynamically loaded after server eligibility, browser capability, and explicit consent. The dedicated runtime window and approximately 24.8 MB runtime/network payload are opened only on actual Lc0 use. The normal Stockfish path never imports the Lc0 WASM or Maia network.

The experimental panel is an overlay anchored to the Arena header and does not resize the board/panel grid. Mobile CSS removes the control, while the JavaScript capability gate prevents initialization independently of presentation.

## Initialization and companion window

The product reports `Starting Lc0…`, `Loading engine…`, `Loading Maia 1100…`, and `Ready` from real lifecycle transitions. It does not synthesize percentage progress. The existing certified one-way companion-window handoff remains unchanged. Popup failure is reported once and requires a new user gesture; no popup loop is used.

Closing or losing the runtime invokes the certified failure/cleanup policy. The Arena does not fabricate a move or result and does not replace Lc0 with Stockfish.

## Telemetry and internal dashboard

Required product events are allowlisted server-side: opt-in viewed/enabled/disabled, selector visible, session requested/created, READY, initialization failed, popup blocked, unsupported browser, match started/completed, and user abort. Rollout glue additionally records STOP completion, cleanup completion/failure, and transport failure latencies without changing lifecycle behavior.

The browser payload contains only an event name and optional bounded latency. The server derives a keyed HMAC actor token; raw user identifiers are never sent by the browser or stored in rollout telemetry. The event endpoint is limited to 60 accepted events per actor per minute. Actor-event and latency samples expire after 30 days.

`GET /api/eae016?view=dashboard&minutes=N` is restricted to the internal allowlist and returns aggregate data only:

- distinct eligible actors;
- opt-ins, sessions, READY successes, completed games, and initialization failures;
- cleanup and transport failures and forced kills;
- median and p95 READY, STOP, and cleanup latency.

Existing operational metrics remain authoritative for `SESSION_GONE`, STOP timeout, forced termination, worker/network failure, reconnect, cleanup, relay errors, rate/auth/origin rejection, database I/O, and live session count. The six certified high-severity alerts remain unchanged.

## Stage 2A

Stage 2A may begin only after production main is deployed with `DISABLED`, the public Stockfish Arena is verified, migrations are applied, the relay is browser-reachable, and the exact manifest is healthy. Then both main and relay move to `INTERNAL_ONLY` for the certified internal user.

The representative public-path run is:

1. Lc0 White vs SF19.
2. SF19 White vs Lc0.
3. One SF18/SF19/Lc0 Tournament.
4. One Pause/Resume and one explicit STOP.
5. Normal completion and cleanup with zero Arena errors, forced termination, active session residue, or relay rows.

No 50-cycle runtime recertification is required because certified runtime blobs are unchanged.

## Stage 2B

Stage 2B requires a non-empty, owner-approved, bounded `EAE016_CANARY_USER_IDS` cohort of approximately 5–10 external opted-in users. Before enabling `CANARY_OPT_IN`, all six alerts, cleanup cron, zero stale sessions, exact manifest, kill switch, and rollback path must be verified.

The target evidence is at least ten complete independent external/canary sessions with zero correctness failures, orphan workers/pthreads, normal-play forced termination, or relay residue. If that evidence is unavailable, the truthful verdict is partial and the final state remains `DISABLED`.

## Alerts and stop conditions

Any unexplained `SESSION_GONE`, repeated STOP timeout, confirmed orphan worker/pthread, integrity mismatch, auth bypass, cross-user access, material cleanup failure, repeated non-injected forced termination, or runtime identity mismatch requires:

1. release state/control mode to `DRAINING`;
2. denial of new Lc0 sessions;
3. bounded cooperative cleanup;
4. release state/control mode to `DISABLED`;
5. zero-session/zero-row verification.

Popup blocks, unsupported browsers, and user-closed windows are tracked as softer product signals unless their frequency indicates a broader defect.

## Rollback

The operational rollback does not require rolling back public main:

1. Set release stage and database control from `CANARY_OPT_IN` or `EXPERIMENTAL_OPT_IN` to `DRAINING`.
2. Confirm new session creation is denied.
3. Allow the certified bounded cleanup/lease policy to finish.
4. Set both controls to `DISABLED`.
5. Verify zero active sessions, zero relay rows, and normal Stockfish Arena operation.
6. If a code rollback is independently required, restore main from `backup/main-pre-lc0-stage2` and roll back the relay/runtime projects independently.
7. Only after zero sessions, a reviewed database rollback may apply `supabase/rollback/20260924010000_eae016_rollout_metrics_rollback.sql`; the certified EAE-015B schema rollback remains a separate destructive operation.

Historical refs `archive/lc0-limited-production-certified`, `lc0-limited-production-rc1`, and `lc0-eae015b-stage1-blocked` remain immutable.

## Stage 2C recommendation

EAE-016 prepares but never enables `EXPERIMENTAL_OPT_IN`. Stage 2C requires Alexander's explicit approval after complete Stage 2B real-user evidence. A successful deployment or internal test is not sufficient authorization.

## Certification record

The integration, deployment, Stage 2A, Stage 2B, performance, operations, security, Stockfish regression, rollback verification, final state, and verdict are recorded in the final EAE-016 report. Until real public-path and external-canary evidence exists, the release must not be described as Stage 2 canary certified.
