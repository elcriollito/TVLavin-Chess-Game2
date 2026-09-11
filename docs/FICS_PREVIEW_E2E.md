# FICS RC Preview E2E

The production static files intentionally remain pinned to
`wss://fics-gateway.caissa-chess.org/ws`. Vercel does not interpolate
deployment environment variables inside committed HTML or `vercel.json`, and
both the response CSP and HTML meta CSP must authorize the selected WebSocket
origin.

For an approved RC smoke, generate an ignored preview-only site from tracked
files. One exact staging gateway URL drives both the generated runtime config
and all preview CSP `connect-src` entries. The builder fails closed on the
production gateway, broad sources, invalid URLs, or missing canonical markers.
It also requires a clean tracked worktree and records its source commit in the
non-deployed manifest.

```powershell
$env:CAISSA_FICS_PREVIEW_ORIGIN='https://<stable-preview-alias>'
$env:CAISSA_FICS_GATEWAY_URL='wss://<staging-worker>.workers.dev/ws'
npm run build:fics:preview
vercel deploy .caissa-fics-preview/site --project tv-lavin-chess-game2 --scope elcriollitos-projects --yes
vercel alias set <deployment-url> <stable-preview-alias> --scope elcriollitos-projects
```

Use one stable, exact Vercel alias for the RC. Configure the isolated staging
Worker to allow only `https://<stable-preview-alias>`; never allow
`*.vercel.app`. Future preview deployments can move the alias without changing
the Worker allowlist.

The repository Playwright configuration already accepts an external HTTPS
base URL and disables its local server in that mode. The live spec is opt-in so
ordinary test runs cannot authenticate to FICS:

```powershell
$env:PLAYWRIGHT_BASE_URL='https://<stable-preview-alias>'
$env:CAISSA_FICS_EXPECTED_PREVIEW_ORIGIN='https://<stable-preview-alias>'
$env:CAISSA_FICS_EXPECTED_GATEWAY_URL='wss://<staging-worker>.workers.dev/ws'
$env:VERCEL_AUTOMATION_BYPASS_SECRET='<project automation bypass secret>'
$env:CAISSA_FICS_LIVE_PREVIEW_SMOKE='1'
npm run test:fics:preview-smoke
```

The bypass value is optional for an unprotected preview and required when
Vercel Deployment Protection is enabled. The harness sends it only to the exact
preview origin and asks Vercel to set the follow-up bypass cookie; it is never
written to the artifact, logs, or repository.

The smoke is read-only except for Guest authentication and the canonical
`observe` / `unobserve` pair. It validates the response CSP, runtime gateway,
WebSocket target, Guest identity, Players and Tables rendering, observation
state, browser errors, and the absence of seek, challenge, tell, draw, or resign
commands.
