# Open games: contract boundary

The current CAISSA Online state contract does not expose public games that another player may join. `caissa_online_private.game_state(text)` returns only:

- the caller's active matchmaking ticket;
- the caller's active game;
- the caller's 12 most recent games;
- current presence rows; and
- directed, unexpired challenges involving the caller.

The **History** view is therefore backed only by `recentGames`. The **Open games** view is a separate, explicit empty state. It must not reinterpret history, presence, matchmaking tickets, active games, or directed challenges as public join opportunities.

## Separate future scope

Supporting joinable open games requires a separately reviewed backend contract and migration. At minimum that work must define:

1. an explicit public-offer lifecycle (open, joined, cancelled, expired);
2. a service-role RPC that returns only offers intended for discovery;
3. an atomic join RPC that prevents a user or offer from producing multiple active games;
4. expiry, rate limiting, indexes and concurrency behavior;
5. RLS and grants that do not reveal private games, directed challenges, Clerk subjects or participant-only records; and
6. protocol fields and browser tests that distinguish public offers from personal history.

No part of that backend expansion is included in the current UI preparation.
