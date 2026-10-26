# CAISSA Accessibility Season 001B — Recovery Plan

This plan is documentation only. No production recovery action is authorized.

## Recovery invariant

Never roll back earlier than production base `26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b`. That base already contains PayPal retirement and the current Play unavailable gate. Recovery must preserve authentication behavior, production data paths, external integrations, `/support` → `/help`, and all historical records.

## Preferred response by subsystem

| Symptom | Preferred action | Reason |
|---|---|---|
| Bypass focus/visibility only | Forward fix | Small shared CSS/markup surface; avoids removing unrelated accessibility corrections |
| Scanner sheet focus loop only | Forward fix in `scanner/scanner-app.js` | Isolated keyboard behavior; no backend rollback |
| Gym or Opening tab regression | Forward fix if bounded; otherwise revert accessibility release | State/focus bugs are locally testable, but functional regression must be stopped |
| Chess TV turn/status regression | Forward fix if visible state remains truthful; otherwise revert | Preserve non-color status and spectator behavior |
| Shared navigation/render failure | Revert the accessibility release to the certified production base, then forward repair | Shared navigation has broad reach |
| Widespread release failure | Vercel rollback to `dpl_2uyihaZJjvg2wFS915qWDvhVY9Dm` after owner authorization | Known READY deployment already preserves PayPal retirement and Play gate |
| Documentation-only issue | Correct documentation; no runtime rollback | No user-facing runtime impact |

## Git recovery preparation

Use a clean emergency branch created from the then-current `main`. Inspect the exact release merge/commit before preparing a revert.

```powershell
git fetch origin main
git switch --create recovery/accessibility-001b-<date> origin/main
git show --stat --oneline <authorized-release-sha>
git revert --no-commit <authorized-release-sha>
git diff --check
git diff --name-status origin/main
```

Do not commit, push, merge, or deploy the recovery until the owner authorizes it. If the release was merged as multiple commits, revert in reverse order or revert the merge commit with the correct parent; never guess the parent.

After preparing a revert, rerun:

```powershell
node --test tests/navigation-integrity.test.js tests/public-route-inventory.test.js tests/play/play-v2-beta-entry.test.js
npm run release:public:audit
```

Also verify package parity, `/support` redirects, `PLAY_V2_UNAVAILABLE_DOCUMENT`, and absence of PayPal additions.

## Vercel recovery

If immediate production stabilization is required and authorized, select the known READY deployment `dpl_2uyihaZJjvg2wFS915qWDvhVY9Dm` or use the organization's approved rollback workflow. Confirm its Git SHA is `26e9d25…` before promotion. Do not alter DNS, environment variables, Clerk, Google OAuth, Stripe, PayPal, Supabase, or databases.

## Data impact

The candidate has no database migrations, persistence schema, account mutation, provider setting, or payment change. Recovery requires no data rollback and must not delete user or financial records.

## Post-recovery verification

Verify production aliases, Git SHA, `/support` redirects, Play unavailable behavior, navigation, Scanner capture entry, Chess Gym, Opening Database, Chess TV, Puzzles, and absence of PayPal. Record the recovery deployment ID and exact authorization.
