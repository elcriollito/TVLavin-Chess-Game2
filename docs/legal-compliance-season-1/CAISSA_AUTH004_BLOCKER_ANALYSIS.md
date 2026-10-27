# CAISSA AUTH-004 Blocker Analysis

**Verified:** 2026-10-26
**Boundary:** analysis only. No Clerk, Google, Vercel, DNS, account or production changes.

## Minimum legitimate release requirements

AUTH-004 may proceed to human release review when all of the following are evidenced:

1. `/privacy` and `/terms` are accurate, publicly accessible on the verified CAISSA domain, linked from the homepage and match the Google consent-screen URLs (LEGAL-001).
2. The documents identify CAISSA Chess truthfully as an individual-operated free project, describe Google/Clerk data, public Scanner behavior, rights requests and current retention criteria without inventing a company/address.
3. Google Cloud uses the dedicated production project/client, External audience, only basic identity scopes, verified authorized domain and exact Clerk redirect `https://clerk.caissa-chess.org/v1/oauth_callback`.
4. Google publishing/verification state is suitable for the intended public audience.
5. Clerk Production uses matching custom Google client credentials stored only in Clerk, and a real authorization request contains a nonempty `client_id`.
6. Clerk issuer, key environment, authorized parties, JWKS key IDs/refresh and session cookies are production-consistent; invalid/stale tokens fail closed.
7. A real desktop and Mobile Safari sign-in/callback/session/sign-out test passes, including stale cookie recovery.
8. Registration eligibility is resolved: current Clerk terms do not permit personal data of end users under 16 without VPC evidence (AUTH-001). Sign-in for existing accounts must not silently create ineligible accounts.
9. Rollback and kill switch are tested; Scanner guest access remains credential-optional but rejects presented invalid credentials.

## Verified current state

- `/privacy` and `/terms` return 404; `/signup` returns 200 but registrations are paused.
- Clerk Production `sign_up_mode` is restricted.
- Google social connection is enabled in Clerk but custom client ID/secret are empty; provider configuration reports not configured.
- Clerk legal-consent capture is disabled and Privacy/Terms URLs are unset.
- Session maximum lifetime is seven days; multi-session is disabled; CAPTCHA/lockout/breached-password controls are enabled.
- Source uses official JWT verification, authorized parties and fail-closed invalid-token handling.
- The Google Cloud client/project/domain work described in prior AUTH tasks was not mutated by this audit; its live publishing state still needs release-time evidence.

## Separation of blockers

| Category | Genuine AUTH-004 blocker | Not an AUTH-004 blocker by itself |
|---|---|---|
| Google contract | Public homepage, matching Privacy/Terms, verified domain, production client/publishing, accurate branding/scopes | Future tournament/forum/Junior documentation |
| Applicable law | Truthful privacy/consumer disclosures; age eligibility and child-data handling; security | Forming an LLC, activating commerce, broad GDPR claim absent territorial facts |
| Clerk contract | Custom production OAuth credentials; under-16/VPC resolution | Future premium tiers or Scanner retraining |
| Technical security | Issuer/key/JWKS consistency, callback, state/nonce/library flow, safe stale-cookie handling, fail-closed invalid credentials | Disabling JWT verification or treating invalid credentials as guests |
| Governance | Versioned policy approval, test evidence, rollback/kill switch | Every P1/P2 audit recommendation |

## Privacy/Terms content required for AUTH-004

- Operator identity as CAISSA Chess, individually operated; `privacy@caissa-chess.org`.
- Account identifiers, Google basic profile/email, Clerk/Supabase/Vercel/Cloudflare roles, cookies/session and security logs.
- Scanner ordinary recognition versus optional feedback/image/training separation.
- No active subscriptions/commercial revenue; PayPal retired; future commerce needs new terms.
- Provisional age position stated accurately, with registration pause/current controls not overstated.
- Rights request channel, retention criteria/limitations, international-transfer and security disclosures at an accurate level.

## Remaining human/counsel questions

1. Choose the registered-account age path (16+ interim, 13-15 VPC/provider resolution, or alternative architecture).
2. Approve the final policy text and effective date; determine whether any postal identity disclosure is legally necessary.
3. Verify Google publishing state and approve insertion of credentials into Clerk in AUTH-004, not this branch.

## Decision

**HOLD AUTH-004 PRODUCTION RELEASE** until LEGAL-001, AUTH-001 and AUTH-002 acceptance criteria pass. Unrelated future-feature questions do not block OAuth.

## Primary sources

- [Google OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [Google OAuth branding requirements](https://support.google.com/cloud/answer/15549049?hl=en)
- [Clerk Google social connection guide](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google)
- [Clerk Standard Terms](https://clerk.com/legal/standard-terms)

