# Season 10 Stage 0 Deployment Batch Plan

Status: plan only; no operation is authorized or executed.

## Package state

The eventual packaging commit makes 58 commits after `origin/main`. Production activation is unchanged: Classic and Legacy defaults remain, Simplified Play remains QA-only, Players remains blocked, analytics transport remains disabled, and the rollback production baseline is `eb0511043dd397ac6ff50f05b4e67a84144b5d78`. Previous production deployment ID is unknown and must be captured before authorization.

## Later authorized sequence

1. Revalidate clean Git identity, manifest checksum, tests, blockers, and feature gates.
2. Obtain explicit authorization for an optional annotated `season-10.0.0` tag.
3. Obtain explicit push authorization and push `main` without rewriting history.
4. Observe the Vercel deployment without promoting an alias.
5. Verify deployment commit and READY status.
6. Retain the current production alias until readiness is proven.
7. If separately authorized, verify the production alias target.
8. Run the documented HTTP, route, board, Worker, console, Players-block, and analytics-absence smoke checklist.
9. On any trigger, restore the prior verified Vercel alias; preserve Git history and reverify Classic, Legacy Play, routes, board ownership, Worker behavior, and analytics absence.

Triggers include wrong commit/alias, failed deployment, route/default drift, duplicated board, console regression, Worker failure without truthful fallback, Players access, analytics delivery/storage, or failed hard invariant.
