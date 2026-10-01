# CAISSA Mentor 1.0 candidate — PGN in Learn and explicit Game Review

Continues the delivered ECO/FEN version. Alexander supplied Codex's clean-worktree report: remote branch feature/mentor-page-handoff-review-2026-09-30; commits fd97265 and6511f3a;44/44 tests and desktop/mobile searches/drafts/FEN/Quiet Drag/promotion QA. Alexander indicated the page is ready for1.0 publication, with PGN→Learn→Game Review as the remaining requested function. That QA is supplied evidence for the previous version; this addition still needs its own end-to-end verification.

## Delivered

My account → Insight → Local PGN now loads a chosen local file OR pasted PGN. Local mode changes the action to Load PGN Games and enables it; online mode stays disabled and explicitly unavailable. No fetch, Shared AI, engine review, persistent insight or lightbulb is triggered by local load.

All games validate atomically with vendored Chess.js1.4.0 before replacing the current game. Bounds:250,000 characters/1MB file/50 games/512 half-moves per game/variation nesting16. Completed results only. Standard collections split by their line-start Event header; boundary detection ignores comments. Collections must place Event first per game. Headerless single completed games are supported. Variations/comments are accepted but only the main line is loaded. Invalid collection leaves the existing game intact. Async file reads cannot overwrite a subsequently changed study position.

Successful import activates Learn and the first game's initial position. Learn contains the game selector, metadata/result, full clickable mainline, First/Previous/Next/Last controls and Game review. The left board retains its controls but shows compact imported-game notation so a long game does not expand the board footer. Both views share the same game/board/cursor. Custom initial FEN, Black-first numbering, castling, en passant and promotions are supported through Chess.js. Alternatives use existing Try it yourself behavior and do not mutate imported mainlines. New session clears the local imported collection.

Game review prepares a bounded Chat draft containing players/result, initial FEN, full SAN mainline, selected move and current FEN, then opens Chat. Existing drafts are never overwritten. The user submits explicitly through the existing Shared AI provider/authorization/credits flow. Button and helper text disclose Shared AI/possible credits. No automatic paid call or fabricated engine verdict. The prompt requests a concise overview and discussion and explicitly distinguishes observations from unverified engine conclusions.

## Verification

53/53 targeted tests PASS; syntax checks and git diff --check PASS. New tests cover exact replay, castling/en passant/promotion, Black-first FEN, multi-game boundaries/comments/variations, invalid/ongoing/oversized collections, immutable records, full review prompt, Learn navigation, draft preservation, atomic rejection and async stale-import protection.

No browser/real provider certification in this environment. Required local Codex QA: desktop/mobilePGN file+paste; multiple games; Learn controls+SAN; promotion/Quiet Drag; current draft preservation; Game Review opens Chat and actual authenticated Send returns a game-grounded answer with expected credit handling. Static preview is insufficient to certify this last backend flow.

Online account imports, persistent insight recall, owner-scoped remote games and automatic engine analysis remain future integrations; they are not implemented by this patch. Future1.0 release must describe only available features, preserve canonical Quiet Drag, and use normal repository release checks. No merge/deploy performed here.
