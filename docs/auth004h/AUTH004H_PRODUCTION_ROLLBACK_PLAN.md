# AUTH-004H production rollback plan

Status: **PREPARED — DESTRUCTIVE ROLLBACK REQUIRES EXPLICIT APPROVAL**

## Universal rules

1. Stop the affected release stage; do not continue downstream.
2. Preserve logs, deployment IDs, timestamps, and sanitized error codes without tokens or secrets.
3. Protect existing accounts and sessions unless a security incident requires a separately approved revocation.
4. Disable registration first. Do not weaken JWT, RLS, invitation, or origin controls.
5. Roll back each provider independently; a Vercel rollback does not change Google, Clerk, or Supabase.

## Vercel application

- Kill switch: unset/disable `CAISSA_REGISTRATION_RELEASE`; the app fails closed.
- Promote the known-good production deployment that preceded AUTH-004.
- Verify `/`, `/signin`, `/scanner`, `/beta`, and existing-user session behavior.
- Do not assume a deployment rollback removes newly added production env variables; audit them separately.

## Registration variables

- Remove/disable the release confirmation first.
- Keep Clerk restricted and invitation-only.
- Preserve the HMAC secret until all outstanding signed states expire and incident evidence is understood; do not rotate merely to troubleshoot.
- A later restart requires full gate verification.

## Clerk Google provider

- Disable the Google connection if callback/session creation is unsafe.
- Preserve email/password login, existing users, linked identities, and sessions.
- Do not delete users or unlink identities during emergency stabilization.
- Revoke/rotate Google credential material only when compromise/loss is established and Alexander separately approves.

## Google OAuth

- Return/keep audience in Testing or disable the OAuth client when provider behavior is unsafe.
- Do not delete the project/client as a rollback.
- Removing legal URLs or changing Branding does not retract consent already granted; document the incident and user impact.

## Supabase age-gate migration

- Before commit: transaction rollback.
- After commit: leave additive objects dormant while registration is disabled.
- Only drop the two functions/tables after proving no rows, dependencies, or audit need and obtaining explicit destructive approval.
- Never roll back by weakening RLS or granting browser roles.

## User synchronization

- Keep existing idempotent sync and profile bindings.
- If sync fails, show a recoverable error and stop registration activation; do not create duplicate users or manually rewrite production identities.
- Revert only the application function/deployment after confirming schema compatibility.

## Legal pages

- For a factual/legal error, publish a corrected approved version and retain an internal version record.
- A technical rollback may restore the prior site, but it cannot guarantee removal from caches, archives, screenshots, or users who already relied on it.
- Notify affected users only under an approved notice/incident procedure.

## Success criteria after rollback

- Registration closed.
- Existing-user login and logout operational.
- No unauthorized account creation or duplicate identity.
- Scanner guest/auth policies intact.
- Beta owner/reviewer authorization intact.
- Database RLS/service-role boundaries intact.
- Incident evidence and exact final configuration recorded.
