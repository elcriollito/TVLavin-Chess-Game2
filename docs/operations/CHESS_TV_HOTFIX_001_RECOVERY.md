# Chess TV Hotfix 001: release and recovery

## Scope and invariants

The public route is `/spectator-tv`; the canonical production URL is
`https://www.caissa-chess.org/spectator-tv`.

Every production candidate must pass:

```powershell
npm run release:public:audit
```

This existing public-release audit owns the permanent Chess TV guard. It checks
all 24 contracts requested for the route: visible and sidebar identity, the
`/spectator-tv` link, HEAD/BODY/FOOT structure, BODY-only scrolling, fixed FOOT,
board controls, two player bars and two clocks, compact two-column details,
absence of the legacy clock summary and FOOT actions, Exit table/unobserve,
late-event invalidation, one persistent board root, one canonical FICS client,
canonical ECO resolution and `/eco/<ECO>` links, one deployable ECO catalog,
horizontal-overflow prevention, and anti-jitter guards.

The public artifact contains `public/data/eco/eco_codes.json` only. The identical
`data/eco/eco_codes.json` source fixture remains in the repository for tests but
is protected from the public artifact.

## Required release flow

1. Fetch and confirm that `origin/main` has not moved from the certified base.
2. Work in an isolated release branch and worktree; never release from a dirty
   tree.
3. Run reproducible installation, lint, unit, browser, navigation, board, FICS,
   ECO, public-release, production-build, and `git diff --check` validation.
4. Push the release branch normally and wait for its Vercel Preview to be
   `Ready`.
5. Certify `/spectator-tv`, FICS Observe, Exit table/unobserve, ECO links,
   desktop/mobile/zoom, console, network, and WebSocket behavior on Preview.
6. Fetch again. If `origin/main` moved, integrate the new tip, rerun the full
   suite, and obtain a new Preview.
7. Update `main` only with a normal fast-forward push. Force push and
   `--force-with-lease` are prohibited.
8. Wait for the Git-integrated production deployment to become `Ready`, verify
   its exact Git SHA and aliases, then repeat live certification.

The release must not change the production FICS Worker or its protocol. Local
tests may use `gateway/fics-local-node/fics-gateway.cjs`, but local bridge
changes are not production changes and must not be promoted. Required FICS
coverage includes Guest login, Channels, Observe, live Style12 moves, one clock
per player bar, Game Details ownership, movelist/ECO resolution, internal ECO
navigation, Exit table, the `unobserve <game>` command, rejection of late events,
and observing a second game without residue.

## Recovery references

Certified production before the hotfix:

- Git SHA: `9aae344d63f37194f19d707c73d0f450ca29233f`
- annotated tag: `chess-tv-prod-pre-hotfix-001-2026-09-20`
- backup branch: `backup/chess-tv-production-9aae344`
- Vercel deployment: `dpl_9rQchDv9gCnVbdNFNg6FjLvp2BFq`
- deployment URL: `https://tv-lavin-chess-game2-a1e4u2l1k-elcriollitos-projects.vercel.app`

Verify the preserved deployment without changing production:

```powershell
vercel inspect dpl_9rQchDv9gCnVbdNFNg6FjLvp2BFq --scope elcriollitos-projects
```

## Emergency rollback

Only for a critical production regression, restore the prior immutable Vercel
deployment first:

```powershell
vercel promote dpl_9rQchDv9gCnVbdNFNg6FjLvp2BFq --scope elcriollitos-projects --yes
vercel inspect https://www.caissa-chess.org --scope elcriollitos-projects
```

If Vercel cannot promote that deployment directly, rebuild it as production and
then verify the resulting deployment before relying on the alias:

```powershell
vercel redeploy dpl_9rQchDv9gCnVbdNFNg6FjLvp2BFq --target production --scope elcriollitos-projects
```

Do not reset or force-update `main`. After service is restored, create a normal
revert commit for the defective release, run the complete certification again,
and publish that revert by normal fast-forward push. Record the incident and
retain both snapshot tags, the backup branch, and the old deployment.

No command in this guide requires or records a token, credential, or secret.
