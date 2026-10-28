# AUTH-004H Clerk Production readiness

Read-only verification: October 27, 2026

Status: **CORE PRODUCTION INSTANCE READY; GOOGLE/LEGAL/REGISTRATION ACTIVATION PENDING**

No Clerk configuration, user, session, invitation, or credential was changed.

## Verified identity and domain

| Item | State |
| --- | --- |
| Application | `app_38rhCJXZbKJZGln3mL8wFm7Iaxr` — CAISSA Chess |
| Production instance | `ins_3KCrtSZ0xYIWxGejoyQf5JvUsjH` |
| Publishable-key class | Production (`pk_live_` identity); complete value omitted |
| Frontend API | `https://clerk.caissa-chess.org` |
| Account portal | `https://accounts.caissa-chess.org` |
| DNS / SSL / mail | Complete |
| Signup mode | Restricted |

## Security and authentication settings

- Email is required and verified for sign-up; email code sign-in is enabled.
- Password authentication is enabled, including breached-password checking and device trust.
- CAPTCHA smart mode, email-link same-client protection, enumeration protection, PII protection, and user lockout are enabled.
- Multi-session is disabled; maximum session lifetime is seven days.
- Existing email/password login remains a release invariant.
- Google is marked enabled but its required dedicated production `client_id` and `client_secret` are not configured. Clerk's deployment inspection reports the provider as `configured: false`.
- Clerk legal consent is disabled and Privacy/Terms URLs are null.

## Issuer/JWKS compatibility

The candidate retains strict JWT validation, authorized-party checking, invalid-token rejection, and bounded JWKS refresh/recovery. The earlier production `jwk-kid-mismatch` hotfix certification remains part of technical candidate `2e4e23b5...`; no verification bypass is introduced.

Immediately before release, verify the live issuer and `/.well-known/jwks.json` key IDs without logging tokens or keys, then run valid, expired, invalid-signature, unknown-kid, and JWKS-unavailability cases.

## Secure Google credential installation procedure

1. Confirm Google app is In production and legal URLs are public.
2. Open the Google connection on this exact Clerk Production instance.
3. Verify Clerk displays the exact callback already registered in Google.
4. Enter the dedicated client ID and secret directly into Clerk Production using an authorized secret-handling workflow.
5. Save only after Alexander approves this provider action.
6. Confirm configuration reports both required fields present without reading them back.
7. Run Account Portal and CAISSA end-to-end login tests; inspect `oauth_callback.failed` events if needed.
8. Keep restricted signup and invitation enforcement unchanged.

Credential replacement is not currently justified: the Google client exists and is enabled. If its secret is unavailable to the authorized operator, create/rotate only under a separate explicit approval and revoke obsolete material after successful cutover.

## Release blockers

- Google Branding/publication is incomplete.
- Dedicated Google credentials are not installed in Clerk Production.
- Legal consent is not configured.
- Production registration migration/variables are absent by design.

Official references:

- https://clerk.com/docs/guides/development/deployment/production
- https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google
- https://clerk.com/legal/standard-terms
