# CAISSA Mentor — first review build

Base: `2bef6d2072eb7922ec0f4c04664fc25e2fdff31a`.
Isolated local branch: `feat/mentor-page-isolated-2026-09-30`.
Review route: `/mentor.html`; application/Vercel route: `/mentor`.

## Implemented

- Dedicated page with large board left and singular workspace right. Learn, Openings and My Account tabs retain the conversation and board.
- Five authored interactive lessons: development/Italian Game, London, Sicilian, knight fork and opposition. All SAN and FEN transitions validated with the existing vendored Chess.js 1.4.0.
- Previous/next/jump/repeat, free legal exploration, flip, full FEN loading and promotion choice. A new session clears the conversation and returns to the initial lesson.
- Existing persistent board adapter and Quiet Drag implementation reused without modifications. No page-specific drag system or engine worker.
- Opt-in inline mount of the existing public Mentor shell. Other surfaces retain their original floating presentation. Explicit dedicated route and `mentor-study` provenance distinguish this study board from active Play.
- Existing LLMProvider, CAISSA authentication, credit-aware explicit submission and authenticated rendered-delivery acknowledgement preserved. New page conversation retains at most five exchanges and 24,000 characters; individual assistant context entries capped at the backend's 12,000-character message limit.
- My Account saves Chess.com/Lichess usernames only in this browser, with explicit truthful messaging. No credentials or tokens are saved there.

## Existing Mentor inventory and ownership

The current public Play Mentor uses `js/mentor/mentor-floating-shell.js`, `llm-provider.js`, `js/mentor/mentor-context-contract.js` and CAISSA auth. The floating shell already owns submission, readable text rendering and bounded authenticated acknowledgement retries at `/api/mentor/result/:operationId/confirm`. The backend owns quotas, credit reservations, idempotency and result delivery. The new page changes presentation without duplicating these authorities.

`mentor-ai.js` and `mentor-prompts.js` contain an older, broader Mentor runtime with provider settings, position prompts, engine reports and modes. Public Play explicitly excludes that runtime. It is not booted alongside the current shell; doing so would create competing authorities. Existing educational analysis, summary and guided replay modules remain available for the next integration phase.

## Not yet integrated

- Account verification, Chess.com/Lichess imports, account-synced usernames, insights and rating reports. Ratings are neither fabricated nor combined.
- Native CAISSA game history; shown as coming later.
- AI-authored executable lesson actions, engine verdicts or tablebase verdicts. Current classes are authored local examples; AI responses remain text and cannot execute arbitrary board instructions.
- Completed-game local review is described using the existing semantics, but its full postgame analysis pipeline has not been ported to this standalone page.
- Saved conversation history across reloads, provider settings/BYO UI from the legacy runtime and a personalized curriculum.
- Removal of floating Mentor from existing live pages. This isolated build proves the dedicated surface first; final migration requires reviewed entry links and an approved release.

## Verification

`node --test tests/mentor-page.test.js tests/mentor-floating-shell.test.js tests/play/mentor-summary.test.js tests/board/caissa-quiet-drag.test.js` passes (26 tests). JavaScript syntax checks and `git diff --check` pass.

Checks cover legal lesson replay, aligned SAN/FEN, the fork's actual check and rook capture, dedicated context provenance, rejection of active-play provenance, shared ownership and preserved existing Mentor/Quiet Drag behavior.

Browser visual QA remains pending. Playwright browser binaries were unavailable in this environment and the available CUA browser blocked the local preview. No visual, accessibility, browser-performance or production AI/account certification is claimed. Desktop/mobile geometry, long replies, promotion dialog, pointer drag metrics and human Quiet Drag feel are release gates.

No deployment, merge, remote push or shared checkout mutation performed.
