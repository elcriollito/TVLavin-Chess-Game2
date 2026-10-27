# CAISSA Accessibility Season 001B — Deployment Runbook

This is a future procedure only. It is not authorization to push, merge, create a Preview, or deploy.

## Immutable gates

- Required production base: `26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b`
- Required certified code checkpoint: `d8958b9b0fafd2c4e51ed45348643077c347b648`
- Required certified code tree: `33a9b2ed1c31c02dcf18fb0b07dcab74949284d0`
- Required WebKit race hotfix checkpoint: `4c7c3292cd181e96b67500326576c408efe41120`
- Required WebKit race hotfix tree: `82f842f41d3e5ff56495217f3f4ddea9847c7f5b`
- Required production-before-release deployment: `dpl_2uyihaZJjvg2wFS915qWDvhVY9Dm`
- Required Human Test record: original, targeted, and final WebKit hotfix passes in `CAISSA_A11Y_001B_HUMAN_TEST_PARITY.md`
- Required automated gate: recorded 30/30 original-scenario WebKit stability, 30/30 deterministic delayed-init stability, 45/45 multibrowser, and 45/45 repeated broader WebKit results
- Required revised Human Test: complete — bounded Opening Database immediate-loading keyboard check passed
- Required package head/tree: the exact values in the final owner handoff

If remote `main`, the production deployment, runtime tree, or package tree differs, stop and re-audit the delta. Do not blindly rebase or merge.

## Preauthorization verification

From the hotfix worktree:

```powershell
git status --short --branch
git fetch origin main
git ls-remote origin refs/heads/main
git rev-parse origin/main
git merge-base origin/main hotfix/a11y-001b-openingdb-webkit-init-race
git merge-base --is-ancestor origin/main hotfix/a11y-001b-openingdb-webkit-init-race
git log --oneline origin/main..hotfix/a11y-001b-openingdb-webkit-init-race
git rev-list --merges origin/main..hotfix/a11y-001b-openingdb-webkit-init-race
git diff --name-status origin/main..hotfix/a11y-001b-openingdb-webkit-init-race
git diff --quiet origin/main..hotfix/a11y-001b-openingdb-webkit-init-race -- package.json package-lock.json
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
npx playwright test tests/browser/opening-database-tab-init-race.spec.js --project=webkit --retries=0
npx playwright test tests/browser/accessibility-foundation.spec.js tests/browser/accessibility-season-001b.spec.js tests/browser/accessibility-season-001b-release.spec.js tests/browser/opening-database-tab-init-race.spec.js --project=chromium --project=firefox --project=webkit --retries=0
npx playwright test tests/browser/caissa-board-persistent-renderer.spec.js --config=playwright.board.config.js --project=chromium --project=webkit --retries=0
npx playwright test tests/browser/opening-database-quiet-drag.spec.js --project=chromium --project=webkit --retries=0
```

## Authorized release sequence

Only after explicit owner production authorization is provided for the exact final documentation HEAD/tree:

1. Freeze the exact reviewed package HEAD and tree from the handoff.
2. Recheck remote/production drift and rerun the final local verification.
3. Confirm `origin/main` is still the recorded production base and is an ancestor of the approved HEAD. Require zero merge commits in the release range and exactly 53 paths: 29 added, 24 modified, 0 deleted.
4. Schedule the production window. Because updating `main` triggers Vercel automatically, do not update `main` until the owner explicitly authorizes production publication.
5. Use a normal fast-forward Git push of the exact approved HEAD to `main`; never use force, rebase, squash, or an unrelated merge. A protected-branch rejection is a stop condition, not permission to bypass protection.
6. Let the existing Vercel Git integration build from `main`; do not create a redundant CLI deployment.
7. Observe the new Vercel deployment read-only. Require `READY`, target `production`, project `prj_SU3FQKbxjztMccLO5TYBSpU6XvDf`, and a Git SHA exactly matching the authorized new `main` SHA.
8. Verify `/`, `/analyze`, `/chess-gym`, `/opening-database`, `/spectator-tv`, `/scanner`, `/puzzles`, `/opening-trainer`, and `/support` → `/help` on both public domains.
9. Verify no PayPal SDK, iframe, Hosted Button, contribution CTA, or PayPal CSP origin appears.
10. Verify Scanner retains separate optional correction/image consent, private review wording, and no automatic-training claim; do not submit imagery or feedback.
11. Verify `PLAY_V2_UNAVAILABLE_DOCUMENT` remains the response for unavailable Play routes.
12. Perform keyboard smoke checks for bypass, Gym tabs, Opening Database tabs/error, Chess TV turn text, and Scanner modal focus.
13. Record the deployment ID, aliases, Git SHA, results, and owner decision.

After production publication is explicitly authorized, the exact Git operation is:

```powershell
$approvedHead = (git rev-parse HEAD).Trim()
$currentMain = (git ls-remote origin refs/heads/main).Split("`t")[0]
if ($approvedHead -ne '<HANDOFF-APPROVED-HEAD>') { throw 'Candidate HEAD changed' }
if ($currentMain -ne '26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b') { throw 'Remote main advanced' }
git merge-base --is-ancestor $currentMain $approvedHead
if ($LASTEXITCODE -ne 0) { throw 'Candidate is not a fast-forward of main' }
git rev-list --merges "$currentMain..$approvedHead"
git diff --quiet "$currentMain..$approvedHead" -- package.json package-lock.json
if ($LASTEXITCODE -ne 0) { throw 'Dependency files changed' }
git push origin HEAD:refs/heads/main
```

Replace `<HANDOFF-APPROVED-HEAD>` with the exact final documentation HEAD in the owner handoff. The unforced push must be rejected automatically if `main` advances. Its successful update is the single publication trigger for the existing Vercel Git integration.

## Recovery and forward-fix procedure

Prefer a reviewed forward fix from the released SHA. Stop automated publication, reproduce the failure, apply the smallest correction on a new branch, rerun the affected gates, obtain owner authorization, and fast-forward normally.

For a severe incident requiring immediate recovery, deployment `dpl_2uyihaZJjvg2wFS915qWDvhVY9Dm` is the known READY pre-accessibility recovery candidate and already contains the permanent PayPal retirement. Reassigning production to it requires separate explicit owner authorization and read-only verification of its SHA, aliases, `/support` redirect, and PayPal absence. Never recover to a pre-PayPal build, never use a blind `vercel rollback`, and never delete deployment history.

## Stop conditions

Stop before production if any of the following occurs:

- remote `main` or production SHA advances;
- the bounded Human Test is not recorded;
- package or lockfile changes;
- migration/provider setup becomes necessary;
- a restricted path appears;
- focused tests regress;
- the recorded WebKit stability or deterministic race tests fail when repeated;
- PayPal or Support contribution functionality reappears;
- Vercel reports a different Git SHA or non-READY state.
