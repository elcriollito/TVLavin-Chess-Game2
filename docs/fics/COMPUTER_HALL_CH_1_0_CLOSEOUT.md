# Computer Hall CH-1.0

## Release record

Computer Hall CH-1.0 is released and production verified at
<https://www.caissa-chess.org/yahoo-classic>.

- Release commit: `fcac47cdebc9897b047f1f0ee683322c27685973`
- Production deployment: `dpl_6aW9hjSs8kWBZ8qu4L4pgUgAz9T3` (`READY`)
- Certified flow: Guest Login, real computer directory, `inemuri`, 3+2,
  fresh availability check, one MATCH, real game, timeout result, and Exit Table
- Visible terminal result: `inemuri wins on time — 1-0`

## Product goal

Computer Hall presents real FICS computer accounts as a simple Classic room
experience. It does not own FICS: it observes, organizes, and acts through the
existing Classic FICS runtime.

## Architecture

```text
Classic UI
  → existing CaissaFICSClient
  → existing browser WebSocket
  → FICS gateway
  → FICS
```

There is no second FICS runtime or Computer Hall-owned socket. Native CAISSA
bots and the Play V2 runtime do not cross into Classic Computer Hall.

## Classification and availability

- `(C)` is the structural evidence used to classify a FICS account as a
  computer.
- `(TD)` alone does not classify an account as a Computer Hall computer.
- `WHO_AVAILABLE` supplies challenge eligibility.
- Eligibility is validated again immediately before MATCH so stale targets are
  rejected without sending a challenge.

## Challenge flow

```text
Computer
  → Time
  → Send Challenge
  → fresh WHO_AVAILABLE
  → eligibility check
  → typed MATCH
  → FICS acceptance
  → Style12
```

Guest challenges are explicitly unrated. At most one MATCH may be pending;
Computer Hall does not poll aggressively or retry MATCH automatically.

A suitable server seek remains a separate path using `play <seekId>`. It must
not be collapsed semantically into a direct MATCH challenge.

## Gameplay and terminal model

Style12 remains the authoritative gameplay runtime. Computer Hall owns only
game initiation; Classic owns the board, moves, clocks, results, and game
lifecycle.

- Result `*` is nonterminal.
- `Game <n>: A disconnection will be considered a forfeit.` is an informational,
  future-tense advisory and is nonterminal.
- A terminal result requires authoritative FICS evidence.
- After a terminal or stuck table, Exit Table returns to the originating Classic
  room while preserving the authenticated FICS session.

## User experience

The Yahoo-inspired interface intentionally exposes only a computer selector,
approved time controls, Send Challenge, and the computer directory. Protocol
and lifecycle complexity remain behind the interface. Refreshes preserve target
selection, focus, and scroll position. Gameplay preserves player orientation,
clock ownership, responsive board geometry, and clear unrated/result labels.

## Major defects closed

CH-1.0 aligned local gateway and CSP configuration with the current transport;
corrected stretched room layout, stale availability, refresh selection resets,
and scroll/focus jumps; fixed reversed player bars, board oversizing, edge-piece
geometry, and rated/unrated presentation; and hardened result handling for
`Game finished: *`, terminal explanations, the false disconnect-forfeit Game
Over, and terminal table release through Exit Table.

The central protocol lesson is that advisory text and incomplete result markers
must not manufacture terminal state. Server-authoritative evidence remains the
boundary.

## Deferred work

### CH-1.1 — Computer Hall spectator experience

The next possible season may reuse the existing runtime:

```text
games
  → identify active games involving (C)
  → select a featured computer game
  → observe <gameNumber>
  → existing Style12 spectator runtime
  → Exit Table / unobserve
  → Computer Hall
```

A future UI could offer a Featured Computer Game and Watch Live action. Later
extensions may include Watch buttons for playing computers, Top Computer Games,
profiles through `finger`, rankings, richer activity, and featured engines.
None of this is part of CH-1.0.

Other deferred technical items:

- The generic lobby parser may still mistake a WHO footer such as
  `<n> players displayed...` for a game row.
- Authoritative real disconnect-forfeit grammar remains unmodeled until a real
  FICS terminal line is captured. Do not invent this grammar.

## Architectural freeze

Computer Hall CH-1.0 architecture is frozen. Future work must preserve:

1. one Classic FICS connection;
2. no Computer Hall-owned socket;
3. no native CAISSA bot crossover;
4. Style12 gameplay ownership;
5. typed FICS actions;
6. structural `(C)` classification;
7. fresh eligibility validation before MATCH;
8. no aggressive polling;
9. server-authoritative result semantics; and
10. the simple Yahoo-style user experience.

## CH-1.1 handoff

Start from **Featured Computer Game → Watch Live → existing `observe` → existing
Style12 → Exit Table**, with no second FICS client. Reuse first.
