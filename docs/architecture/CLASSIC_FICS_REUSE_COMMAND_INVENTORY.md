# Classic FICS reuse command inventory

> REUSE FIRST / EXTEND SECOND / BUILD LAST

Status: CH-0.3R2 offline audit. The existing `CaissaFICSClient` remains the only socket, authentication, parser, lobby and game-runtime owner. `ClassicFicsObservability` remains read-only. `ClassicFicsResearchActions` is an OFF-by-default, one-shot command boundary over that existing authenticated client; it does not connect, authenticate, parse, retry or persist.

| FICS capability | Existing Classic evidence | R2 disposition |
| --- | --- | --- |
| `who`, `who f`, `who a` | No product path or parser. Generic authenticated `send` exists. | Typed research-only actions added; semantics remain live-unverified. |
| computer-specific `who` filters | No repository or captured protocol evidence. | Not implemented or sent. |
| `sought` | Existing lobby refresh and seek parser/rendering. | Reuse; no R2 send. |
| `play <seekId>` | Existing lobby action enters a server seek. | Reuse; no R2 send. |
| `match` | Laboratory builder only; no Classic typed product action. | Gap; do not send to populate `pending`. |
| `pending` | No product path or parser. Generic authenticated `send` exists. | Typed research-only action added; semantics remain live-unverified. |
| `accept`, `decline`, `withdraw` | No Classic command path or parser found. | Audited gap only; not implemented or sent. |
| `games` | Existing lobby refresh, active-game parser and observer handoff. | Reuse. |
| `finger`, `allobservers` | No current Classic capability found. | Future research only. |
| `variables`, `set`, `open` | Authentication bootstrap uses fixed `set style 12` and interface commands; no general typed research surface. | No R2 expansion. |
| `observe`, `unobserve` | Existing active-table watch and observation lifecycle. | Reuse. |

## R2 safety contract

The only allowlisted research commands are `WHO`, `WHO_FREE`, `WHO_AVAILABLE`, and `PENDING`. Each requires a fresh explicit in-memory authorization after an authenticated Classic session exists, arms the post-auth observer, permits exactly one send through `CaissaFICSClient.send`, has no retry, and cannot be sent twice by one action instance. Any wrong, concurrent, repeated or unlisted action fails closed. The boundary owns no WebSocket and offers no `match`, seek, play, accept, decline, withdraw, configuration or raw-console action.

No live protocol claim is made by this offline artifact. A separately authorized controlled session must release this code first, authenticate through the normal Classic UI, verify the controlled account, and approve each individual command. `pending` must be observed without manufacturing an offer or public challenge.
