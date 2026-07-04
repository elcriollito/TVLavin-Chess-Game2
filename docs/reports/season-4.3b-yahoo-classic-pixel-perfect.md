# CAISSA Chess Season 4.3B - Yahoo Classic Pixel Perfect Recreation

Status: Implemented

## Objective

Season 4.3B refines the CAISSA Classic page into a more faithful late-1990s and early-2000s internet chess lobby experience.

This remains a new standalone CAISSA page. It is not a global theme, not a skin, and not a live FICS integration phase.

## Branding Boundary

The page uses original CAISSA branding:

- CAISSA Classic
- Retro Internet Chess Lounge
- Coyote Gulch as demo room data

The implementation does not use Yahoo logos, Yahoo assets, or registered Yahoo imagery. The visual language is period-inspired rather than asset-derived.

## Visual Direction

Season 4.3B intentionally moves the page closer to:

- Windows 98
- Windows 2000
- Internet Explorer 5
- Classic internet chess lobbies
- Compact table-based game rooms

The design emphasizes dense information, beveled panels, classic buttons, small typography, table grids, IRC-style chat, and browser/status-bar framing.

## Official Classic Palette

The isolated stylesheet defines the Season 4.3B palette as scoped CSS variables:

- Classic Beige: `#d6cfad`
- Classic Olive: `#767d56`
- Classic Gray: `#c0c0c0`
- Classic Blue: `#003399`
- Classic Purple: `#5c3f8f`
- Status Orange: `#d78018`
- Panel White: `#fffdf0`
- Border Gray: `#606060`

These colors are scoped to the Yahoo Classic page and do not affect other CAISSA modules.

## Components Refined

Season 4.3B refines:

- ClassicHeader
- ClassicSidebar
- ClassicTableList
- ClassicPlayerList
- ClassicChatPanel
- ClassicStatusBar

## UX Decisions

- The header now uses a classic gradient and beveled treatment.
- Buttons use Windows 98 style raised, hover, pressed, and focus states.
- The table list now uses compact columns: Table, White, Black, Watching, Game, Time, and Status.
- The player list uses compact retro indicators instead of modern icons.
- The chat area uses small fixed-width text and a disabled classic Send button.
- The bottom status bar now reads like a browser-era status strip.
- Scrollbars are visually adjusted to resemble classic desktop UI where supported.

## Responsive Behavior

The page remains desktop-first. On narrower screens, the layout stacks while preserving the retro identity and avoiding horizontal overflow outside the intended table scroll area.

## Non-Goals

This phase does not:

- Connect to FICS.
- Modify the FICS gateway.
- Modify FICS protocol or Style12 behavior.
- Modify Spectator TV.
- Modify PGN, replay, authentication, Play, Arena, Analyze, OpeningDB, or GameSearch.
- Add live table actions.
- Add real chat.
- Add gameplay.

## Validation Expectations

Before promotion, validate:

- `/yahoo-classic` loads.
- Sidebar navigation opens Yahoo Classic.
- Retro layout renders without console errors.
- Desktop, tablet, and mobile smoke tests pass.
- Existing production pages remain unchanged.
- Production Validation Suite remains PASS.
