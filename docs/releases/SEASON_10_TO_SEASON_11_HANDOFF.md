# Season 10 to Season 11 Handoff

## Authoritative baseline

- Production source: `7cec9ea60289d32435849ffde736041f739126d6` on `origin/main`.
- Local verification source: `543f4691e3624d8093153e35292f49a9fbba29e3`.
- Closure commit policy: one local commit, `docs(play): close season 10`; do not push or deploy.
- Production deployment: `dpl_7V8f2vKBhjHbub5hAz5kQ7yeK8Pt`, READY.
- Rollback deployment: `dpl_2izmq53NpdJ4hneQoLfwPgrRfaUG`, READY; use only with authorization.
- Release: `10.0.0`; ID `rel-season-10-cb911f49e9fc8070`.
- Package checksum: `cb911f49e9fc80701bf22a68cc92433d2d8e13ca3a82afe12d7a3fdae00d1ed5`.
- Annotated tag: `season-10.0.0`, local-only, targets production source.

## Runtime boundaries

Classic is the homepage and Legacy is normal Play. Simplified Play, Games, themes, Coach, and Mentor remain QA-only/foundation scope. Bots remains QA and Worker-dependent. Players remains production-blocked. Analytics diagnostics remain local and bounded; transport remains disabled. No public beta or default-route migration is authorized.

## Decisions not to revisit without a new architectural decision

- Board-first shell, single board, shared lifecycle, central FairPlay, and PostGame bridges are authoritative.
- Play v2 is CAISSA-native.
- FICS cannot provide or backstop Play v2 multiplayer, identity, presence, ratings, challenges, lobby, or matchmaking.
- Classic FICS and Legacy FICS remain separate experiences.
- Players cannot activate before native infrastructure exists, and fictitious player networks are prohibited.
- Analytics transport requires separate consent, privacy, retention, and sink governance.

## Gates transferred to Season 11

P1 gates are beta authorization, Worker production readiness, physical-device QA, and screen-reader QA. Preserve the P2/P3 register in the closure manifest. The first rollout, if separately authorized after certification, should expose Games through an opt-in gate before Bots, Coach, or Mentor.

## First recommended task

**SEASON 11.0.1 — PUBLIC BETA READINESS AUDIT** should audit physical-device and accessibility certification plans, Worker production state, beta entry/gating, feedback and support, rollback rehearsal, monitoring, and Games-first rollout. It must not enable Players, change defaults, connect Play v2 to FICS, or enable analytics transport.

## Protected sources and next preflight

Do not modify `docs/architecture/PLAY_CURRENT_STATE_AUDIT.md`, `docs/architecture/CAISSA_SIMPLIFIED_PLAY_ARCHITECTURE.md`, or `docs/architecture/PLAY_MIGRATION_AND_COMPATIBILITY_PLAN.md` during routine handoff work.

Before Season 11 begins, fetch read-only and verify branch, local/remote HEADs, expected 2-ahead/0-behind closure state, clean worktree, closure commit/message, production deployment/alias identity, rollback READY state, local tag target and remote absence, package checksum, QA defaults, Players block, analytics transport block, and all transferred P1 gates. Stop on any mismatch; do not reset, rebase, push, deploy, or mutate aliases.
