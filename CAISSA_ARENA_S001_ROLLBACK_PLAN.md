# CAISSA Arena S001 Rollback Plan

Scope: private preview/beta only  
Application candidate: `86224d33f67ac7343e84a2406caac6c01b264843`
Production rollback: not applicable; nothing was deployed to production

## Principles

- Disable access before changing code or data.
- Preserve tournament/game/audit rows for diagnosis.
- Prefer a previous known-good preview deployment over destructive SQL.
- Never down-migrate or delete production data as part of this beta rollback.
- Do not modify the authoritative production aliases or environment without a
  separately approved production action.

## Immediate containment

For a verified isolated preview, change only preview-scoped variables, in this
order:

1. `CAISSA_ONLINE_ARENA_CREATE=0` — stops new tournament creation.
2. `CAISSA_ONLINE_ARENA=0` — hides and rejects all Arena actions while leaving
   ordinary CAISSA Online available.
3. If ordinary Online must also stop, set `CAISSA_ONLINE_ROLLOUT=off` for preview.

Redeploy the preview configuration and confirm:

- `/api/online?action=config` reports Arena/Tournaments disabled;
- tournament commands return disabled/not found;
- no new pairing or tournament row appears after the disable timestamp;
- the public production site and aliases are unchanged.

If a game is active when containment begins, capture its IDs/state first. Do not
manually fabricate a result. The incident owner decides whether to finish it in
the isolated environment before disabling or preserve it unresolved for analysis.

## Application rollback

Record the bad preview deployment ID, exact commit, timestamps, browser evidence,
and affected tournament/game IDs. Then redeploy the previous verified preview
commit or remove the branch preview. Do not promote the previous deployment to
production as a shortcut.

The Arena flags default off, so an application rollback is not required merely to
make the feature unreachable. It is appropriate when Arena code affects ordinary
Online behavior, board geometry, authentication, or API availability.

## Database handling

The migration is forward-only. In the isolated beta database:

- retain the added columns/tables/functions while the feature is disabled;
- preserve `caissa_online_arena_events`, pairings, tournament-game links, games,
  and participants as incident evidence;
- revoke service-role Arena RPC execution only if credential compromise or a
  continuing unauthorized caller requires an emergency database containment;
- rotate a compromised preview service key through the provider, never through
  Git or this document.

Do not drop tables, delete rows, rewrite results, decrement scores, or restore a
database backup without a separately reviewed recovery plan and explicit owner
authorization. The disabled feature can coexist safely with the forward schema.

## Realtime/auth incident

If an unauthorized account observes a private topic or Arena response:

1. disable Arena immediately;
2. preserve request IDs, JWT subject (redacted in shared reports), topic,
   tournament ID, policy result, and timestamps;
3. revoke/rotate only the isolated credentials involved;
4. verify the account is absent from the internal and Arena allowlists;
5. reproduce against the isolated database and policy before any re-enable;
6. run the managed security scan and add a regression test.

## Scoring/pairing incident

For double pairing, duplicated score, post-expiry pairing, or disconnected-loop
behavior:

1. disable creation and Arena;
2. preserve pairings, event IDs, game versions/results, `scored_at`, participant
   states, tournament version/status, and presence expiry;
3. do not repair standings manually;
4. reproduce with the PostgreSQL harness or a copied synthetic fixture;
5. fix transaction/idempotency logic, rerun the complete matrix, and create a new
   immutable candidate commit;
6. start a new Founders Beta row for the next acceptance attempt rather than
   presenting repaired historical evidence as a clean run.

## Re-enable criteria

- Root cause and affected scope are documented.
- A regression test fails before and passes after the repair.
- `npm run test:online`, the PostgreSQL harness, and the full three-engine Online
  browser suite pass.
- Hosted RLS/Realtime checks pass with four distinct preview accounts.
- The managed security diff scan completes without unresolved reportable issues.
- A new exact commit and preview deployment are recorded.
- The owner explicitly approves another Human QA attempt.

## Recovery verification

After rollback or disablement, verify ordinary Online matchmaking, legal moves,
clocks, draw/resign, refresh recovery, board navigation, and mobile ordering. Also
confirm production project/deployment/domain identifiers are exactly as they were
before the beta action.
