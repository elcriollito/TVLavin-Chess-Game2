# CAISSA Tooling Migration Plan

## 1. Purpose

This document designs a future migration for CAISSA tooling without executing it.

Tooling migration is separated from tooling execution because `scripts/` is connected to multiple parts of the repository:

- `package.json` commands
- documentation examples
- OpeningDB generation workflows
- R2 upload workflows
- production validation
- experimental OpeningDB v4 and node API work

Moving scripts without updating every caller would create broken commands even if production client code remains untouched. The migration must therefore happen as a single focused phase with script moves, command rewrites, documentation updates, validation, and rollback planning handled together.

This phase is design only. No files are moved, no commands are renamed, and no package or documentation references are changed here.

## 2. Current Toolchain Overview

### OpeningDB

OpeningDB tooling builds and validates opening data, ECO maps, opening book chunks, manifests, and optional game reference indexes.

Current scripts include:

- `scripts/build-eco-position-map.js`
- `scripts/build-opening-book.js`
- `scripts/build-openingdb-index.js`
- `scripts/build-openingdb-games-index.js`
- `scripts/write-openingdb-manifest.js`
- `scripts/qa-openingdb-v3.js`
- `scripts/verify-known-lines.js`
- `scripts/upload-openingdb-shards-r2.js`
- `scripts/upload-openingdb-games-r2.js`

### GameSearch

GameSearch tooling builds and validates a searchable game index and uploads it to R2.

Current scripts include:

- `tools/gamesearch/build-gamesearch-index.js`
- `tools/gamesearch/qa-gamesearch-index.js`
- `tools/gamesearch/upload-gamesearch-index-r2.js`

### Validation

Validation tooling includes production smoke checks and domain-specific QA.

Current scripts include:

- `tools/validation/production-validation-suite.cjs`
- `scripts/qa-openingdb-v3.js`
- `tools/gamesearch/qa-gamesearch-index.js`
- `scripts/verify-known-lines.js`

### Deployment

Deployment tooling is mostly R2 upload helpers that depend on Wrangler and generated data directories.

Current scripts include:

- `scripts/upload-openingdb-shards-r2.js`
- `scripts/upload-openingdb-games-r2.js`
- `tools/gamesearch/upload-gamesearch-index-r2.js`
- `experimental/openingdb-v4/upload-openingdb-subshards-r2.js`

### Experimental

Experimental tooling currently supports OpeningDB v4 subsharding, node API validation, canary probing, and benchmark comparisons.

Current scripts include:

- `experimental/openingdb-v4/plan-openingdb-v4-sub.js`
- `experimental/openingdb-v4/build-openingdb-v4-sub.js`
- `experimental/openingdb-v4/qa-openingdb-v4-sub.js`
- `experimental/openingdb-v4/upload-openingdb-subshards-r2.js`
- `experimental/node-api/qa-openingdb-node-api.js`
- `experimental/canary/probe-openingdb-node-canary.js`
- `experimental/benchmarks/benchmark-openingdb-ab.js`
- `experimental/openingdb-v4/finalize-openingdb-from-raw.js`
- `experimental/openingdb-research/build-pos-stats.js`
- `experimental/openingdb-research/build-eco-stats.mjs`
- `experimental/openingdb-research/eco-pgn-stats.js`
- `experimental/openingdb-research/build-opening-position-index.js`

## 3. Script Classification

### Production-Critical

These scripts must not move casually because package commands, documentation, production validation, or active data workflows depend on them:

- `tools/validation/production-validation-suite.cjs`
- `scripts/build-eco-position-map.js`
- `scripts/build-opening-book.js`
- `scripts/build-openingdb-index.js`
- `scripts/write-openingdb-manifest.js`
- `scripts/upload-openingdb-shards-r2.js`
- `scripts/qa-openingdb-v3.js`
- `scripts/verify-known-lines.js`

Migration requirement: move only with matching `package.json` and documentation updates.

### Safe-To-Move

These scripts can move later as a coordinated tooling organization phase, provided callers and docs are updated in the same commit:

- `scripts/build-openingdb-games-index.js`
- `scripts/upload-openingdb-games-r2.js`
- `tools/gamesearch/build-gamesearch-index.js`
- `tools/gamesearch/qa-gamesearch-index.js`
- `tools/gamesearch/upload-gamesearch-index-r2.js`
- `experimental/openingdb-v4/finalize-openingdb-from-raw.js`

Migration requirement: update package entries, README references, and any doc examples that invoke these paths.

### Experimental

These scripts should remain outside the primary tooling migration until the OpeningDB v4/node API roadmap is approved:

- `experimental/openingdb-v4/plan-openingdb-v4-sub.js`
- `experimental/openingdb-v4/build-openingdb-v4-sub.js`
- `experimental/openingdb-v4/qa-openingdb-v4-sub.js`
- `experimental/openingdb-v4/upload-openingdb-subshards-r2.js`
- `experimental/node-api/qa-openingdb-node-api.js`
- `experimental/canary/probe-openingdb-node-canary.js`
- `experimental/benchmarks/benchmark-openingdb-ab.js`
- `experimental/openingdb-research/build-pos-stats.js`
- `experimental/openingdb-research/build-eco-stats.mjs`
- `experimental/openingdb-research/eco-pgn-stats.js`
- `experimental/openingdb-research/build-opening-position-index.js`

Migration requirement: move only into an explicit `experimental/` layout once that phase is approved.

## 4. Proposed Future Structure

Proposed future structure:

```text
tools/
  validation/
    production-validation-suite.cjs
  openingdb/
    build-eco-position-map.js
    build-opening-book.js
    build-openingdb-index.js
    build-openingdb-games-index.js
    write-openingdb-manifest.js
    verify-known-lines.js
  gamesearch/
    build-gamesearch-index.js
    qa-gamesearch-index.js
    upload-gamesearch-index-r2.js
  deployment/
    upload-openingdb-shards-r2.js
    upload-openingdb-games-r2.js
  maintenance/
```

Experimental structure:

```text
experimental/
  openingdb-v4/
    plan-openingdb-v4-sub.js
    build-openingdb-v4-sub.js
    qa-openingdb-v4-sub.js
    upload-openingdb-subshards-r2.js
    finalize-openingdb-from-raw.js
  node-api/
    qa-openingdb-node-api.js
  benchmarks/
    benchmark-openingdb-ab.js
  openingdb-research/
    build-pos-stats.js
    build-eco-stats.mjs
    eco-pgn-stats.js
    build-opening-position-index.js
  canary/
    probe-openingdb-node-canary.js
    wrangler.canary.toml
```

Do not implement this structure until a dedicated execution phase.

## 5. Migration Stages

### Stage 1: Move Safe Scripts

Move only approved scripts into their future folders. Avoid moving experimental scripts in the first execution pass unless the phase explicitly includes them.

Suggested first execution scope:

- `tools/validation/production-validation-suite.cjs` remains in `tools/validation/`
- stable OpeningDB scripts to `tools/openingdb/`
- GameSearch scripts to `tools/gamesearch/`
- stable upload helpers to `tools/deployment/`

### Stage 2: Update `package.json`

Update every package script that references moved files.

Examples:

- `node scripts/build-openingdb-index.js` becomes `node tools/openingdb/build-openingdb-index.js`
- any future PVS package command should use `node tools/validation/production-validation-suite.cjs`

No package command should point to a missing path after this stage.

### Stage 3: Update Documentation

Update all documentation references to moved script paths:

- `README.md`
- `PROJECT_ARCHITECTURE.md`
- `RELEASE_PROCESS.md`
- `CHANGELOG.md` if needed
- `docs/operations/production-validation-suite.md`
- `docs/openingdb/*`
- any moved legacy docs only if they are not intentionally archival snapshots

Archive documents may preserve historical paths if they are clearly historical, but operational docs must be current.

### Stage 4: Run `node --check`

Run syntax checks for every moved JavaScript script.

Minimum expected checks:

```powershell
node --check tools/validation/production-validation-suite.cjs
node --check tools/openingdb/build-openingdb-index.js
node --check tools/openingdb/build-opening-book.js
node --check tools/openingdb/build-eco-position-map.js
node --check tools/gamesearch/build-gamesearch-index.js
node --check tools/deployment/upload-openingdb-shards-r2.js
```

Add checks for every script moved in the execution phase.

### Stage 5: Run `git diff --check`

Run:

```powershell
git diff --check
```

Resolve whitespace or path mistakes before staging.

### Stage 6: Run Production Validation Suite

Run the updated PVS path after migration:

```powershell
node tools/validation/production-validation-suite.cjs
```

Expected result:

```text
Overall .... PASS
```

### Stage 7: Commit

Stage only migration-related files.

Commit message for execution phase:

```text
organize-tooling-scripts
```

Do not combine tooling migration with cleanup, worker moves, production code changes, or experimental promotion.

## 6. Validation Checklist

After tooling migration execution, validate:

- `git status --short --branch` shows only intended moved/updated files.
- `package.json` commands point to existing files.
- `README.md` script examples point to existing files.
- `PROJECT_ARCHITECTURE.md` reflects the new tooling layout.
- `RELEASE_PROCESS.md` references the new PVS path.
- `docs/operations/production-validation-suite.md` references the new PVS path.
- OpeningDB docs reference current stable script paths.
- `node --check` passes for every moved JS/CJS script.
- `git diff --check` passes.
- Production Validation Suite passes from its new location.
- No production code is modified.
- No worker folders are moved.
- No experimental scripts are included unless explicitly scoped.

## 7. Rollback Plan

If the migration breaks tooling:

1. Stop before pushing.
2. Inspect `git diff --cached --name-status` and `git diff`.
3. If only paths are wrong, correct package/docs references and re-run validation.
4. If the moved scripts fail due to relative path assumptions, either:
   - update path resolution carefully, or
   - move the script back to `scripts/` before commit.
5. If multiple commands fail, revert the migration commit locally before pushing.
6. If the commit has already been pushed, create a focused rollback commit that restores the previous script paths and package/docs references.

Never repair a broken migration by mixing in unrelated production feature changes.

## 8. Risks

Known risks:

- `package.json` references may become stale after moving scripts.
- Documentation examples may point to old paths.
- Some scripts may assume `process.cwd()` is the repository root.
- Some scripts may use relative imports, such as `experimental/node-api/qa-openingdb-node-api.js` importing `../../downloads-worker/worker.js`.
- R2 upload scripts depend on Wrangler and platform-specific command resolution.
- PVS may depend on location-sensitive assumptions or documentation paths.
- Worker assumptions should not be affected by script movement.
- Experimental scripts may look similar to stable scripts but should remain out of the main migration until approved.

Special caution:

- Do not move `downloads-worker/`.
- Historical note: `fics-gateway-worker/` was reorganized during Season 3.6E into `gateway/fics-cloudflare-worker/`.
- Do not edit `.vercel/`, `.wrangler/`, `.claude/`, `tmp/`, or `logs/`.
- Do not delete old scripts during migration; use `git mv` so history remains clear.

## 9. Future Work

Planned future phases:

- 3.6D Tooling Migration Execution
- 3.6E Gateway Organization
- 3.6F Experimental Organization
- 3.6G Safe Cleanup
- 3.6H Final Validation

Recommended next phase before execution:

- Review this plan with the team.
- Decide whether experimental scripts stay in `scripts/` for now or move later under `experimental/`.
- Confirm whether PVS should move in the first tooling migration or remain in `scripts/` until after cleanup.
