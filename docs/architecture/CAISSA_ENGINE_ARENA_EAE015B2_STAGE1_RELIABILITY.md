# CAISSA Engine Arena — EAE-015B.2 Stage 1 reliability

Date: 2026-09-23

Verdict: `LC0_STAGE1_RELIABILITY_CERTIFIED`

Final release stage: `DISABLED`

Stage 2: not authorized and not enabled.

## Scope and checkpoints

This remediation fixes only the two EAE-015B Stage 1 reliability blockers:

1. Pause followed by Resume could accept a legal Lc0 move and then terminate
   the Match as `arena-error`.
2. A suspended browser/relay stream could prevent truthful cooperative cleanup,
   force termination, and leave pthread workers visible at the failure snapshot.

The authoritative blocked checkpoint remains preserved by the annotated remote
tag `lc0-eae015b-stage1-blocked`, whose peeled target is exactly
`87c6808ed6ba6a60c4c72b01d5186972ba5d070a`.

The remediation branch is `hotfix/lc0-eae015b2-stage1-reliability`. The same
lineage is mirrored to `integration/lc0-limited-production-rc`. No merge to
`main` occurred; `origin/main` remained
`1d2f05e1d4214e3a9e067e0e16199f20f29feca2` throughout certification.

The tested topology remained limited-production only:

- protected main preview: `eae015a-main-elcriollitos-projects.vercel.app`;
- dedicated relay: `eae015a-lc0-relay-elcriollitos-projects.vercel.app`;
- isolated runtime: `caissa-lc0-runtime-eae015a.vercel.app`;
- production relay datastore: Supabase project `jczauvkfkweuvdpurpem`;
- runtime release: `eae015b2-lc0-0.33.0-maia1100-r3`;
- manifest SHA-256:
  `648daa880e131ebe0b83784b68ce63abb50eee571c0328158cc8a94a7f444d3d`.

The public site and its COOP/COEP policy were not changed. Lc0 remained hidden
from ordinary Arena and limited to the exact internal allowlist. No Lc0-vs-Lc0,
mobile, browser-policy, Maia, Lc0, ORT, Stockfish, or Stage 2 scope was opened.

## Pause and Resume

### Root cause

`CaissaArena.togglePause()` set the Match to paused and called the asynchronous
`ArenaRuntimeManager.stopAll()`, but it did not own or await that Promise.
Resume could therefore mark the Match running, allocate the next search
generation, and enter `runEngineLoop()` while the relay-backed Lc0 role was
still completing STOP ACK, BESTMOVE, and STOPPED. A legal callback from the
old search could be applied, after which the next search encountered the role
or relay in STOPPING/IDLE transition and fell into the engine-loop error path.

The visible `arena-error` was emitted by the `runEngineLoop()` catch after the
next search start raced the unresolved Pause STOP. Previously that path did not
retain a deterministic reason. It is now reported as the classified next-search
or runtime-state reason, normally `ARENA_ERROR_NEXT_SEARCH_START`, with role,
runtime state, search ID, game ID, and runtime instance ID.

### Fix

- `_pausePending` owns the complete asynchronous STOP barrier.
- `_resumePending` deduplicates Resume and waits for `_pausePending` to settle.
- Resume cannot change Match state, allocate a new generation, or schedule the
  engine loop until every role has reached its stopped/idle boundary.
- Stale and duplicate BESTMOVE callbacks are counted and ignored rather than
  mutating a newer search.
- Lifecycle trace events record Pause request/STOP completion, Resume request,
  resumed search, BESTMOVE acceptance, move application, and next-search
  scheduling with the relevant IDs.
- All Arena error exits now retain a reason-coded `lastArenaError` and update
  `arenaErrorsByReason`.

### Result

The accepted lifecycle campaign completed 50/50 cycles, alternating Lc0 White
and Black (25 each). Every accepted cycle included create, claim, READY, a real
search, legal play, Pause, Resume, further legal play, STOP, QUIT, CLEANUP, and
session removal.

Result across the accepted 50 cycles:

- `arena-error`: 0;
- duplicate moves accepted: 0;
- stale BESTMOVE accepted: 0;
- runtime identity replacements: 0;
- normal forced terminations: 0;
- orphan workers/pthreads: 0;
- relay residue: 0.

Per the owner's continuation instruction, successful cycles were never
repeated. The final evidence is therefore a preserved segmented campaign:

- cycles 1–10: accepted before the cold-start allowance incident;
- cycle 11: rerun and accepted after the bounded cold-start correction;
- cycles 12–15: accepted;
- cycle 16: rerun and accepted after the test-only Pause wait was aligned with
  the already-certified reconnect lease;
- cycles 17–18: accepted;
- cycles 19–50: 32/32 in one continuation, with 16 White and 16 Black cycles.

The cycles 19–50 segment reported selection-to-READY median/p95
4,811/6,211 ms, STOP median/p95 2,117/5,655 ms, cleanup median/p95
6,189/8,150 ms, first-search median/p95 8,848/11,061 ms, and
Resume-to-search median/p95 6,427/7,504 ms.

Two non-accepted attempts are retained as evidence rather than hidden:

- cycle 11 initially exceeded the generic 30-second UCI startup allowance
  while the real runtime was still loading weights. Startup now has its own
  bounded 60-second allowance, the Arena READY boundary is 75 seconds, and
  `backendSessionMs` is recorded. A deterministic delayed-`uciok` browser probe
  passed without forced cleanup.
- cycle 16 initially exceeded a 15-second test wait while STOP reconciliation
  was still inside the certified 20-second reconnect plus ACK window. The
  harness now waits 30 seconds; production runtime behavior was not changed by
  that test correction.

## Suspended transport

### Exact request and root cause

The original browser error occurred on the long-lived streaming fetch between
the isolated engine page and relay, principally
`GET /api/eae011?action=stream_engine` (engine-to-relay command stream). The
same failure class is possible on `stream_main`. Chromium surfaced
`net::ERR_NETWORK_IO_SUSPENDED` while the Lc0 WASM runtime itself remained
healthy.

The old implementation treated the stream failure as an engine failure. More
importantly, the server advanced its in-process SSE cursor when `res.write()`
accepted a frame. A suspended downstream socket can accept that write without
delivering the frame and without promptly raising close/error. The client had
not durably acknowledged the cursor, so a reconnect could skip a command or
lifecycle event. Cleanup then depended on the broken relay path; the old
failure path could reach forced termination before pthread shutdown completed.

No evidence implicated an illegal engine move or corrupt Maia state. The new
transport trace records `navigator.onLine`, page visibility, browser error,
direction/action, request correlation ID when available, cursor/epoch, and
runtime worker state. Controlled foreground interruption reproduced the class
without backgrounding, so background/visibility change is not required for the
failure.

### Reconnect and delivery correction

- Transport loss enters `TRANSPORT_SUSPENDED`; it no longer immediately
  classifies the runtime as failed.
- New searches and commands wait for a connected transport boundary.
- Reconnect is bounded to 20 seconds and uses the existing session proof,
  durable cursor, epoch, command sequence, and active search ID.
- The relay rewinds an unacknowledged SSE cursor to the durable client ACK
  cursor after one second. Delivery is at-least-once while `claim_command`
  preserves exactly-once engine execution.
- Main-side commands and engine-side events reconcile their durable sequence
  before retry. An accepted request with a lost response advances locally only
  when broker state proves the exact sequence was committed.
- Missing ACK, READY, REUSE_READY, STOPPED, or CLEANUP stream frames are
  recovered from durable broker state without replaying the underlying
  command.
- A reconnect whose active search cannot be reconciled fails closed instead of
  duplicating GO, BESTMOVE, or search generation.

### Local failsafe cleanup

If the relay cannot be recovered but the isolated runtime is alive, the engine
page now performs bounded local STOP, waits for a matching local BESTMOVE when
possible, and cooperatively terminates the runtime and pthread workers. It
records `localCleanupObserved` separately from
`brokerCleanupAcknowledged`; it never fabricates remote CLEANUP evidence.

The main adapter recognizes that local cleanup is owned by the isolated page,
records `brokerCleanupAckMissing`, and leaves the durable row to an explicit
lease expiry. The broker then deletes it with a known lease reason rather than
an UNKNOWN/manual deletion.

## Transport fault campaign

The r3 candidate passed 25/25 controlled interruption cycles:

- 13 main-stream disconnects during search;
- 12 engine-stream disconnects while paused;
- 25 successful reconnects using the existing session/cursor proof;
- 0 duplicate BESTMOVE acceptance;
- 0 stale search acceptance;
- 0 runtime replacement;
- 0 `arena-error`;
- 0 forced termination;
- 0 orphan worker or pthread;
- 0 cleanup evidence failure in reconnect-success cycles.

The separate reconnect-failure/expiry probe passed:

- local cleanup observed: true;
- broker cleanup acknowledged: false, as expected while disconnected;
- parent workers: 0;
- pthread workers: 0;
- forced terminations: 0;
- broker inspection reached HTTP 410 after 64.9 seconds;
- deletion reason remained within the known heartbeat/lease expiry contract.

The initial expiry harness waited only 20 seconds after local cleanup, shorter
than the broker's possible 30-second heartbeat lease plus 20-second reconnect
grace. Its expectation was corrected to a bounded 70-second deadline; broker
or runtime policy was not weakened.

## Tournament regression

The real protected Tournament used SF18 Lite, SF19 Lite, and Lc0 Maia 1100 for
five games. Lc0 played both colors and completed a Pause/Resume during play
without `arena-error` or runtime identity change.

- results: five `1/2-1/2` draws;
- final standings: SF18 1.5/3, SF19 1.5/3, Lc0 2.0/4;
- standings and the visible half-point glyph remained correct;
- all four Lc0 companion pages ended `TERMINATED`;
- workers, parent workers, pthread workers, and forced terminations: 0;
- page errors: 0.

## Drain regression

The final drain was executed against the relay's actual production datastore,
not the similarly named staging project:

1. Internal control reached ENABLED and the allowlisted Lc0 Match started.
2. DRAINING rejected a new session with HTTP 503 `LC0_DRAINING`.
3. The active Match completed cooperative STOP/QUIT/CLEANUP.
4. Its relay session was removed with workers 0, parent workers 0, pthread
   workers 0, and forced terminations 0.
5. DISABLED rejected a new session with HTTP 503 `LC0_DISABLED`.
6. A real SF18 Lite versus SF19 Lite Match continued for four moves and cleaned
   normally while Lc0 remained disabled.

The drain harness now waits until relay health confirms each database control
transition before probing it. This avoids testing against a just-written value
that has not yet converged through the Data API.

## Regression

- Arena/Runtime Manager/Generation Cup/Lc0/Stockfish Node suite: 88/88 passed.
- Targeted Chromium suite: 37 passed, 1 conditionally skipped, 0 failed.
- Chromium covered Generation Cup, SF18/SF19 direct UCI readiness, all targeted
  Match color assignments, three-runtime Tournaments, desktop/tablet/mobile
  stability, accessibility, failure isolation, replacement, rapid start/stop,
  stale-work rejection, and worker cleanup.
- Focused EAE-015B.2 transport contract: 10/10 passed after each test-harness
  adjustment.
- The unchanged legacy EAE-008 contract suite still contains two stale
  assertions that assume Lc0 can never be exposed by an isolated internal
  preview and use the superseded header mapping. They are baseline-only and
  were not changed in this reliability scope.

No Stockfish runtime code or engine behavior changed.

## Metrics and alerts

New or verified browser metrics include:

- Arena errors by deterministic reason;
- transport suspended;
- reconnect success/failure;
- local cleanup observed;
- broker cleanup acknowledgement missing;
- forced termination;
- stale/duplicate BESTMOVE ignored;
- durable lifecycle event recovery;
- runtime replacement and worker counts.

At final observation all six HIGH database alert rules were non-firing:
unexpected SESSION_GONE, STOP timeout spike, forced termination spike, relay
error spike, scheduled cleanup failure, and active growth without cleanup.
The 60-minute snapshot reported active sessions 0, cleanup success 66,
forced termination 0, cleanup failure 0, relay error 0, and STOP timeout 0.
Two deliberate expiry/session-gone observations existed in the broader
60-minute metrics but were outside the five-minute alert window and fully
explained by the controlled lease-expiry probes.

## Final hold

After certification, both deployment and database controls were returned to
the required hold:

- protected main preview deployment:
  `dpl_B6BvxJEU1DBuAkmw7xyZGYP4mJ5S`;
- dedicated relay deployment:
  `dpl_C7xw4Dd8MUKPBCNZRWmRkxe2yaQz`;
- main gateway: `enabled=false`, `releaseStage=DISABLED`, `mode=DISABLED`;
- relay health: `ok=true`, `releaseStage=DISABLED`, `mode=DISABLED`;
- database control: `DISABLED`;
- active sessions: 0;
- relay rows: 0;
- triggered HIGH/CRITICAL alerts: 0;
- public main deployment: unchanged;
- public activation: none;
- Stage 2: not enabled.

Only a new explicit owner authorization may reopen an internal release stage or
begin any Stage 2 work.
