# FICS-RD-003 Tables and Seek bodies

RD-003 keeps the RD-002 BOARD / HEAD / BODY / FOOT shell and replaces only
the Tables and Seek BODY placeholders. The BODY reads frozen snapshots from
`window.CaissaFICSPresentation`; it does not retain a lobby, game, table, or
seek store.

## Tables

Tables maps the presentation snapshot's `lobby.activeTables` fields directly:
game number, White and Black names, optional ratings, optional time control,
rated state, variant, and observer count. Missing values render as an em dash
or a plainly unknown label. The UI describes the source as a recent, capped,
heuristic feed rather than a complete FICS directory.

Observe calls only `window.CaissaFICSClient.switchObservedGame(gameNumber)`.
That existing canonical path now validates numeric game IDs, blocks replacement
of a local active game or a pending seek, suppresses concurrent duplicate
requests, preserves the supported unobserve-then-observe switch, and returns
the real WebSocket delivery result.

## Seek

All seek controls now converge on
`window.CaissaFICSClient.requestSeek(options)`. The client validates and owns
command construction, delivery, `pendingSeek`, cancellation, and errors.
Legacy preset `seek(time, increment)` remains as a compatibility wrapper.

New-form command grammar:

```text
seek <minutes 1..180> <increment 0..60> <rated|unrated> [white|black]
```

Random color omits the color token. "Casual" maps to `unrated`. A successful
WebSocket send is shown as local pending intent, not server acknowledgement.
Cancellation enters `cancel_requested`, sends `unseek` once, then refreshes the
canonical lobby. Failed create/cancel delivery remains an explicit error.

Players remains unsupported and no `who` command, directory, challenge action,
or profile action is introduced.

The RD-002 rollback remains unchanged:

```js
window.CaissaFICSShell.setEnabled(false);
```
