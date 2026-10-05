# CAISSA Online Native v1

Status: implementation complete on `season/caissa-online-native-v1`; dormant by default; no production deployment or database migration has been performed.

CAISSA Online is a board-first, authenticated human-vs-human playing room at `/online`. It is isolated from the retired `/play` surface. The first release includes quick pairing, challenges, server-authoritative moves and clocks, reconnectable state, persistent game records, PGN download, a transparent CAISSA Elo policy, and feature-gated tournament/multiboard foundations.

## Product boundary

- Native CAISSA product: identity, records, UI, matchmaking and state live in the existing Clerk + Supabase + Vercel stack.
- Human play only. There is no engine request path in the online runtime.
- The persistent CAISSA board renderer remains presentation-only. It emits intent; it never decides legality or results.
- Chat is deliberately absent from v1. This removes a moderation surface while gameplay is stabilized.
- Tournament creation, spectators and multiboard are schema/domain foundations behind flags, not public promises.

## Documents

- [Architecture and decisions](architecture.md)
- [Protocol and state model](protocol.md)
- [Data model](data-model.md)
- [Operations, rollout and rollback](operations.md)
- [Testing and QA](testing.md)
- [Threat model](../security/CAISSA_ONLINE_THREAT_MODEL.md)

## Local entry points

```text
npm run lint:online
npm run test:online
npm run test:online:browser
CAISSA_ONLINE_ROLLOUT=preview npm start
```

The local server binds to loopback by default. A real two-account test additionally needs Clerk and Supabase development credentials plus the unapplied migration.

Release posture: code-complete preview candidate, but **NO-GO for production** until the database migration, Clerk/Supabase authorization, private Realtime denial and concurrent two-account flows pass in a non-production environment.
