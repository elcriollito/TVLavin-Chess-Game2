# CAISSA Endgame Tablebase — first work slice

Branch: `feature/endgame-tablebase-v1`

## Product flow

The `/endgame-tablebase` workspace loads a standard chess FEN of at most seven pieces. The board is the position owner for presentation; `chess.js` owns legal moves and history. The Result tab shows the tablebase outcome and optional DTZ/DTM. The Moves tab lists legal moves grouped by the mover's outcome. Train hides the result list and explains whether a played move preserved the theoretical result. Undo, reset, flip, and copy FEN are available. The FEN is shareable through the URL.

## Service boundary

`/api/tablebase/standard` validates and canonicalizes FEN, limits standard positions to seven pieces without castling rights, requests Lichess Syzygy data, validates the returned moves against the legal chess position, and returns a stable CAISSA response. It serializes upstream requests within a running function instance, caches responses for five minutes in that instance, and pauses upstream calls for at least one minute after HTTP 429. These are per-instance safeguards, not global rate limiting across Vercel instances. A shared cache/limiter is needed before broad traffic.

The existing Endgame Trainer retains its curated, reviewed positions and offline runtime. This service can later be consumed by Analyze, Coach, Game Review, and Puzzles after each surface establishes its own result and rate-limit contract.

## Next work

1. Browser QA at desktop and mobile sizes against live tablebase responses, including promotion, en passant, fifty-move edge cases, and keyboard interaction.
2. Design a dedicated piece-placement mode that keeps setup drafts separate from legal move history.
3. Add a deliberate perfect-line replay using `/standard/mainline` with draw and 50-move handling.
4. Move caching and rate control to shared infrastructure before public release. Add production observability and a provider availability fallback.
5. Integrate the shared tablebase contract with Analyze and Coach only after this page is stable.

The page is intentionally `noindex` while this initial work is reviewed.
