# CAISSA Endgame Tablebase — review cut

Branch: `hotfix/tablebase-navigation-latency`

Status: public v1 in production; latency hotfix in draft review

Last logic verification: 2026-09-27

## Product flow

`/endgame-tablebase` opens with only a white king on e1 and a black king on e8 (`4k3/8/8/8/8/8/8/4K3 w - - 0 1`), ready for the user to set up an endgame. A valid `?fen=` link still loads its specified position. `chess.js` remains the only owner of legal moves and move history. The persistent CAISSA board presents that position and accepts mouse drag, tap/click, and keyboard square activation.

The single right workspace follows the CAISSA Head/Body/Foot pattern:

- **Setup** owns a temporary piece-placement draft. Its palette now uses the same contrasting graphical white and black pieces as the board, on separate labeled rows. Moving, placing, or erasing pieces does not call `game.move()` and does not create history. `Restart setup` sits with the draft actions; the persistent footer's left action is `Load as new position`, which validates the draft and starts a fresh legal-history session.
- **Moves** starts with a compact, persistent result summary and meaningful DTZ/DTM, followed by legal moves grouped by result for the player making the move. Provider categories are inverted only at this presentation boundary because each move category describes the resulting position for the opponent.
- **Game** shows only the temporary move line and its navigation. The Practice/reveal panel was removed from this analysis page so puzzle-style training stays in its own product surface.

The five-control navigation bar can jump to the start/end, step backward/forward, or replay the temporary line. Revisiting a past position and making a different legal move discards the undone continuation. Loading a new FEN clears the line and establishes a new reset origin; nothing is saved between visits. Undo, Reset, Flip, Copy FEN, promotion choice, FEN links, and provider/error states remain present. The page remains `noindex`.

Within one visit, successful tablebase responses are retained for up to 128 distinct positions (including the halfmove clock). Returning to a position in the line restores its result immediately without another API call. On a new legal move whose child category is already supplied by the current provider response, the result summary appears immediately with an explicit loading note while the full list of legal moves is fetched. This does not remove the provider's required global pacing for genuinely new positions.

The latency hotfix also projects a legal move through the board's semantic move API. A dragged piece lands without first snapping to its source square and replaying a 180 ms transition; tap/click keeps the normal short board animation. If the shared limiter returns `TABLEBASE_PROVIDER_BUSY` with a short `Retry-After`, the browser retains the child result supplied by the previous position, waits once, and retries the CAISSA gateway. It never presents that provisional summary as a fetched move list, never retries a long provider backoff, and never bypasses the shared limiter. A rejected limiter claim occurs before Lichess is contacted.

## Result semantics

The provider's `category` already incorporates the halfmove clock and 50-move rule. CAISSA does not re-derive WDL from DTZ.

| Provider category | CAISSA presentation |
| --- | --- |
| `win`, `loss`, `draw` | exact result under the current clock |
| `cursed-win` | draw under the 50-move rule; win without it |
| `blessed-loss` | draw under the 50-move rule; loss without it |
| `maybe-win`, `syzygy-win` | uncertain win-or-draw; never promised as a win |
| `maybe-loss`, `syzygy-loss` | uncertain draw-or-loss; never promised as an exact draw or loss |
| `unknown` | no exact result |

DTZ is shown in plies and receives an `≈` prefix when Lichess omits `precise_dtz`. DTM is shown in plies only when supplied and meaningful; it is not presented for a draw. Checkmate, stalemate, and insufficient material have explicit terminal language.

## Service boundary

`/api/tablebase/standard` now targets the official `https://tablebase.lichess.org/standard` hostname documented by Lichess. It:

1. parses and canonicalizes FEN with `chess.js`;
2. enforces two to seven pieces and no castling rights;
3. rejects positions in which the previous mover's king is left in check;
4. sends at most one upstream request at a time per running instance with an eight-second timeout;
5. checks every returned UCI/SAN move against the complete local legal-move set;
6. preserves exact/rounded DTZ, DTM, zeroing, and terminal flags in a stable CAISSA response;
7. stores up to 500 successful positions in a 24-hour per-instance cache (fullmove number is ignored in that cache key);
8. returns CDN cache headers for one day plus seven days of stale revalidation;
9. honors a provider `Retry-After` value from 60 seconds up to a 24-hour safety bound and never caches errors.

The official provider contract is documented in the [Lichess tablebase server README](https://github.com/lichess-org/lila-tablebase#http-api). Lichess's general API guidance requires serialized requests and at least a one-minute pause after 429 responses.

## Public exposure gate

Per-instance queueing and caching are not distributed rate limiting. The production handler therefore fails closed with `TABLEBASE_REVIEW_ONLY` unless both of these variables are explicitly set and server-side Supabase credentials exist:

- `CAISSA_TABLEBASE_PUBLIC_ENABLED=1`
- `CAISSA_TABLEBASE_SHARED_LIMITER_READY=1`

The second flag selects the shared limiter implemented in `api/tablebase/shared-limiter.js` and `supabase/migrations/20260928000030_caissa_tablebase_shared_limiter.sql`. A single locked Postgres row grants one lease globally, caps uncached provider requests at 20 per minute, spaces them by at least one second, and records provider `Retry-After` globally. A claim or release error returns 503. An abandoned lease expires after 90 seconds, exceeding the eight-second provider timeout and preserving at least a one-minute pause if a caller disappears during a 429. CDN caching still reduces repeated identical lookups.

The migration was applied and exercised on CAISSA-READER-STAGING (`aqizagaskicotorfpwfn`) on 2026-09-27/28. Two concurrent claims produced exactly one `ALLOWED` and one `PROVIDER_BUSY`. Releasing the lease with a 120-second backoff produced `PROVIDER_BACKOFF` on the next claim. On 2026-09-28 the same migration was applied to CAISSA-PRODUCTION (`jczauvkfkweuvdpurpem`). The production gate table and RPC signatures exist, RLS is enabled, `anon` and `authenticated` cannot execute the RPCs, `service_role` can, and a claim followed by release succeeded. The two Vercel release flags and server-side Supabase credentials are now active in Production; the public endpoint still fails closed if any of them is removed.

The staging and production security advisors report `RLS enabled, no policy` for this table at [lint 0008](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). This is intentional: the table has no direct Data API reads or writes for any role, and only the two service-role RPC functions operate on it. Unrelated advisor findings were not changed.

## Runtime observability

The API emits one-line JSON events with `component: "caissa_tablebase"` to Vercel Runtime Logs. `provider_response` records upstream HTTP status and latency in milliseconds; `provider_network_error` distinguishes timeout from other network failures. `request_failed` records normalized causes (`provider_429`, `provider_404`, `provider_error`, `shared_busy`, `limiter_unavailable`) and, for a busy shared limiter, its reason. `cache_hit`, `provider_backoff`, and `release_gate_closed` cover local cache and early rejection. These events deliberately omit FEN, IP, request headers, provider bodies, credentials, and lease IDs.

For production operations, filter Runtime Logs by `caissa_tablebase` and monitor 429s, timeouts, limiter failures, and provider latency. A cache hit handled at the CDN never runs the function, so provider call volume is counted from `provider_response`, not total page views. Alert thresholds should be based on observed traffic rather than preview traffic.

This work does not import the remote service into the curated Endgame Trainer. Its reviewed position pools and offline runtime are unchanged.

## Setup Position v1

Setup is deliberately smaller than an analysis editor:

- free piece placement, replacement, erasing, tap-to-move, and drag-to-move;
- White/Black to move and halfmove clock;
- Clear board, Kings only, Restart setup, Cancel, and explicit Load;
- exactly one king per side, legal FEN shape, two-to-seven-piece limit, and previous-mover legality enforced on Load;
- castling and en-passant rights always cleared because a placement draft has no preceding legal move;
- no setup undo stack in v1;
- no move is appended to legal history by setup gestures.

## Verification evidence

### Automated

- `npm run lint:tablebase` — syntax checks pass.
- `npm run test:tablebase` — 14/14 pass, including navigation and alternate-line branching alongside perspective inversion, 50-move semantics, Setup isolation, response completeness, promotion, en passant, production gating, shared limiter behavior, 429 backoff, and privacy of runtime events.
- `CAISSA_TABLEBASE_LIVE=1 npm run test:tablebase:live` — 1/1 passes against real Lichess responses.
- `npm run test:tablebase:browser` — 6/6 Chromium scenarios pass. Coverage now includes the two-kings entry position, independent piece/result/move-list timing, click, physical mouse drag, touch tap, Undo, cached forward navigation, rapid back/forward navigation, one-second shared-limiter pacing, and the existing desktop/mobile, setup, promotion, en-passant, error, accessibility, overflow, and jitter checks.

Across deterministic runs with a 450 ms response delay, the final draft projected the piece and known child result in 10.8–11.6 ms and replaced the loading state with the full move list in 488–494.2 ms. Cached Undo measured 7.4–14.4 ms, forward navigation 7.3–8.2 ms, and drag-to-the-same-child 9–9.8 ms. With a simulated shared `Retry-After: 1`, the known result stayed visible in 54–76 ms including Playwright input overhead, and the legal list completed in 1.411–1.435 s. The additional time belongs to mandatory shared pacing plus browser/test polling, not board rendering.

A production baseline against the published pre-hotfix page used a fresh halfmove clock to avoid a response cache. The board's semantic square changed in 3.6 ms, but the piece visually settled after 191.3 ms. The panel entered `Checking tablebase…` at 3.6 ms and the uncached child request ended at 121.5 ms as `Result unavailable` after a real shared-limiter 503. This is the failure the hotfix addresses: the provider spacing is legitimate, but replacing a result already known from the parent and making drag snap back were frontend defects.

### Live provider positions

The live contract test and manual audit confirmed these real responses on 2026-09-27:

| Risk | FEN | Observed |
| --- | --- | --- |
| promotion | `4k3/6KP/8/8/8/8/7p/8 w - - 0 1` | `win`; queen/rook promotions preserve the win, knight/bishop do not |
| en passant | `7k/8/8/3pP3/8/8/8/K7 w - d6 0 1` | `win`; `e5d6` / `exd6` is present and zeroing |
| checkmate | `7k/6Q1/5K2/8/8/8/8/8 b - - 0 1` | `loss`, `checkmate: true`, zero legal moves |
| stalemate | `7k/5Q2/5K2/8/8/8/8/8 b - - 0 1` | `draw`, `stalemate: true`, zero legal moves |
| insufficient material | `8/8/8/8/8/4k3/8/4K3 w - - 0 1` | `draw`, `insufficient_material: true` |
| 50-move edge before threshold | `8/4K2k/5Q1P/6P1/8/8/q7/8 w - - 99 148` | `win`; `Qg7#` is winning |
| 50-move edge at threshold | same position with halfmove `100` | `cursed-win`; `Qg7#` child is `blessed-loss` |

The prior layout review at 1600×1000 measured a stable 720×720 board and a 493×730 workspace with no console errors or page overflow. At 390×844 the board measured 370×370, page width stayed 390, and Setup used document scrolling. Those measurements predate the revised three-tab layout and require rechecking.

## Deliberate limits and remaining release work

- Public traffic is active behind the production gate and shared limiter. The latency hotfix remains a draft until visual approval.
- No `/standard/mainline` replay exists yet.
- DTM is optional provider data; CAISSA does not manufacture it.
- Setup does not preserve castling/en-passant history and has no draft undo stack.
- Automated browser QA was Chromium only. Physical iOS/iPadOS/Android touch, Safari/WebKit, and assistive-technology testing remain follow-up checks.
- Provider failure was tested with deterministic HTTP mocks; an intentional real 429 was not generated.
- The structured runtime events are implemented. Production dashboard/alert thresholds remain an operations follow-up.
- Analyze, Coach, Game Review, and Puzzles have not adopted this service. Each needs its own result and traffic contract first.
