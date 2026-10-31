# Repository guidance

For new board-centered CAISSA product surfaces, review
`docs/product/CAISSA_BOARD_WORKSPACE_UI_PATTERN.md` before proposing architecture.
Apply the pattern only where it fits the product surface.

Interactive chessboards must follow the CAISSA Quiet Drag standard:
`docs/standards/CAISSA_QUIET_DRAG.md`

Before any Analyzer architecture, Play-to-Analyzer handoff, legacy Analyzer
retirement, or Analyzer recovery work, read the
[Analyzer Architecture, Play Handoff & Recovery Runbook](docs/architecture/CAISSA_ANALYZER_ARCHITECTURE_RECOVERY.md).
Keep that runbook current whenever an authorized change affects Analyzer
architecture, Play handoffs, release state, or recovery procedures.

## CAISSA deployment authority and release safety

**Authoritative GitHub repository:** `elcriollito/TVLavin-Chess-Game2`.

**Authoritative Vercel project for the public CAISSA Chess website:**

- Name: `tv-lavin-chess-game2`
- Project ID: `prj_SU3FQKbxjztMccLO5TYBSpU6XvDf`
- Team ID: `team_K1d4QZ7MJIvt49wtRXPbCHQC`
- Public domains: `www.caissa-chess.org` and `caissa-chess.org`

**Separate Vercel project (not the public-domain deployment target):**

- Name: `caissa-chess`
- Project ID: `prj_UhbgAvWRgEdqDRrWy9lth7gtwzee`
- It may build previews from the same GitHub repository. Its successful builds do
  not establish readiness or production release of the authoritative project.
- Do not delete, rename, transfer, unlink, or repurpose this secondary project
  without a separate inventory and explicit owner authorization.

Before any deployment, promotion, rollback, domain change, or release:

1. Inspect the live Vercel project IDs, team, Git source, exact commit SHA,
   environment, and domain-to-project assignments. Treat the identifiers above
   as a verified reference, not a substitute for checking current state.
2. Use `tv-lavin-chess-game2` for CAISSA's public release workflow. Use its
   **own** branch preview to validate the proposed commit. Do not use a preview
   from `caissa-chess` as a substitute for this check.
3. Verify the intended GitHub PR head, its tree SHA, merge base, and current
   `main`. A documentation-only commit also changes the candidate identity:
   refresh checks, preview, and release evidence for the resulting final SHA.
4. Check whether merging into `main` automatically triggers a Vercel production
   deployment. A GitHub merge is a potential production-affecting action.
5. Capture the currently serving production deployment ID and rollback target
   before an authorized production change. Test the four entry routes
   `/play/games`, `/play/bots`, `/play/coach`, and `/analyze`, the PGN/FEN
   handoff, Coach selection, authentication, and engine behavior as relevant.
6. Do not merge, deploy to the production environment, promote, or change
   production aliases without explicit owner approval for that release.
   A request to create a PR or preview is **not** production authorization.
7. Never force-push, reset protected history, delete legacy Analyzer files, or
   clean existing worktrees as part of a release unless separately authorized.
8. When a deployment is authorized, report the exact project, deployment ID,
   environment, commit, aliases, smoke tests, and rollback status. If any
   identity or safety check fails, stop and request direction.

### Play-to-Analyzer release context (October 2026)

- PR [#107](https://github.com/elcriollito/TVLavin-Chess-Game2/pull/107)
  proposes canonical postgame Analyze navigation and Coach selected-level UX.
- Certified application code originated at `44e557c0`; the originally
  certified PR head was `65ae0de29c7ac8b184f7bf956d29b54277bc5e71`.
- The owner reported Human QA **6/6 PASS**; approved targeted release tests
  were **76/76 PASS**. Existing test/CSP warnings require tracking, not
  unapproved application rewrites.
- **Do not assume these historical SHA values remain the current PR head.**
  Recheck GitHub and Vercel when proceeding.
- The legacy embedded Analyzer has **not** been retired. Its deletion is a
  separate future workstream and is excluded from PR #107's original scope.
- The approved work to date allows PR and preview preparation only; production
  merge/promotion is explicitly held until a new owner approval.
