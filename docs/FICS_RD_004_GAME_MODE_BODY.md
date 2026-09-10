# FICS-RD-004 Active Game Mode body

RD-004 keeps the RD-002 BOARD / HEAD / BODY / FOOT shell and makes the BODY
state-dependent for `PLAYING`, `OBSERVING`, and `GAME_OVER`. The HEAD remains
exactly Tables, Players, and Seek. No lobby tab is selected while Game Mode is
primary.

## Ownership

The BODY reads a frozen `CaissaFICSPresentation` snapshot. Move notation comes
only from the canonical client's `moveHistory`; player identity, clocks, and
result come from `liveGame` through the projection. The shell does not own a
game, move, result, clock, connection, seek, board, socket, or protocol parser.

Resign, Offer Draw, Leave Observation, and PGN download call only narrow
`CaissaFICSClient` methods. The client validates the authoritative state and
command channel before sending. Successful WebSocket delivery is reported as
delivery only, never as FICS server acknowledgement. Short canonical delivery
locks suppress accidental duplicate Resign and Draw submissions.

## Move record

The move list pairs canonical entries into move-number, White, and Black
columns without synthesizing missing SAN. It owns the Game BODY's bounded
notation scroll. A changed move signature follows the latest captured move;
returning from temporary lobby browsing restores the prior scroll position
when the move signature is unchanged.

Observed history is always disclosed as locally captured and potentially
incomplete. Its PGN action is labelled `Partial PGN`. PGN is offered only when
at least one move is captured or a terminal result exists.

## Lobby navigation and terminal dismissal

Selecting Tables, Players, or Seek during a live or observed game is
presentation-only and exposes `← Game`. It sends no command, preserves the
canonical game and board, and returns to the same Game Mode projection.

`Return to Lobby` after `GAME_OVER` records only a presentation dismissal key
for that ended record. The normalized result and final moves remain in the
canonical client, while the lobby resumes normal Tables/Seek capabilities and
does not show a misleading return affordance. A new `PLAYING` or `OBSERVING`
state clears the dismissal and becomes primary automatically.

Players remains explicitly unsupported. The FOOT remains the existing
Login / Connection / Console implementation.
