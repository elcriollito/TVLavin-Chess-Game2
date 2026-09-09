# CAISSA Product UI Pattern --- Board + Interactive Workspace

**Status:** Preferred CAISSA product-design pattern\
**Owner:** CAISSA Chess / Alexander Lavin\
**Purpose:** Give Codex and future contributors a reusable visual and
architectural baseline for chess-tool pages.

------------------------------------------------------------------------

## 1. Core Preference

When a CAISSA page is centered on an interactive chessboard, strongly
prefer this composition unless the product genuinely requires another
layout:

**Large chessboard on the left + one interactive workspace column on the
right.**

The board is the visual protagonist. The right side is not a pile of
independent technical panels; it is a single workspace whose content
changes according to tabs, modes, or the user's current task.

Conceptually:

``` text
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│       LARGE BOARD                 INTERACTIVE WORKSPACE       │
│                                                              │
│   ┌───────────────────┐         ┌─────────────────────────┐   │
│   │                   │         │ HEAD                    │   │
│   │                   │         │ title / primary tabs    │   │
│   │      CHESSBOARD   │         ├─────────────────────────┤   │
│   │                   │         │ BODY                    │   │
│   │                   │         │ contextual content      │   │
│   │                   │         │ changes with tabs/mode  │   │
│   └───────────────────┘         ├─────────────────────────┤   │
│                                 │ FOOT                    │   │
│                                 │ navigation / actions    │   │
│                                 └─────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

## 2. The Three Wraps

The right workspace should normally be organized into three clear
ownership regions.

### HEAD

Stable context and navigation.

Typical contents: - page/workspace title; - 2--4 primary tabs; - compact
mode/status controls when necessary.

The HEAD should remain visually stable while BODY content changes.

### BODY

The only main contextual work area.

Typical examples: - Analysis: engine lines + notation; - Games: Game URL
/ Chess.com / Lichess; - Setup Position: piece palette + FEN + PGN
Paste; - future tools: their task-specific controls.

Prefer **one BODY scroll owner**. Avoid nested scrollbars and stacked
technical cards unless they genuinely improve comprehension.

### FOOT

Persistent navigation and high-level actions.

Typical contents: - First / Previous / Next / Last; - New; - Save; -
Review; - More (`•••`).

FOOT should feel attached to the workspace and remain readable. Disabled
controls may be subdued, but must not become invisible.

------------------------------------------------------------------------

## 3. Interaction Philosophy

Prefer interfaces that are understandable at a glance.

Use **progressive disclosure**: - show what the current task needs; -
hide secondary systems until they are relevant; - changing tabs should
replace BODY content rather than add more columns.

Do not expose implementation concepts such as workers, internal state
owners, debug data, technical calibration, or redundant status cards to
normal users.

A powerful chess tool may be technical without looking cluttered.

------------------------------------------------------------------------

## 4. Board Interaction

Where direct manipulation makes sense, prefer physical chess
interaction:

-   drag pieces naturally with mouse/pointer;
-   piece visually follows the user's hand/cursor;
-   clear grab/grabbing feedback;
-   subtle destination-square feedback;
-   snap or snapback;
-   tap/click fallback for touch/accessibility where useful.

Keep domain semantics separate:

**Analysis mode** - legal chess moves; - updates authoritative
game/history; - notation and engine follow the resulting position.

**Setup mode** - arbitrary piece placement; - updates only a temporary
setup draft; - does not create move history; - commits only when the
user explicitly loads/confirms.

The visual gesture may be similar; the domain ownership must remain
different.

------------------------------------------------------------------------

## 5. One Authoritative Owner per System

Visual redesign must never create parallel chess systems.

Preserve a single authoritative owner for each: - Chess/game state; -
board; - PGN; - FEN/session; - move history; - navigation/review
cursor; - engine lifecycle; - evaluation pipeline.

A new UI should be a **new body/car body over existing trusted
machinery**, not a duplicate engine underneath.

Before changing shared logic:

**READ → AUDIT → MAP OWNERSHIP → VISUALIZE → PLAN → IMPLEMENT**

------------------------------------------------------------------------

## 6. Visual Hierarchy

Preferred qualities:

-   board large and dominant;
-   right workspace narrower but comfortable;
-   strong local contrast;
-   minimal unnecessary borders/cards;
-   compact controls;
-   clear active tab;
-   generous enough spacing to establish visual groups;
-   avoid making every item equally prominent.

Use proximity deliberately. For example, a principal engine line can be
separated by a small visible gap from secondary MultiPV lines so the eye
instantly reads:

``` text
BEST / PRIMARY LINE

alternative
alternative
alternative
```

A subtle gap is often better than another heavy container.

------------------------------------------------------------------------

## 7. Contrast

CAISSA dark interfaces must remain readable.

Especially verify: - black pieces against dark palette backgrounds; -
white pieces against light/dark local surfaces; - button labels; -
disabled actions; - secondary text; - input borders/backgrounds; -
footer navigation; - selected/hover states.

**Disabled does not mean invisible.**

Use hierarchy, not illegibility.

------------------------------------------------------------------------

## 8. Responsive Geometry

Do not solve responsiveness with CSS zoom.

Prefer real geometry and explicit ownership: - `min-width: 0`; -
`min-height: 0`; - one scroll owner per region; - avoid nested
scrolling; - preserve board priority; - adapt workspace geometry
deliberately.

Important CAISSA QA targets commonly include: - 1600×1000; - 1366×768; -
885×611 when relevant; - 390×844; - Chromium; - WebKit.

Desktop board-first quality should not be sacrificed by prematurely
compressing everything for mobile.

------------------------------------------------------------------------

## 9. Product Inspiration

It is acceptable to study mature chess products such as Chess.com,
Lichess, Chessify, and others for: - interaction conventions; -
information hierarchy; - drag behavior; - analysis ergonomics; -
progressive disclosure.

Do **not** clone another product's identity.

Borrow proven human-interface ideas, then express them in CAISSA's
visual language.

------------------------------------------------------------------------

## 10. Default Codex Decision Rule

When starting a new board-centered CAISSA page, Codex should first ask:

1.  Can the board be the dominant left region?
2.  Can all contextual tools live in one right workspace?
3.  What are the primary tabs?
4.  What belongs in HEAD, BODY, and FOOT?
5.  Who owns board/game/engine/PGN/FEN state already?
6.  Can existing trusted owners be reused rather than rebuilt?

Unless requirements say otherwise, prototype this pattern before
proposing multi-column technical dashboards.

------------------------------------------------------------------------

## 11. Reference Implementation

The preferred reference is **CAISSA Analyze V2 (2026 redesign)**.

Key lessons: - new visual shell over existing authoritative core; -
large board left; - one workspace right; - tab-driven BODY; -
HEAD/BODY/FOOT ownership; - minimal Analysis presentation; - Setup
Position as a dedicated contextual workspace; - Games as a dedicated
contextual workspace; - direct physical piece drag; - engine and
notation synchronized to the same position; - functionality preserved
while visual clutter is removed.

Use Analyze V2 as a **design pattern**, not as code to copy blindly.

------------------------------------------------------------------------

## 12. Anti-Patterns

Avoid by default: - board + two or three competing side columns; -
multiple independent scroll panels; - duplicated tabs in body and
header; - giant technical cards for simple controls; - a second Chess
instance just for a new UI; - multiple Stockfish workers for
presentation purposes; - duplicated PGN/FEN authorities; - CSS override
piles on legacy layouts; - controls so dim they appear broken; -
implementing future features merely because the code is nearby.

------------------------------------------------------------------------

**CAISSA DESIGN PRINCIPLE**

> Keep the board dominant, keep the workspace singular, keep the task
> contextual, and keep ownership authoritative.
