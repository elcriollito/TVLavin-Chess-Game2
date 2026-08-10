# Play v2 Public Beta operations runbook

Release owner: CAISSA release owner with Vercel environment and deployment authority.

## Open

Set `CAISSA_PLAY_V2_BETA_STAGE` to the exact value `public-beta` for the intended environment and create a reviewed deployment. Verify the four admitted routes, every prohibited route, Classic and Legacy, CSP/network silence, one board, Worker lifecycle and manual feedback. Do not configure Supabase credentials, beta session secrets, invitations or automatic feedback.

## Disable and verify

Set the environment value to `disabled` and deploy. Verify that `/play/beta`, Games, Bots and Coach return the runtime-free unavailable document while `/` and `/play` remain operational. Record the measured time from the disable decision to verified routing; do not claim an unmeasured response time. Verify no Play v2 Worker, clock or game continues after reload.

If the deployment itself is faulty, use Vercel rollback to the previously approved deployment. Reopening requires the exact `public-beta` value, a fresh deployment, route/security smoke and release-owner approval.

## Discord rotation

The channel URL is stable. The initial invitation is replaceable and expected to expire after 30 days. Before expiry, the release owner creates or approves a replacement, updates the single policy constant, runs allowlist/static/browser checks and ships through normal review. Never add Discord API, webhook or bot credentials. Never place report JSON in CAISSA logs or analytics.

## Incident workflow

For P0/P1: disable, deploy, verify unavailable, preserve sanitized evidence externally, assess rollback, and communicate status in the owned release channel. Record timestamps, affected routes, owner, deployment identity, verification and reopening decision. Exclude identities, reports, secrets, network details and private game data. Fixes require their own review and bounded regression before reopening.
