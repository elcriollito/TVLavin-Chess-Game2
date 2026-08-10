# Play v2 Public Beta operations runbook

> **Season 11.10 canonical operation:** the active user-facing routes are `/play`, `/play/games`, `/play/bots`, and `/play/coach`. The former admitted `/play/beta` routes are permanent redirects only. Keep using the existing exact `public-beta` stage as the technical deployment gate until a separately reviewed variable migration; do not display Beta branding. A disabled rollback deployment may restore the previously approved Legacy `/play` owner.

Release owner: CAISSA release owner with Vercel environment and deployment authority.

## Open

Set `CAISSA_PLAY_V2_BETA_STAGE` to the exact value `public-beta` for the intended environment and create a reviewed deployment. Verify the four official routes, every prohibited route, Classic, the permanent retired-beta redirects, CSP/network silence, one board, Worker lifecycle and manual feedback. Do not configure Supabase credentials, beta session secrets, invitations or automatic feedback.

## Disable and verify

Set the environment value to `disabled` and deploy. On the canonical-routing build, verify that official Play routes return the runtime-free unavailable document while `/` remains Classic. A rollback to the previously approved pre-promotion deployment restores its former Legacy `/play` owner. Record the measured time from the disable decision to verified routing; do not claim an unmeasured response time. Verify no Play v2 Worker, clock or game continues after reload.

If the deployment itself is faulty, use Vercel rollback to the previously approved deployment. Reopening requires the exact `public-beta` value, a fresh deployment, route/security smoke and release-owner approval.

## Discord enrollment

The channel URL remains available only for existing members. The revoked invitation is absent from policy and UI; do not invent or republish an invite. A durable replacement requires a separate reviewed change. Never add Discord API, webhook or bot credentials. Never place report JSON in CAISSA logs or analytics.

## Incident workflow

For P0/P1: disable, deploy, verify unavailable, preserve sanitized evidence externally, assess rollback, and communicate status in the owned release channel. Record timestamps, affected routes, owner, deployment identity, verification and reopening decision. Exclude identities, reports, secrets, network details and private game data. Fixes require their own review and bounded regression before reopening.
