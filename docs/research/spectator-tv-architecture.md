# CAISSA Chess Spectator TV Architecture

Status: Season 4.2A.1 Architecture Approved  
Scope: Planning and architecture only  
Production behavior: No changes

## 1. Product Goals

Spectator TV will become CAISSA's polished interface for watching live FICS games. It should feel like a lightweight chess broadcast experience while reusing the existing CAISSA production systems instead of duplicating them.

Primary goals:

- Let users watch live FICS games without needing to understand the raw FICS lobby.
- Present live games with a stable board, player bars, clocks, move list, PGN, and clear status messaging.
- Provide curated viewing channels such as Featured, Top Rated, Blitz, Bullet, Rapid, and future variants.
- Preserve the current FICS client, Style12 parser, gateway, and play workflows.
- Reuse the Season 4.1 UX standards and shared UI foundation.

Target users:

- Casual visitors who want to watch chess immediately.
- FICS users who prefer a broadcast-style viewing layer.
- Players studying live games.
- Future users following friends, tournaments, featured events, or community streams.

Success criteria:

- Spectator TV can connect, discover games, observe a game, switch games, and recover cleanly.
- Board, player metadata, clocks, move list, PGN, and status remain synchronized.
- Existing FICS play mode remains unaffected.
- The implementation is atomic, testable, and PVS remains the release gate.

## 2. Feature Inventory

### MVP

- Spectator TV route or section.
- Guest-based FICS connection using the existing gateway.
- Dynamic channel model.
- Featured Game channel using a simple recommendation score.
- Active game discovery from FICS `games` output where available.
- Manual game selection.
- Live board using existing Style12/FEN rendering.
- Player names, ratings when available, clocks, side-to-move status.
- Move list.
- Game status and result.
- PGN copy/download.
- Loading, empty, no-results, and error states using shared UI foundation.
- Accessible controls and keyboard-safe navigation.

### Future Enhancements

- Top Rated, Blitz, Bullet, Rapid, Classical, Variants, New Games, Longest Running, Most Observed, and Recently Started channels.
- Player cards with country/title/history if available.
- Captured pieces.
- Shareable spectator links.
- Open game in Analyze after completion.
- Live opening recognition and compact Opening Coach context.
- Friends and followed-player channels.
- Tournament Center broadcast integration.
- Community event channels.
- Theme support for Yahoo Chess / BabasChess inspired modes.

## 3. Dynamic Channel Model

Spectator TV should not be built around a fixed list of hardcoded channels. Channels should be data-driven descriptors that can filter, sort, and score live game candidates.

Conceptual channel object:

```text
SpectatorChannel
- id
- label
- description
- enabled
- source
- filters
- sort
- scorer
- emptyMessage
- refreshPolicy
```

Example channel IDs:

- `featured`
- `top-rated`
- `blitz`
- `bullet`
- `rapid`
- `classical`
- `variants`
- `new-games`
- `longest-running`
- `most-observed`
- `recently-started`

Channel responsibilities:

- Define which game candidates are eligible.
- Define how eligible games are ranked.
- Define user-facing empty/no-results copy.
- Avoid embedding UI-specific behavior inside the channel selection logic.

This model lets future channels be added without redesigning the Spectator TV state layer.

## 4. Recommendation Strategy

The Featured Game should use a lightweight deterministic scoring model. It should not use AI, machine learning, or remote ranking services.

Candidate inputs:

- Average player rating.
- Observer count when available.
- Game age.
- Time control.
- Variant priority.
- Titled-player indicators if FICS exposes them.
- Computer/engine marker if useful for filtering or labeling.
- Game phase if inferable from move count.

Example scoring shape:

```text
score =
  averageRatingWeight
  + observerCountWeight
  + timeControlWeight
  + titledPlayerWeight
  + variantPriorityWeight
  - staleGamePenalty
```

Recommended defaults:

- Prefer human standard chess games for the initial Featured channel.
- Prefer higher average rating.
- Prefer games with observers if available.
- Avoid games that are nearly finished if move count/result status suggests that.
- Keep computer/engine games visible but avoid over-promoting them unless an engine channel exists.

The scorer should be isolated so tuning weights later does not require UI changes.

## 5. Refresh Policy

Different Spectator TV data should refresh differently.

### Current Observed Game

Source: Style12  
Refresh mode: event-driven  
Expected behavior:

- Update board, clocks, last move, and side to move when Style12 arrives.
- Deduplicate board redraws by comparing the last rendered FEN.
- Ignore stale Style12 updates for a previously observed game where game ID is known.

### Game List

Source: FICS `games` output or existing active-game parser  
Refresh mode: periodic and manual  
Expected behavior:

- Refresh periodically while connected and not in an error state.
- Use a conservative interval, such as 30 to 60 seconds.
- Provide manual Refresh.
- Do not refresh aggressively while switching games.

### Metadata

Source: parsed FICS output and Style12  
Refresh mode: update only when changed  
Expected behavior:

- Update player names, ratings, clocks, relation, and result only when new values differ.
- Avoid re-rendering entire panels for unchanged metadata.

### Channel Selection

Source: current game list  
Refresh mode: derived  
Expected behavior:

- Recompute channel candidate lists after game-list refresh.
- Preserve current observed game unless the user changes channels, the game ends, or auto-follow is enabled.

## 6. Spectator TV State Machine

Spectator TV should use an explicit UI state machine so user-facing status never becomes ambiguous.

States:

- `disconnected`
- `connecting`
- `loading-games`
- `watching`
- `switching-game`
- `game-finished`
- `reconnect-required`
- `error`

Allowed transitions:

```text
disconnected -> connecting
connecting -> loading-games
connecting -> error
loading-games -> watching
loading-games -> no-results display within loading-games context
loading-games -> error
watching -> switching-game
watching -> game-finished
watching -> reconnect-required
watching -> disconnected
switching-game -> watching
switching-game -> error
game-finished -> loading-games
game-finished -> switching-game
reconnect-required -> connecting
reconnect-required -> disconnected
error -> loading-games
error -> connecting
error -> disconnected
```

State rules:

- Only `watching` may render an active live board as current.
- `switching-game` keeps the last confirmed board visible while the new game is being observed.
- `game-finished` preserves final board, moves, and PGN.
- `reconnect-required` should not pretend the old game is still live.
- `error` should show a user-facing message and keep technical details in diagnostics/console.

## 7. Architecture

### UI Architecture

Recommended layout:

- Left panel: channels and live game list.
- Center: broadcast board, player bars, clocks, status, optional opening label.
- Right panel: move list, PGN/export, game metadata.

The layout should be distinct from the FICS Room Tables page. FICS is a play/lobby surface; Spectator TV is a curated watch surface.

### Data Flow

```text
FICS Gateway
  -> FICS Client Connection
  -> Raw FICS messages
  -> games/style12 parsers
  -> Spectator TV state model
  -> Channel selectors and recommendation scorer
  -> Board + player bars + clocks + move list + PGN
```

### State Management

Spectator TV should own a small state object separate from FICS play state:

```text
SpectatorTVState
- status
- connectionStatus
- selectedChannelId
- channels
- activeGames
- currentObservedGameId
- currentFen
- currentGameMetadata
- moveList
- pgn
- clocks
- lastStyle12
- error
- autoFollowEnabled
- lastRefreshAt
```

This state may call existing FICS helpers but should not mutate FICS play-mode state except through established observe/unobserve behavior.

### Interaction With Existing FICS Layer

Reuse:

- Gateway URL config.
- Connect/disconnect helpers.
- Guest login flow.
- Send-command helper.
- Observe/unobserve behavior.
- Existing Style12 event path.
- PGN helper where practical.

Avoid:

- Duplicating WebSocket logic.
- Duplicating login logic.
- Changing FICS protocol behavior.
- Mixing playable game move submission with spectator observation.

### Interaction With Style12

Style12 remains authoritative for the observed board.

Spectator TV consumes:

- FEN.
- Side to move.
- Game number.
- Player names.
- Clocks.
- Last move.
- Relation/observer state.
- Result/end state where available.

No parser changes should be made unless a missing field blocks MVP.

### Interaction With Opening Coach

MVP should only show simple opening identity if available from existing ECO detection. Full coach content should be deferred.

Future integration:

- Opening name and ECO code.
- Compact philosophy/plan summary.
- Link to Analyze or Opening Coach after game.

### Interaction With PGN

Reuse existing FICS PGN generation where possible.

Spectator TV should support:

- Copy PGN.
- Download PGN.
- Preserve Event, Site, Date, White, Black, Result, and TimeControl when available.

### Interaction With Analyze

MVP should not run engine analysis during live observation.

Future:

- Open completed game in Analyze.
- Pass PGN or final game model.
- Avoid live engine analysis until explicitly scoped.

### Interaction With Shared UI Components

Use Season 4.1 foundation for:

- Loading spinner.
- Empty state.
- No-results state.
- Error banner.
- Status badge.
- Panel header.
- Tooltip helper.
- Accessible icon buttons.

## 8. URL Strategy

Spectator TV should support shareable and restorable URLs without requiring immediate deep-link implementation in the MVP.

Planned URL shapes:

```text
/spectator
/spectator?channel=featured
/spectator?channel=blitz
/spectator?game=123
/spectator?player=username
```

Rules:

- `channel` selects a channel if known.
- `game` attempts to observe a specific FICS game number if still active.
- `player` can later attempt to find a live game involving that player.
- Unknown parameters should fail gracefully and fall back to Featured or empty state.
- URLs should not encode credentials or session-specific data.

Future share links:

- Copy link to current channel.
- Copy link to current observed game.
- Copy completed PGN link only if a future storage layer exists.

## 9. Future Reuse

Spectator TV should become the presentation layer for future live-viewing features.

### Tournament Center

Tournament Center can provide a filtered game source:

- tournament ID
- round
- board number
- player pairings

Spectator TV can render the selected game without knowing tournament-specific logic.

### Friends / Presence

Friends can provide a player-centric source:

- friends currently playing
- friends currently observing
- followed players

Spectator TV can consume these as channels or candidate filters.

### Featured Broadcasts

Featured Broadcasts can provide curated channels:

- staff pick
- community event
- top board
- educational game

The recommendation model can be bypassed by explicit editorial selection.

### Community Events

Community events can reuse:

- channel selector
- live board
- player cards
- move list
- PGN export
- future chat/sidebar components

The architectural boundary is important: event-specific discovery should feed Spectator TV; Spectator TV should not own event management.

## 10. Dependency Graph

```text
Spectator TV
  depends on Shared UI Foundation
  depends on UX Design Standards
  depends on FICS connection helpers
  depends on active game parsing
  depends on Style12 parser
  depends on board rendering
  depends on PGN helpers

FICS Client
  depends on FICS Gateway
  depends on Style12 parser

Style12 parser
  independent utility

Analyze
  optional future consumer

Opening Coach
  optional future context provider

Arena / Play / OpeningDB / GameSearch
  no direct dependency
```

Avoid circular dependencies:

- Spectator TV may call FICS helpers.
- FICS core must not depend on Spectator TV.
- Analyze must not depend on Spectator TV.
- Opening Coach must not depend on Spectator TV.

## 11. Performance Strategy

- Observe one game at a time for MVP.
- Render only changed board positions.
- Store last rendered FEN to prevent duplicate board updates.
- Limit active game list rendering.
- Use periodic game-list refresh rather than continuous polling.
- Clear observed-game state on disconnect and game switch.
- Keep raw FICS log storage outside Spectator TV.
- Avoid multiple simultaneous board instances until explicitly required.

Future scalability:

- Cache active game metadata for channel recomputation.
- Add virtualized game list only if live game volume requires it.
- Add channel-specific refresh intervals if needed.

## 12. UX Integration

Spectator TV should reuse Season 4.1 standards.

Loading:

- "Connecting to FICS..."
- "Loading live games..."
- "Opening live game..."

Empty:

- "No live game selected."
- "Choose a channel or select a game to watch."

No Results:

- "No games found for this channel."
- "Try another time control or refresh."

Error:

- "Could not load live games. Try again."
- "Could not observe this game. Choose another game."
- "FICS connection lost. Reconnect to continue."

Accessibility:

- Every icon-only control needs an accessible name.
- Channel selector must be keyboard reachable.
- Move list must remain navigable.
- Board controls need visible focus states.
- Status should not rely on color alone.

## 13. Release Plan

### 4.2A Architecture

Create and refine the Spectator TV architecture.

### 4.2B Spectator State Model

Smallest safe next implementation phase.

Deliverables:

- Spectator TV state object.
- Status/state-machine helpers.
- Channel descriptor model.
- No new full UI workflow yet.

Suggested commit:

`feat(spectator-tv): add spectator state model`

### 4.2C Game Discovery

Deliverables:

- Active game list consumption from existing FICS output.
- Channel filtering.
- Recommendation scorer for Featured.
- No board UI expansion beyond minimal diagnostics if possible.

Suggested commit:

`feat(spectator-tv): add live game discovery`

### 4.2D Featured Game MVP

Deliverables:

- Spectator TV section/page.
- Observe selected featured game.
- Render live board, players, clocks, move list, and status.

Suggested commit:

`feat(spectator-tv): add featured live game view`

### 4.2E TV Interface

Deliverables:

- Channel selector.
- Live game list.
- Manual watch controls.
- Loading/empty/no-results/error states.

Suggested commit:

`feat(spectator-tv): add channel browsing interface`

### 4.2F Player Cards

Deliverables:

- Player metadata presentation.
- Ratings, guest/computer markers, clocks, and result status.

Suggested commit:

`feat(spectator-tv): add live player cards`

### 4.2G Live Opening Context

Deliverables:

- Opening name and ECO code if available.
- Minimal opening context only.

Suggested commit:

`feat(spectator-tv): show live opening context`

### 4.2H Performance and Switching

Deliverables:

- Stale update protection.
- Redraw deduplication.
- Switch-game hardening.

Suggested commit:

`fix(spectator-tv): harden live game switching`

### 4.2I Documentation and Final Validation

Deliverables:

- User/dev documentation.
- PVS update if Spectator TV becomes part of the official release gate.
- Final validation report.

Suggested commit:

`docs: finalize Spectator TV release`

## 14. Risks

Technical risks:

- FICS `games` output may not always provide complete ratings, variants, or observer counts.
- Style12 updates from a previous observed game may arrive during switching.
- Existing FICS code may need small extraction work to avoid duplicating connection logic.

Performance risks:

- Game list refresh can become noisy if too frequent.
- Large game lists can create rendering lag.
- Board redraws can become expensive if duplicate Style12 updates are not deduplicated.

UX risks:

- Spectator TV may feel redundant with FICS Room Tables unless its broadcast purpose is clear.
- Too many channels at launch may create clutter.
- Auto-follow can surprise users if added before manual follow is stable.

FICS availability risks:

- External service availability can affect validation.
- Some channels may be empty depending on live server activity.
- Guest sessions and live-game availability are outside CAISSA's full control.

Maintenance risks:

- Duplicating FICS protocol logic would increase regression risk.
- Parser changes can affect both FICS play and Spectator TV.
- Adding analysis or coach features too early could destabilize MVP.

## 15. Validation Strategy

Unit validation:

- Channel filtering.
- Featured-game scoring.
- State transition helpers.
- Stale game update filtering if implemented.

Browser validation:

- Chrome.
- Edge.
- Firefox.
- Safari where available.
- Mobile viewport smoke.

Integration validation:

- Connect as guest.
- Load active games.
- Select Featured.
- Observe game.
- Switch games.
- Confirm board, clocks, move list, PGN, and status update.
- Disconnect/reconnect.

PVS expectations:

- Existing PVS must continue passing unchanged during early phases.
- Spectator TV should be added to PVS only after the MVP is stable.

Future PVS extension:

```text
Spectator TV .... PASS
Featured Game .... PASS
Channel Browse .... PASS
Observe Switch .... PASS
```

Manual smoke:

- Watch a standard game.
- Watch a blitz/bullet game if available.
- Switch games.
- Export PGN.
- Confirm no promotion selector while observing.
- Confirm no console errors.

## 16. Recommendation

The refined Spectator TV architecture is ready for implementation.

Recommended next phase:

**Season 4.2B - Spectator State Model**

This should be the smallest safe first implementation step. It should introduce the state machine and dynamic channel descriptors without building the full broadcast interface yet. That keeps the architecture testable, avoids UI churn, and gives later phases a stable foundation for game discovery, featured-game selection, and live board rendering.
