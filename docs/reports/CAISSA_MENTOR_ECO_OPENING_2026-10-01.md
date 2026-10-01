# CAISSA Mentor — shared ECO catalog → board → Chat

Continues the existing Mentor worktree at c05bece1771ff0a76fe8359498b5093d9b1f98b4. Implements Alexander's image(20261001-033408).png.

Opening now loads the same /data/eco/eco_codes.json used by Chess ECO Codes Database, lazily on entering the tab. No separate copied catalog or ECO page runtime is booted. Cards display source name/code and line, grouped by 1.e4, 1.d4 and other first moves. Common openings appear first. Search covers name/code/notation; Show more exposes another 24 results.

On choosing a valid opening, Chess.js validates its complete line, prepares immutable catalog SAN and replays positions into the existing single Mentor game/shared board. The final position loads without animation; the title, notation, lesson navigation, Repeat, context FEN and practice use that line. Chat activates and appends a local context exchange, retained in bounded conversation history. Existing drafts are preserved. Explain the plans prepares an explicit Shared AI draft, and Try this opening enables legal free practice. Neither selection nor practice automatically calls AI or consumes credits. Pending promotion/current reply guards remain active.

## Source data limitation

The shared catalog has 364 entries, 345 with fully legal lines and 19 invalid lines. Invalid entries remain visible but disabled with Line unavailable. Codes: C76, C77, C78, C83, C86, C87, C88, C89, E45, E46, E47, E48, E49, E50, E51, E52, E54, E56, E57. No partial invalid line is loaded and no source records were silently repaired or renamed. The discrepancy between some existing ECO names/details is outside this patch; the cards use the canonical ECO code catalog as-is.

The initial local response establishes the selected opening and side to move and offers discussion/practice. It is not an engine analysis or a generated strategic lesson. Follow-up manual submissions continue through the existing provider with the shared board context. Real API/auth/credits remain unverified here.

## Verification

43/43 targeted tests PASS. All 345 playable catalog entries replay legally with aligned FEN/notes/moves; all 19 invalid entries are rejected. Corrupt schema/duplicate IDs and partial illegal PGN are rejected. Catalog snapshots resist upstream mutation. Behavioral Ruy Lopez selection verifies final FEN, Chat activation, local exchange, draft preservation, practice and no automatic provider network. Syntax checks and git diff --check PASS.

Browser visual verification remains pending. QA needed: search/Show more, grouping, unavailable cards, correct final positions, tab transition and fixed FOOT, Repeat/navigation/free practice, desktop/mobile, special moves and Quiet Drag per docs/standards/CAISSA_QUIET_DRAG.md. No board renderer changes or production deployment.
