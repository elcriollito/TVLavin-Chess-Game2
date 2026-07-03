# CAISSA Chess UX Design Standards - Season 4

This document defines the UX standards for Season 4 and future CAISSA Chess development. It applies across the full application, including Play, FICS, Analyze, Arena, OpeningDB, GameSearch, and planned modules such as Spectator TV, Tournament Center, Friends / Presence, Live Opening Coach, and classic visual themes.

## 1. Design Philosophy

CAISSA should feel like a serious chess workspace: fast, clear, stable, and comfortable during long sessions.

- **Consistency over novelty:** New pages should reuse established CAISSA patterns instead of inventing one-off layouts.
- **Fast recognition:** Users should immediately understand whether they are playing, observing, analyzing, searching, waiting, or disconnected.
- **Low cognitive load:** Show only what matters now. Reveal advanced controls progressively.
- **Stable layouts:** Boards, panels, move lists, and lobby tables should not jump, resize unexpectedly, or overlap when content changes.
- **Keyboard-friendly:** Chess review, navigation, dialogs, and common workflows should support keyboard use.
- **Mobile-first resilience:** Mobile layouts may stack, but must remain complete, scrollable, and usable.
- **Accessibility-first:** Color must never be the only meaning. Controls need labels, focus states, and sufficient contrast.
- **Minimal clicks:** Common actions like connect, watch, analyze, navigate moves, copy PGN, and retry should be obvious and quick.
- **Production calm:** CAISSA should avoid noisy UI, excessive animations, error spam, and unstable experimental patterns.

## 2. Visual Hierarchy

### Page Titles

Use page titles for major sections only:

- Play
- Analyze
- FICS
- Arena
- Opening Database
- GameSearch

Titles should be concise and should not compete with board or game content.

### Section Headers

Panel headers should be short and functional:

- Evaluation
- Moves
- Opening Book
- Opening / Coach
- Room Tables
- Game Info
- Critical Moments
- Review Summary

Avoid long explanatory headers.

### Cards

Cards should be used for repeated or grouped items:

- Lobby rows only if table layout is not suitable
- Game search results
- Critical moments
- Opening result summaries
- Future tournament entries

Cards should not be nested inside other cards.

### Panels

Panels are persistent work areas:

- Move list
- Evaluation
- Opening Coach
- FICS console
- Room Tables
- Analyze Mentor
- Arena controls

Panels should have stable width and height constraints. Long content should scroll internally instead of expanding into adjacent layout areas.

### Dialogs

Dialogs are for focused decisions:

- New Game
- Promotion selection
- Confirm resignation
- Future tournament join confirmation

Dialogs should trap focus, support Escape where safe, and clearly distinguish primary and cancel actions.

### Badges

Badges should be compact and meaningful:

- Beta
- Connected
- Guest
- Registered
- Observing
- Playing
- Engine `(C)`
- Depth limit
- Offline

Avoid large decorative badges that disrupt dense chess layouts.

### Notifications

Use notifications sparingly.

Prefer inline status messages for persistent states. Use toasts only for short-lived confirmations:

- PGN copied
- Game loaded
- Seek created
- Analysis complete

### Toolbars

Toolbars should group related commands:

- Move navigation
- Board controls
- Analyze actions
- FICS connection controls

Toolbar buttons should have consistent sizing, icons where appropriate, and accessible labels.

### Board Containers

Boards are the visual center of CAISSA.

Standards:

- Board remains visually stable.
- Eval bar stays attached to the board.
- Player bars align with board width.
- Graphs under board should match board width.
- Side panels must not push or overlap board.
- Mobile should preserve the full board without clipping.

## 3. Status System

CAISSA should use a shared status language.

### Core Statuses

- **Loading:** Something is being fetched, initialized, or calculated.
- **Success:** An action completed.
- **Information:** Neutral guidance or context.
- **Warning:** Something needs attention but is not fatal.
- **Error:** Something failed and requires user action or retry.
- **Offline:** Network or service unavailable.
- **Connecting:** A connection attempt is active.
- **Connected:** User is connected and ready.
- **Observing:** User is watching a game and cannot move.
- **Playing:** User is actively in a game.
- **Searching:** Query or game lookup is in progress.
- **No Results:** Search completed but found nothing.
- **Empty:** No content exists yet.
- **Disabled:** Control is intentionally unavailable.
- **Beta:** Feature works but is still under validation.

### Color Guidance

- Success: green
- Information: blue or neutral
- Warning: yellow or orange
- Error: red
- Disabled: muted gray
- Beta: subtle accent
- Playing: active green
- Observing: blue or neutral
- Offline: muted or red

Every color-coded state should also have text, tooltip, or accessible label.

## 4. Messaging Standards

Messages should be short, friendly, and actionable.

### Loading Messages

Use:

- "Loading games..."
- "Connecting to FICS..."
- "Analyzing moves..."
- "Loading opening data..."

Avoid:

- "Please wait while asynchronous operation completes."
- "Fetching resource from endpoint."

### Error Messages

Use:

- "Could not fetch games. Try again or upload PGN manually."
- "FICS connection lost. Reconnect to continue."
- "Engine did not respond. Try again."

Avoid raw technical messages unless placed in a developer or debug area.

### Success Messages

Use:

- "Game loaded."
- "Analysis complete."
- "PGN copied."
- "Connected as GuestABCD."

### Empty States

Use:

- "No games loaded yet."
- "Connect to FICS to view room tables."
- "No moves available for this position."
- "Opening guidance not available yet."

### Confirmation Dialogs

Confirm destructive or irreversible actions:

- Resign
- Clear board
- Leave game
- Cancel active seek
- Stop match

### Beta Notices

Beta labels should be calm and precise:

- "Registered FICS Login Beta"
- "This login mode is still being validated."

Do not over-warn users for stable beta workflows.

### Connection Messages

Use consistent phrasing:

- "Disconnected"
- "Connecting..."
- "Connected as GuestABCD"
- "Logged in as USERNAME"
- "Observing game #123"
- "Playing game #123"
- "Reconnect required"

## 5. Interaction Standards

### Buttons

Buttons should clearly express action.

Primary examples:

- Start Game
- Analyze Game
- Connect
- Watch
- Sit
- Apply FEN

Secondary examples:

- Cancel
- Refresh
- Copy PGN
- Flip Board

Danger examples:

- Resign
- Disconnect
- Clear Board
- Cancel Seek

### Primary Actions

Each panel should have one obvious primary action. Avoid multiple competing primary buttons in the same visual group.

### Secondary Actions

Secondary actions should be visible but less visually dominant.

### Danger Actions

Danger actions require clear wording and, where appropriate, confirmation.

### Links

Internal navigation changes the app section. External links open in a new tab and should include accessible text or title.

### External Links

Use consistent behavior:

- `target="_blank"`
- `rel="noopener noreferrer"`
- Clear label or tooltip

Examples:

- Help Videos
- Wikibooks
- Contact / Feedback

### Keyboard Shortcuts

Keyboard shortcuts should:

- Avoid firing while typing in inputs.
- Use existing visible controls.
- Update board, move highlight, mentor, and eval state together.
- Be documented subtly if needed.

### Hover States

Hover should clarify interactivity, not reveal essential information only.

Critical information like time control, action buttons, and status must always be visible.

### Focus States

Every interactive element needs a visible focus state.

Focus must be especially clear in:

- Dialogs
- FICS lobby
- Move lists
- Board controls
- Navigation

### Disabled Controls

Disabled controls should explain why when possible.

Examples:

- "Connect to FICS first."
- "Cannot move while observing."
- "Analysis unavailable."

### Tooltips

Use tooltips for compact controls and status icons.

Tooltips should be short:

- "Computer / engine account"
- "Observe game"
- "Cancel seek"
- "Flip board"

## 6. Accessibility Standards

### Keyboard Navigation

Users should be able to:

- Navigate sidebar links.
- Operate dialogs.
- Use move navigation.
- Trigger primary actions.
- Close modals with Escape when safe.
- Move through lobby actions.

### ARIA Labels

Required for:

- Icon-only buttons
- External links
- Status LEDs
- Promotion choices
- Board controls
- Sound toggle
- Move navigation buttons

### Focus Order

Focus should follow visual order:

1. Navigation
2. Page controls
3. Board controls
4. Side panels
5. Footer or secondary links

Dialogs should trap focus until closed.

### Color Independence

Color cannot be the only signal.

Examples:

- FICS lobby LEDs need title or aria labels.
- Analysis annotations need symbols or text.
- Error states need icons or text, not just red.

### Contrast

All text must meet readable contrast standards, especially:

- Modal buttons
- Disabled controls
- Dark panels
- FICS lobby rows
- Sidebar links
- Mobile controls

### Screen Reader Considerations

Live status changes should use polite announcements where practical:

- Connected
- Disconnected
- Analysis complete
- Game loaded
- Move rejected
- Promotion canceled

### Touch Targets

Interactive controls should be comfortable on mobile:

- Minimum practical touch target: about 44px where layout allows.
- Avoid tiny action buttons in dense tables on mobile.
- Stack table actions when necessary.

## 7. Responsive Guidelines

### Desktop

Desktop may use multi-column layouts:

- Left controls
- Center board or workspace
- Right info panel

Board remains the anchor.

### Tablet

Tablet layouts may compress side panels or stack below the board. Avoid horizontal overflow.

### Mobile

Mobile should stack:

1. Primary board or content
2. Main controls
3. Secondary panels
4. Console or details

No essential controls should be hidden off-screen.

### Panel Collapsing

Panels may collapse or stack, but should not disappear unless there is a clear way to reopen them.

### Sidebar Behavior

Sidebar should remain predictable:

- Same order across desktop and mobile.
- External links stay external.
- Active section remains clear.

### Board Scaling

Boards should:

- Fit viewport width.
- Avoid clipping.
- Keep eval bars and player bars aligned.
- Preserve move controls below or near board.

### Overflow Handling

Use internal scrolling for long content:

- Move lists
- FICS console
- Room Tables
- Opening lines
- Analysis details

Avoid body-level horizontal scrolling.

## 8. Shared Component Standards

Season 4 should prefer shared UI patterns.

### Status Badge

For compact state labels:

- Beta
- Connected
- Guest
- Registered
- Observing
- Playing

### Loading Spinner

Used consistently for data fetches and analysis.

### Empty State Panel

Standard pattern:

- Short title
- One sentence
- Optional action button

### Error Banner

For recoverable failures:

- Friendly message
- Retry or fallback action
- Optional detail toggle if needed

### Toast Notification

For temporary success messages:

- PGN copied
- Game loaded
- Seek canceled

### Modal Dialog

For focused user decisions.

### Panel Header

Standard header with title and optional right-side action.

### Info Card

For summaries:

- Review Summary
- Opening details
- Game metadata
- Future tournament info

### Confirmation Dialog

For destructive or session-changing actions.

### Section Divider

Use sparingly to separate dense groups.

### Progress Indicator

For:

- Analyze progress
- Long imports
- Engine initialization
- Future tournament loading

## 9. UX Governance

Season 4 development rules:

- No page invents its own loading state.
- No page invents its own error wording.
- No duplicated interaction patterns unless justified.
- Shared components before custom components.
- One feature per phase.
- One phase per commit.
- PVS remains the release gate.
- Accessibility is part of completion, not a later cleanup.
- Mobile behavior must be considered before commit.
- External links must be safe and consistent.
- Critical information must not be hover-only.
- Color-only meaning is not acceptable.
- Stable layout is required before visual polish.
- Production reliability beats visual novelty.

## 10. Future Compatibility

These standards should support future features without redesign.

### Spectator TV

Needs:

- Clear observing state
- Game cards or table rows
- Watch actions
- Stable board layout
- Player metadata
- Live status badges

### Tournament Center

Needs:

- Tables
- Status badges
- Empty and loading states
- Confirmation dialogs
- Responsive brackets or lists

### Friends / Presence

Needs:

- Online and offline states
- Compact user rows
- Status indicators with text
- Non-intrusive notifications

### Live Opening Coach

Needs:

- Progressive disclosure
- Short guidance
- Source links
- Loading and fallback states
- No board layout movement

### Yahoo Chess Classic Theme

Needs:

- Stable lobby and table standards
- Compact player rows
- Clear Sit and Watch actions
- Classic styling without changing behavior

### BabasChess Theme

Needs:

- Compact metadata
- `(C)` computer markers
- Dense but readable tables
- Clear game and session state

## Season 4 UX Rule Of Thumb

If a new feature cannot clearly answer these questions, it is not ready to implement:

- What state is the user in?
- What can the user do next?
- What happened if something failed?
- Can the user use it by keyboard?
- Does it work on mobile?
- Does it follow existing CAISSA patterns?
- Does it preserve board and layout stability?
