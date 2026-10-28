# AUTH-004H Google OAuth Production readiness

Read-only verification: October 27, 2026

Status: **NOT READY FOR PRODUCTION ACTIVATION — ORDERED PROVIDER STEPS PENDING**

No Google setting, credential, declaration, publication state, or test user was changed.

## Verified current state

| Control | State |
| --- | --- |
| Project | `caissa-chess-production-auth`, Active, under organization `651564845200` |
| Project display name | CAISSA Chess - Production Auth |
| App name | CAISSA Chess |
| Audience | External |
| Publishing status | Testing |
| OAuth Web client | CAISSA Chess - Production; enabled |
| Authorized redirect | `https://clerk.caissa-chess.org/v1/oauth_callback` |
| Authorized domain | `caissa-chess.org` |
| Homepage | `https://www.caissa-chess.org` |
| User support/developer contact | Configured in Google; values intentionally omitted from this report |
| Privacy URL | Blank |
| Terms URL | Blank |
| App logo | Not configured |
| Publish control | Disabled until Branding is complete |
| OAuth traffic | No current project traffic shown on overview |

The client identifier and secret are credential material and are intentionally omitted. The existing secret was not viewed, copied, regenerated, or transmitted.

## Scope posture

The release contract permits only OpenID Connect identity scopes:

- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/userinfo.profile`

Google documents these as basic identity scopes. The Data Access page did not yield a stable readable state during this audit; therefore AUTH-004H does **not** claim that its console scope list is independently certified. The application and Clerk connection must be inspected at release time to confirm no additional scopes are requested.

## Required ordered actions

1. Obtain legal approval for exact Privacy and Terms text.
2. Publish those pages and verify public HTTPS 200 on mobile/desktop.
3. With separate approval, enter the canonical URLs in Google Branding; add a logo only if Alexander approves the asset and resulting verification requirement.
4. Confirm only the three basic identity scopes.
5. Review Google's displayed declarations and verification/publication requirements; Alexander must personally approve any attestation or publication action.
6. Change status from Testing only through Google's authorized workflow.
7. Securely install the existing dedicated client credentials into Clerk Production; never put them in Git, reports, chat, or Vercel unless the architecture explicitly requires it.
8. Test authorization URL `client_id`, exact redirect, callback, account link/create behavior, Mobile Safari, logout/login, and existing-user preservation.

## Current provider blocker

Google production publication cannot be completed until Branding includes approved public legal URLs. This is an expected release dependency, not a runtime defect.

## Official sources

- Google audience/publishing guidance: https://support.google.com/cloud/answer/15549945
- Google OAuth scopes: https://developers.google.com/identity/protocols/oauth2/scopes
- Google production policy readiness: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- Clerk Google connection guide: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google
