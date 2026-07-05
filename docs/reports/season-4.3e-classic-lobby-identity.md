# CAISSA Chess Season 4.3E - Classic Lobby Identity

Status: Implemented

## Objective

Season 4.3E shifts the retro lounge from feeling like a Yahoo-era recreation into a distinct CAISSA Classic experience.

The goal is to preserve nostalgia while making the product identity clearly CAISSA.

## Identity Changes

Visible user-facing copy now emphasizes:

- CAISSA Classic
- CAISSA Lobby
- Current Room: CAISSA Lobby

Legacy demo room naming was removed from the visible lobby.

## Room System

This phase introduces a visual room system only. No routing, filtering, FICS commands, or room logic was added.

Rooms shown:

- CAISSA Lobby
- Beginner Hall
- Casual Room
- Blitz Room
- Rapid Room
- Masters Lounge
- Tournament Hall
- Spectator Gallery
- Computer Lounge

The room system is designed to give the lobby a stronger CAISSA identity while leaving future integration open.

## UX Decisions

- The header now presents the current room prominently.
- The sidebar includes a compact room directory.
- The table header reports Current Room, Players Online, and Active Tables.
- Table rows use small classic chips such as Rated, Casual, Blitz, Rapid, Private, and Observed.
- Player rows can display compact Guest, Registered, Computer, and Observing badges.
- The status bar reports useful CAISSA Lobby context such as connected state, room state, table state, active tables, and players.

## Branding Approach

CAISSA Classic keeps:

- Windows 98 / Windows 2000 visual language
- Beveled panels
- Compact table density
- Retro typography
- Classic chess-lounge mood

But the primary room identity is now CAISSA Lobby rather than a borrowed or demo room identity.

## What Was Not Modified

This phase does not modify:

- FICS gateway
- FICS protocol behavior
- Style12
- Replay
- PGN
- Authentication
- State model
- Spectator TV
- Analyze
- Arena
- OpeningDB
- Watch / Join behavior
- Move history logic
- Clock logic
- Board model

## Validation Expectations

Before promotion, validate:

- CAISSA Classic appears in navigation.
- CAISSA Lobby appears as the current room.
- Room directory is visual only.
- Lobby tables still update from existing FICS state.
- Watch / Join continue to use existing core flows.
- Production Validation Suite remains PASS.
