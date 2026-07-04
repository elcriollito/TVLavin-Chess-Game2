# CAISSA Chess Season 4.3C - Yahoo Classic Live Lobby Integration

Status: Implemented

## Objective

Season 4.3C replaces the Yahoo Classic mock lobby content with live data from the existing CAISSA FICS infrastructure while preserving the Season 4.3B retro interface.

This phase keeps Yahoo Classic as a view. It does not create a second FICS client, open a new WebSocket, duplicate protocol parsing, or alter gateway behavior.

## Components No Longer Mocked

The following CAISSA Classic areas now render from live shared state when the existing FICS client is connected:

- Room table rows
- Waiting seek rows
- Player list rows
- Players Online count
- Tables Available count
- Browser-style status bar
- System chat/status messages

Static demo table/player names were removed from the page markup.

## Existing Services Reused

Yahoo Classic consumes:

- `window.CaissaFICSClient`
- FICS client `caissa:fics:*` events
- Existing lobby state: `activeTables` and `seekActions`
- Existing observe flow: `switchObservedGame`
- Existing join/play flow: `handleLobbyAction`
- Existing Spectator TV catalog helper: `window.CaissaSpectatorTVCatalog`

The dependency remains:

Gateway -> FICS Client State -> Live Catalog / Lobby State -> Yahoo Classic View

## Watch and Join Behavior

Playing rows expose a retro `Watch` action that calls the same observation path already used by FICS and Spectator TV.

Waiting rows expose a retro `Join` action that delegates to the existing lobby action path. No new FICS command handling was introduced.

## Chat Behavior

The chat panel remains retro and system-only. Since no safe live FICS chat integration exists for Yahoo Classic yet, this phase displays only system messages such as:

- Connected.
- Loading room...
- Receiving lobby...

No partial chat implementation was added.

## What Was Not Modified

This phase does not modify:

- FICS gateway
- FICS protocol behavior
- Style12 parser
- Spectator TV
- Replay
- PGN
- Authentication
- Play
- Arena
- Analyze
- OpeningDB
- GameSearch

## Validation Expectations

Before promotion, validate:

- Guest Login still works.
- Lobby updates still work.
- Yahoo Classic table rows update from live lobby state.
- Watch uses existing observe flow.
- Join uses existing play flow.
- Style12 updates remain unaffected.
- Reconnect clears and restores live state.
- Production Validation Suite remains PASS.
