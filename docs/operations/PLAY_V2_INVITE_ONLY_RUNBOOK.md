# Play v2 invite-only operations runbook

> **Historical only:** invite-only was superseded before deployment by direct Public Beta. Do not configure or validate Supabase invitations for the active release. Use the Public Beta stage and rollback procedure in [`PLAY_V2_PUBLIC_BETA_ARCHITECTURE.md`](../architecture/PLAY_V2_PUBLIC_BETA_ARCHITECTURE.md).

## Manual issue reports

Authorized testers use **Report an issue**, review the sanitized preview, then Copy or Download the JSON. They explicitly open the private feedback channel, create one message or thread per issue, and paste or attach the report. Screenshots are added only after manual privacy review. CAISSA never posts automatically and operators must not introduce a webhook, bot token, temporary Discord invite or automatic Supabase feedback call.

The historical feedback endpoint is intentionally fail-closed. Do not interpret database feedback tables or RPCs as an active client transport. This change does not close the independent invitation, session, revocation, kill-switch, Preview deployment, NVDA or focal device-smoke gates.

Owner: CAISSA release owner

Incident backup: **REQUIRED BEFORE FIRST INVITATION**

## Configuration placeholders

Set only in the intended Vercel environment, never in Git or a public client bundle:

- `CAISSA_PLAY_V2_BETA_STAGE=invite-only`
- `CAISSA_PLAY_V2_SESSION_SECRET=<32-or-more-random-bytes>`
- `SUPABASE_URL=<project-url>`
- `SUPABASE_SERVICE_ROLE_KEY=<server-only-key>`

Public-beta remains closed because the policy accepts only exact `invite-only`. Apply `supabase/migrations/20260808_play_v2_invite_only.sql` only under a separate database-change authorization. Verify grants and RLS after application.

The initial migration is immutable once applied. Apply `supabase/migrations/20260809_play_v2_feedback_sensitive_rejection.sql` only as a separately authorized forward-only correction and only after a dry-run lists that file alone. Revalidate the shared rejected/accepted corpus against PostgreSQL itself, effective helper/RPC grants, generic non-echoing rejection, atomic five-per-hour behavior, and final zero-data cleanup. Local Node/static results do not substitute for this database gate.

If the corrective migration fails, stop after confirming transaction rollback; do not edit applied history or use migration repair. If it applies but validation fails, disable the program, remove synthetic rows, preserve both migration records, and prepare another reviewed forward-only migration. The next database phase may target only the explicitly authorized dedicated QA project; never infer or reuse another Supabase target.

## Local private CLI

Run with process-only Supabase configuration:

```text
node scripts/play-beta-admin.mjs create --cohort initial-five
node scripts/play-beta-admin.mjs create --cohort coach-review --coach
$inviteToken | node scripts/play-beta-admin.mjs revoke-invite --token-stdin --confirm
$inviteToken | node scripts/play-beta-admin.mjs revoke-sessions --token-stdin --confirm
node scripts/play-beta-admin.mjs revoke-session --id <session-uuid> --confirm
node scripts/play-beta-admin.mjs revoke-all-sessions --confirm
node scripts/play-beta-admin.mjs purge-feedback --confirm
node scripts/play-beta-admin.mjs status
node scripts/play-beta-admin.mjs enable
node scripts/play-beta-admin.mjs disable --confirm
```

The `create` result displays the token once. Do not paste it into tickets, logs or analytics. Deliver it privately. There is no public administration panel.
Revocation reads the original token only from stdin so it never appears in the CLI command line. In PowerShell, load it into the process-local `$inviteToken` variable without placing the literal token in command history, pipe it to the command, then clear that variable.
Run `purge-feedback --confirm` on the approved retention schedule and verify that no row remains past `delete_after`.

## Monitoring

Invite-only minimum evidence:

- synthetic unauthorized and authorized route checks;
- redeem/session/feedback 5xx and latency;
- aggregate authorized-session count, without identity or raw IP;
- Worker initialization/termination failures;
- CSP reports with URL query/fragment removed;
- build commit and deployment ID;
- feedback submission failures;
- kill-switch changes and operator;
- alert to the release owner and named backup.

Clarity, behavioral analytics, funnels, experiments and game-content telemetry stay disabled. Select the alert provider/channel before the first invitation.

## Kill switch

1. Run `node scripts/play-beta-admin.mjs disable --confirm`.
2. Confirm `/api/play-beta/status` rejects an existing session within 60 seconds.
3. Confirm the browser disposes the simplified shell and returns to unavailable.
4. Confirm Worker, clocks, observers and timers are stopped.
5. Confirm `/play/beta` and descendants fail closed while `/` and `/play` remain normal.
6. Revoke affected invitation sessions.
7. If necessary, deploy the hard ceiling `CAISSA_PLAY_V2_BETA_STAGE=disabled` under separate authorization.

## Rollback rehearsal

Use a protected preview. Record deployment/commit, initial route matrix, one synthetic session, Worker `0→1→0`, kill-switch timestamp, closed-route timestamp, Classic/Legacy smoke, feedback rejection, cache headers and clean logs. Roll back the deployment only after the database kill switch is false. Never use a Vercel automation bypass token as a tester invitation.

## First-cohort acceptance

- five invitations maximum;
- Games/Bots for all; Coach only by capability;
- Windows Chrome/Edge and keyboard green;
- NVDA green before delivery;
- iPhone/iPad focal CSS and access-flow smoke;
- Android explicitly excluded;
- feedback review and incident channel operational;
- no public navigation, indexing, Players, FICS, education, Clarity or analytics transport.
