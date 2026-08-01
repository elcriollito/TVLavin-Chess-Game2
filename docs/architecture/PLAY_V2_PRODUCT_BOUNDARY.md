# CAISSA Native Play Experience — Product Boundary

Status: **Season 11 architectural constraint**

Applies to: **Play v2 / CAISSA Native Play Experience**

Product principle: **Enter. Choose. Play.**

## Purpose

Play is for playing chess. Its primary surface begins with a game choice, keeps the board dominant, supports the game through completion, and then offers only continuations of that completed game. Play v2 is not a lobby for another provider, a social-network preview, or an education dashboard.

## Required Play v2 surface

The Play v2 beta may contain:

- local Games and production-certified CAISSA-native Bots;
- board, players/opponent header, legal move interaction, clocks, game status, fair-play-safe evaluation, game controls, and lifecycle recovery;
- a concise PostGame result and actions for Rematch, New Game, PGN, Analyze, and optional Mentor review;
- explicit beta status, feedback, support, privacy, and exit-to-current-Play controls.

Every item must serve entering, choosing, playing, completing, or continuing the just-completed game.

## FICS prohibition

FICS is prohibited inside Play v2. It must not be a provider, fallback, lobby, player source, identity source, rating source, presence source, matchmaking source, challenge system, clock authority, game authority, reconnect authority, recommendation, or escape action.

The Play v2 route, shell, mode registry, lazy-load graph, runtime globals, copy, tests, feedback payload, and beta documentation must contain no FICS integration or product reference. A generic fair-play rule that safely denies assistance for externally sourced records may live in a provider-neutral shared boundary, but Play v2 must not enumerate or load FICS-specific code.

FICS remains available only in CAISSA Classic and Legacy FICS. Removing FICS-specific code from the Play v2 graph must not delete or alter those products or their independent runtime ownership.

## Educational-surface prohibition

The primary Play v2 experience must not contain or promote:

- classes, lessons, Academy, curriculum, Knowledge Units, learning paths, or training recommendations;
- Endgame Trainer, Endgame Library, Endgame Practice, or other endgame-training surfaces;
- instructional Coach cards, teaching profiles, learning goals, concept-study links, guided lessons, or educational promotional cards.

The current Coach mode is educational by design and is therefore outside the public Play v2 product boundary. It must not be exposed, prefetched, or lazy-loaded by the beta route. Educational code may remain for products outside Play v2 provided it is absent from the Play v2 runtime graph and user interface.

## Analyze boundary

Analyze is an external post-game continuation. Play v2 may create a bounded, opaque, same-game handoff only after a game is completed. Analyze owns its own board, chess state, engine requests, navigation, and resource lifecycle. It is not a Play tab, in-game assistance surface, or educational promotion. Returning from Analyze must restore the completed Play session without sharing mutable runtime state.

## Mentor boundary

Mentor is optional post-game review of the completed game. It requires an explicit user action and must fail safely without blocking Rematch, New Game, PGN, or Analyze. No automatic review, training recommendation, Academy selection dependency, curriculum link, Knowledge Unit link, lesson card, mastery claim, or silent learning-state write may appear in Play v2.

Any Mentor presentation retained for the beta must use review language, remain subordinate to PostGame, and be separable from educational pipelines. If that separation is not complete, Mentor remains disabled for the beta.

## Players boundary

Players must remain blocked until CAISSA-native infrastructure exists. A public Play v2 beta must not display a Players tab, coming-soon lobby, provider bridge, fake presence, sample identities, ratings, challenges, matchmaking, or FICS/Classic handoff.

Activation requires CAISSA-owned accounts and identity, profiles, presence, challenges, matchmaking, authoritative games and clocks, reconnect/recovery, ratings/history, fair-play enforcement, moderation, reporting, privacy controls, abuse operations, and service observability. No fictitious network may substitute for these capabilities.

## Production and release invariants

- `/` remains CAISSA Classic.
- `/play` remains Legacy Play until a separate, authorized migration.
- Public beta is explicit opt-in and reversible; QA access remains separate.
- Players and educational modes remain absent from the beta.
- Analytics transport remains disabled. Beta feedback must be explicit user submission and must not silently attach identity, moves, PGN, FEN, Mentor content, or exact behavioral telemetry.
- Public-beta activation, route changes, Worker configuration, deployment, and rollback are separate implementation/release tasks.

## Acceptance rule

A change belongs in Play v2 only when it directly supports **Enter. Choose. Play.**, the active game, or a bounded continuation of the completed game, and when it introduces neither a FICS dependency nor an educational product surface. Ambiguous features default to outside the boundary.
