# Season 10.5A — Remote Tablebase Evidence and Review Packets

## 1. Baseline

Implementation began on clean `main` at
`6be1cc6a1f3b3ea865117506956385519c4b190b`, equal to `origin/main`.
The authorized Vercel project remains `tv-lavin-chess-game2`.

## 2. Season 10.5 block

Season 10.5 correctly stopped because eight Stockfish discrepancies had no real
human disposition. This phase gathers evidence and deliberately leaves all
reviewer decisions empty.

## 3. Provider decision

The private authoring provider is the Lichess tablebase server,
`lichess-syzygy-remote@1.0.0`, at the single allowlisted HTTPS origin
`https://tablebase.lichess.ovh`.

## 4. Provider contract

The contract supports standard chess, WDL categories, DTZ when returned, DTM when
returned, legal moves, and the documented mainline capability. Complete provider
coverage is declared only through seven pieces. Eight-piece support is partial
and a position may return unsupported. It requires network access, is eligible
for private authoring only, and is never learner-runtime eligible.

## 5. Trust boundary

The hierarchy is verified local Syzygy evidence, archived remote evidence,
pinned Stockfish evidence, then legal authored content without analysis.
Remote evidence is archived external evidence, not local recomputation. It
cannot edit content or establish an editorial decision.

## 6. API semantics

`GET /standard?fen=<encoded FEN>` returns a root category, optional DTZ/DTM and
legal moves best-first with UCI, SAN, resulting category, optional distances and
terminal flags. Categories are `win`, `syzygy-win`, `maybe-win`, `cursed-win`,
`draw`, `blessed-loss`, `maybe-loss`, `syzygy-loss`, `loss`, and `unknown`.
`GET /standard/mainline` returns a DTZ line where available and returns 404 when
required tables are absent. Season 10.5A archives `/standard` only; mainline
remains a documented capability rather than an evidence requirement.

No published provider SLA, stable quota, or availability guarantee is assumed.
The response carried no contractually relied-upon rate-limit header. Browser
CORS behavior is irrelevant because requests occur only in the private Node
authoring command.

## 7. Eligibility

Validation canonicalizes the six-field FEN, loads it through `chess.js`, requires
exactly two non-adjacent kings, rejects pawns on ranks one/eight, castling and en
passant state for this bounded workflow, checks standard variant, and counts
pieces before making a request. Up to eight pieces are requestable; eight-piece
coverage remains explicitly partial.

## 8. Network safety

The adapter fixes the origin and endpoint, sends no credentials, identifies the
private authoring client, requests JSON, rejects redirects and non-JSON content,
uses 12-second timeouts, at most two retries for timeout/429/5xx, bounded
backoff, and sequential processing. No CLI provider URL exists.

## 9. Cache policy

Private cache identity binds provider ID/version, endpoint, exact canonical FEN,
position content digest, and request parameters. Valid cache is reused by
default; `--force-refresh` requests a new response and `--offline` generates
from valid cache only. Invalid or stale bindings are ignored. Archived evidence
is never described as a local probe.

## 10. Response normalization

Schema `1.0.0` records provider, endpoint, exact FEN/content digest,
request/response/evidence digests, category, returned distance fields, terminal
flags, locally validated moves, retrieval time, HTTP status, and explicit
`localTablebaseVerified=false` and `humanReviewedRemoteEvidence=false`.
Only compact normalized evidence is committed; raw provider bodies are not.

## 11. Move normalization

Each UCI move is applied to the submitted FEN with `ChessRulesFacade`. Provider
SAN must exactly match locally generated SAN, and the resulting FEN is recorded.
Illegal UCI or mismatched SAN fails that response closed.

## 12. WDL and DTZ interpretation

WDL-preserving moves retain the best theoretical outcome available to the
original mover after category inversion. Cursed wins and blessed losses remain
distinct. DTZ-optimal moves are reported only when the root and best returned
move both contain integer DTZ; no value is fabricated for partial eight-piece
responses. A DTZ result is chess evidence, not pedagogical uniqueness.

## 13. Stockfish comparison

The comparator places the authored UCI move, authored alternatives, Stockfish
best/MultiPV, WDL-preserving moves and DTZ-optimal moves together. Its output is
a technical observation such as `authored-move-tablebase-invalid`,
`only-move-claim-invalid`, or `authored-valid-among-equivalents`. Every result
still sets `requiresHumanInterpretation=true`.

## 14. Review packet schema

Packet schema `1.0.0` binds pool/version, exact content, Knowledge provenance,
engine evidence digest, remote evidence digest, comparison, open questions,
allowed decisions, and packet digest. JSON is authoritative and Markdown is a
review-friendly projection.

## 15. Human-decision boundary

The reviewer template leaves decision, rationale, reviewer reference and
revision null. A person must confirm position, engine, and remote evidence
digests. Nothing generated by this phase is a human review.

## 16. Private storage

Normalized evidence lives in `endgame-pools/private/remote-tablebase/`; packets
live in `endgame-pools/private/review-packets/`; the summary lives in
`docs/verification/`. These directories are protected by the release builder.

## 17. Public artifact exclusions

`docs/`, `scripts/`, `tests/`, `endgame-pools/authoring/`, and
`endgame-pools/private/` remain excluded from the public release and Vercel.
The published pool, registry, manifest, learner modules, sitemap, and browser
bundle contain no provider dependency or evidence.

## 18. Security

The design prevents arbitrary URL injection, SSRF, redirects to another host,
path construction from remote values, malformed-FEN requests, unbounded retry,
HTML error ingestion, invalid JSON acceptance, and blind trust in move strings.
No secrets or executable provider content exist.

## 19. Outage behavior

Valid cache remains usable when the provider is unavailable. Uncached positions
receive explicit failure status and partial packets. Content, public verification
flags, and production runtime remain unchanged.

## 20. Tests

Deterministic tests cover provider/eligibility contracts, WDL categories,
optional fields, local move validation, malformed payloads, redirect/content
type failures, bounded retry, comparisons, packet count, empty reviewer fields,
digest binding, and private artifact exclusions. Live testing is opt-in through
`CAISSA_LIVE_TABLEBASE=1`.

## 21. Performance

The live eight-position run is recorded in the private packet index with request
latencies, cache count, retry/failure count and retrieval time. These observations
are not an SLA. Cache performance is verified independently by offline execution.

## 22. Operational usage

Use `npm run verify:endgame-remote-tablebase -- --force-refresh` for an explicit
live refresh, omit the flag for cache-first operation, or add `--offline` for
cache-only packet generation. `--timeout` is bounded from 1,000 to 30,000 ms.
The command never runs in production builds.

## 23. Known limitations

Evidence depends on an external service and its current tables. Eight-piece
coverage is partial. Mainlines are not archived. Remote evidence does not prove
pedagogical intent, learner difficulty, accessibility, competitive trust, or
local Syzygy availability.

## 24. Human adjudication next step

A real chess reviewer must fill the seven required reviewer fields in every
packet. Validation in the next phase must reject missing rationale, invalid
decision types and stale position/engine/tablebase digests.

## 25. Season 10.5B readiness

Season 10.5B may begin only after all eight packets contain real human decisions.
It may then decide whether to preserve, revise, replace, or retire content and,
if anything changes, create a new immutable pool version.
