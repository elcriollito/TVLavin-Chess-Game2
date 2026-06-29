# CAISSA Release Process

## 1. Purpose

CAISSA Chess is now a production platform with client features, live FICS play, Cloudflare workers, validation tooling, opening database pipelines, and ongoing research work. A formal release process keeps that complexity manageable.

The release process exists to:

- Keep production stable.
- Make each change reviewable.
- Prevent unrelated files from being staged accidentally.
- Separate feature work, cleanup work, infrastructure work, and documentation.
- Preserve the ability to validate production after every meaningful deployment.
- Give future contributors a repeatable path from idea to release.

Consistency is a quality feature. CAISSA should grow without losing the stability it has earned.

## 2. Development Workflow

The standard CAISSA workflow is:

1. Define the phase.
   - Name the phase clearly.
   - State the exact goal.
   - List files or subsystems that may be touched.
   - List files or subsystems that must not be touched.

2. Inspect before editing.
   - Read the existing code, docs, or scripts.
   - Understand current state and prior decisions.
   - Check `git status --short --branch` before making changes.

3. Implement only the scoped change.
   - Keep edits local to the requested subsystem.
   - Avoid opportunistic refactors.
   - Preserve existing production behavior unless the task is explicitly a behavior change.

4. Validate locally.
   - Run syntax checks for modified JavaScript files.
   - Run `git diff --check`.
   - Run smoke tests relevant to the changed area.

5. Stage intentionally.
   - Stage only files related to the phase.
   - Confirm staged files with `git diff --cached --name-status`.

6. Commit once.
   - Use the approved commit message.
   - Do not combine multiple unrelated phases in one commit.

7. Push only when requested or when the phase explicitly requires deployment.
   - Confirm branch and HEAD.
   - Confirm the pending commit list before pushing.

8. Verify deployment when production is affected.
   - Confirm Vercel deployment readiness.
   - Confirm production alias.
   - Run the Production Validation Suite when relevant.

9. Report results.
   - Include files changed.
   - Include commit hash.
   - Include validation results.
   - Include deployment status.
   - Include known limitations or follow-up risks.

## 3. Feature Development Rules

### One Feature = One Phase

Each feature, fix, audit, or documentation task should be handled as a named phase. A phase must have a clear scope and finish line.

### One Phase = One Commit

Each completed phase should produce one focused commit unless the phase explicitly requires multiple commits. This makes rollback and review safer.

### No Mixed-Purpose Commits

Do not mix:

- Feature work with cleanup.
- UI changes with infrastructure changes.
- Documentation with production code fixes unless explicitly requested.
- Experimental scripts with production client changes.
- Local config with repository source.

### Production First

Production stability has priority over novelty. New work must preserve:

- Play page stability.
- Analyze workflow stability.
- Arena engine stability.
- FICS connection and live board stability.
- Opening Database performance and memory safety.
- Deployment and validation reliability.

### Documentation Before Refactoring

Structural cleanup should not start until the project is documented. For CAISSA, architecture and history documentation are part of the safety layer before repository reorganization.

### Preserve User Work

The repository may contain dirty files from other work. Do not revert, delete, move, or stage unrelated files unless explicitly instructed.

## 4. Validation Process

Validation should match the blast radius of the change.

### Syntax Checks

Run `node --check` for every modified JavaScript file when applicable.

Examples:

```powershell
node --check js/fics-client.js
node --check js/fics-style12.js
node --check js/analyze-section.js
node --check app.js
```

### Diff Hygiene

Always run:

```powershell
git diff --check
```

This catches whitespace and patch formatting issues before commit.

### Smoke Tests

Run targeted smoke tests for the changed area:

- Play: board interaction, move list, PGN, menu, resign, undo, hint.
- Analyze: fetch/load game, navigation, analysis, mentor, review summary.
- Arena: start/stop engine match, custom FEN, evaluation display.
- FICS: guest login, lobby, watch, board rendering, console, disconnect.
- Opening Database: navigation, depth limits, search, memory behavior.

### Production Validation Suite

For FICS or deployment-sensitive client changes, run:

```powershell
node tools/validation/production-validation-suite.cjs
```

Expected output should end with:

```text
Overall .... PASS
```

### Browser Validation

Run browser validation when the change touches:

- Layout.
- CSS.
- Keyboard navigation.
- Audio.
- Clipboard.
- WebSocket behavior.
- Mobile responsiveness.

At minimum, validate Chromium/Chrome. Firefox, Edge, Safari, and Mobile Safari should be checked when the change is browser-sensitive or when a release is being hardened.

## 5. Deployment Process

CAISSA primarily deploys through Git integration.

Standard deployment path:

1. Confirm branch is `main`.
2. Confirm HEAD is the intended commit.
3. Confirm only intended commits are ahead of `origin/main`.
4. Push to `origin/main`.
5. Let Vercel auto-deploy.
6. Inspect deployment status.
7. Confirm the production alias serves the new version.
8. Run validation if production behavior changed.

Manual Vercel deployment is not the default.

Do not run local `vercel deploy` unless:

- The task explicitly requires it.
- The target Vercel project has been verified.
- `.vercel/project.json` is known to point to the correct project.
- The user has approved the manual deployment path.

Production alias verification should include checking `https://www.caissa-chess.org` directly, not only preview URLs.

## 6. Documentation Requirements

Documentation should evolve with the project.

### `CHANGELOG.md`

Update when:

- A release is cut.
- A stable feature milestone is reached.
- A production-relevant fix or hardening phase is completed.
- Known limitations change.

Do not use the changelog as a raw commit log.

### `PROJECT_HISTORY.md`

Update when:

- CAISSA enters a new product era.
- A major subsystem becomes stable.
- A design philosophy changes.
- A lesson learned becomes important enough to preserve.

### `PROJECT_ARCHITECTURE.md`

Update when:

- Repository structure changes.
- Production-critical files move.
- New infrastructure is added.
- A subsystem changes ownership or architecture.
- Tooling or validation workflows materially change.

Documentation changes should be committed separately from production code unless the task explicitly requires both.

## 7. Emergency Hotfix Workflow

Emergency hotfixes must be small, targeted, and reversible.

Procedure:

1. Identify the production issue.
2. Classify severity.
3. Reproduce or confirm the failure.
4. Limit scope to the broken behavior.
5. Avoid unrelated refactors.
6. Patch only the minimum necessary files.
7. Run targeted validation.
8. Run `git diff --check`.
9. Commit with a clear hotfix message.
10. Push to `main` only after confirming the pending commit list.
11. Verify Vercel deployment and production alias.
12. Run the Production Validation Suite if the hotfix touches FICS or production client behavior.
13. Report what was fixed and what remains.

Emergency hotfixes should not include cleanup, documentation expansion, formatting sweeps, or experimental work.

## 8. Repository Cleanup Policy

Cleanup must be phased and auditable.

Principles:

- Inventory before cleanup.
- Archive before delete.
- Separate tooling from production.
- Preserve experimental work until evaluated.
- Do not delete deployment-linked config casually.
- Do not clean local/user-specific files without explicit approval.
- Never mix cleanup with a production feature or bugfix.

Suggested cleanup sequence:

1. Inventory dirty and untracked files.
2. Classify each item as keep, quarantine, delete candidate, or do not touch.
3. Archive useful research material.
4. Delete clearly generated temporary files only after approval.
5. Update docs and ignore rules.
6. Validate production after cleanup.

## 9. Release Checklist

Development:

- Phase name and goal are clear.
- Scope is defined.
- Protected areas are identified.
- Existing code/docs were inspected.
- Unrelated dirty files were left untouched.

Validation:

- Relevant `node --check` commands passed.
- `git diff --check` passed.
- Targeted smoke tests passed.
- Production Validation Suite passed when applicable.
- Browser/mobile checks were run when applicable.

Commit:

- Only intended files staged.
- `git diff --cached --name-status` reviewed.
- Commit message matches the phase.
- Commit contains one purpose.

Deployment:

- Branch and HEAD confirmed.
- Pending commits confirmed.
- Push performed only when requested.
- Vercel auto-deployment reached Ready.
- Production alias confirmed.
- PVS run when applicable.

Documentation:

- `CHANGELOG.md` updated for release-level milestones.
- `PROJECT_HISTORY.md` updated for major project evolution.
- `PROJECT_ARCHITECTURE.md` updated for architecture or structure changes.
- Release notes mention limitations and follow-ups.

## 10. Long-Term Engineering Philosophy

CAISSA development should remain careful, incremental, and production-aware.

The project has succeeded by combining classic chess-room ideas with modern browser technology, analysis workflows, and infrastructure discipline. Future development should continue that pattern:

- Build features in stable phases.
- Keep systems loosely separated.
- Validate before deployment.
- Document decisions before cleanup.
- Favor small reliable improvements over sweeping rewrites.
- Treat production stability as part of the product experience.
- Preserve the project's identity instead of chasing generic chess-site parity.

CAISSA should continue to grow as its own platform: classic in spirit, modern in capability, and disciplined in engineering practice.
