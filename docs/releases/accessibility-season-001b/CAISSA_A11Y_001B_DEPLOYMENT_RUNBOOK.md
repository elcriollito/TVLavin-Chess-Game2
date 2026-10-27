# CAISSA Accessibility Season 001B — Deployment Runbook

This is a future procedure only. It is not authorization to push, merge, create a Preview, or deploy.

## Immutable gates

- Required production base: `26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b`
- Required certified code checkpoint: `d8958b9b0fafd2c4e51ed45348643077c347b648`
- Required certified code tree: `33a9b2ed1c31c02dcf18fb0b07dcab74949284d0`
- Required production-before-release deployment: `dpl_2uyihaZJjvg2wFS915qWDvhVY9Dm`
- Required Human Test record: original and targeted passes in `CAISSA_A11Y_001B_HUMAN_TEST_PARITY.md`
- Required automated gate: stable 33/33 focused browser result after resolving the documented WebKit Opening Database initialization race
- Required package head/tree: the exact values in the final owner handoff

If remote `main`, the production deployment, runtime tree, or package tree differs, stop and re-audit the delta. Do not blindly rebase or merge.

## Preauthorization verification

From the release worktree:

```powershell
git status --short --branch
git fetch origin main
git ls-remote origin refs/heads/main
git rev-parse origin/main
git merge-base origin/main release/accessibility-001b-certified-20261026
git log --oneline origin/main..release/accessibility-001b-certified-20261026
git diff --name-status origin/main..release/accessibility-001b-certified-20261026
git diff --quiet origin/main..release/accessibility-001b-certified-20261026 -- package.json package-lock.json
node scripts/build-navigation-fallbacks.mjs --check
npm run release:public:audit
```

Required results: clean worktree; remote main and merge-base both `26e9d25…`; only certified commits/files; package diff exit `0`; generators/audit pass.

Re-inspect Vercel production read-only and require `READY`, production target, Git `main`, and Git SHA matching current remote main.

## Final local verification

```powershell
node --test tests/accessibility-foundation.test.js tests/accessibility-season-001b.test.js
$env:PORT='8187'
$env:CAISSA_SERVER_HOST='127.0.0.1'
$env:NODE_ENV='test'
node server.js
```

In another shell:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:8187'
npx playwright test tests/browser/accessibility-foundation.spec.js tests/browser/accessibility-season-001b.spec.js tests/browser/accessibility-season-001b-release.spec.js --project=chromium --project=firefox --project=webkit
npx playwright test tests/browser/caissa-board-persistent-renderer.spec.js --config=playwright.board.config.js --project=chromium --project=webkit
```

## Authorized release sequence

Only after the WebKit Opening Database gate is resolved, the affected keyboard behavior is re-approved, and explicit owner production authorization is provided:

1. Freeze the exact reviewed package HEAD and tree from the handoff.
2. Recheck remote/production drift and rerun the final local verification.
3. If the owner authorizes a remote review branch or PR, push only the certified branch. A Preview is a separate authorization; do not assume it.
4. Schedule the production window. Because updating `main` triggers Vercel automatically, do not update `main` until the owner explicitly authorizes production publication.
5. Merge or fast-forward only the reviewed commit set. Do not include combined Season 2.0 privacy/security commits.
6. Observe the new Vercel deployment read-only. Require `READY` and require its Git SHA to match the authorized main SHA.
7. Verify `/`, `/analyze`, `/chess-gym`, `/opening-database`, `/spectator-tv`, `/scanner`, `/puzzles`, `/opening-trainer`, and `/support` → `/help`.
8. Verify no PayPal SDK, iframe, Hosted Button, donation CTA, or PayPal CSP origin appears.
9. Perform keyboard smoke checks for bypass, Gym tabs, Opening Database tabs/error, Chess TV turn text, and Scanner modal focus.
10. Record the deployment ID, aliases, Git SHA, results, and owner decision.

## Stop conditions

Stop before production if any of the following occurs:

- remote `main` or production SHA advances;
- the bounded Human Test is not recorded;
- package or lockfile changes;
- migration/provider setup becomes necessary;
- a restricted path appears;
- focused tests regress;
- the WebKit Opening Database focus test is nondeterministic or fails;
- PayPal or Support contribution functionality reappears;
- Vercel reports a different Git SHA or non-READY state.
