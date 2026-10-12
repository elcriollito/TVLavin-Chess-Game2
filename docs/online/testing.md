# Testing and QA

## Automated gates

```text
npm run lint:online
npm run test:online
npm run test:online:browser
npm run lint:board
npm run test:board:unit
npm run test:navigation
npm run release:public:audit
```

The online unit suite covers protocol validation, ordinary and illegal moves, wrong-turn and stale-version rejection, castling, en passant, underpromotion, checkmate, server clock expiration including no-mating-material draws, resignation, draw acceptance, rematch authorization, durable replay, shared limiting, deterministic rating, matchmaking expansion, client clock projection, multiboard selection, migration RLS/RPC/concurrency contracts, API authority boundaries and route isolation. Browser tests cover signed-in pairing, real board input, canonical acknowledgement, mobile layout and serious/critical axe findings.

## Manual two-account matrix

- Pair two different Clerk accounts in every time control; verify random colors and a five-second start grace.
- Attempt out-of-turn, repeated and stale-version moves; the canonical board must recover.
- Exercise castling both sides, en passant, all four promotion choices, mate, stalemate, repetition and insufficient material.
- Background and resume each browser; disable WebSocket transport and confirm polling recovery.
- Refresh both clients while queued, during each side's turn and after completion.
- Cross the time boundary while both clients are disconnected; next state read must finalize timeout once.
- Offer, decline and accept draws; attempt acceptance without an opposing offer.
- Resign behind confirmation. Verify final PGN and Analyze handoff.
- Repeat a command with the same event ID; verify no duplicated move/rating.
- Challenge, accept, decline and let a challenge expire.
- Verify mobile portrait, reduced motion, keyboard board input and screen-reader labels.
- Submit simultaneous queue joins and challenge acceptance for the same accounts; at most one active game may exist per participant.
- Verify unexpected Clerk `azp`/origin values, direct authenticated RPC calls and non-participant private-topic subscriptions are rejected.

## Performance targets for preview

- p95 command response under 500 ms in the deployment region.
- p95 opponent update visible under 750 ms with Realtime and under 2.5 s on polling fallback.
- No unbounded DOM growth: board nodes persist; move list is bounded by one game.
- Queue and presence cleanup queries use partial/expiry indexes.

The repository-wide `test:play:unit` baseline has unrelated failures already present on the clean upstream base; see the branch handoff rather than treating those as regressions from `/online`.

The SQL migration still requires `supabase db lint` and an apply/rollback rehearsal against a running isolated database. Static SQL-contract tests are useful guardrails, not substitutes for that gate.
