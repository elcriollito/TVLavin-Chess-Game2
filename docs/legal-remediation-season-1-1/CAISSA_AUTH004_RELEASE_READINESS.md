# AUTH-004 Release Readiness

Status: READY FOR HUMAN APPROVAL; production activation BLOCKED.

## Files changed

`api/_lib/auth.js`, `api/_lib/scanner-public-recognition-service.js`, `api/_lib/scanner-public-service.js`, `css/caissa-auth.css`, `css/home/home.css`, `css/legal.css`, three `docs/AUTH-004B-*` reports, `home.html`, `js/auth/age-eligibility.js`, `package.json`, `privacy.html`, `public/sitemap.xml`, `scanner/public/scanner-public-client.js`, `server.js`, `signin.html`, `signup.html`, `terms.html`, four focused test files and `vercel.json`.

## Implemented

Branch `remediation/auth004-legal-age` contains public Privacy and Terms routes, canonical metadata, homepage/sign-in/sign-up links, `privacy@caissa-chess.org`, the current free personal-project facts, the authentication incident fixes, and a non-activated age-band candidate.

The auth hotfix preserves anonymous Scanner requests, accepts explicit valid bearer sessions, rejects malformed/invalid credentials, refreshes JWKS safely on key mismatch, validates issuer, and preserves Beta Program authorization.

## Clerk production audit

Read-only inspection on 2026-10-27 found:

- production instance `ins_3KCrtSZ0xYIWxGejoyQf5JvUsjH` for application `app_38rhCJXZbKJZGln3mL8wFm7Iaxr`;
- sign-up mode restricted; multi-session disabled; CAPTCHA, enumeration protection, breached-password checks and lockout enabled;
- `caissa-chess.org`, `clerk.caissa-chess.org` and `accounts.caissa-chess.org` verified;
- Google connection enabled in name only, with no production client ID or client secret configured;
- legal consent disabled and Privacy/Terms URLs unset in Clerk.

No Clerk setting was changed.

## Tested

- 49 Node authentication/legal/age/Scanner security tests passed.
- 10 legal-page browser tests passed in Chromium and WebKit, including mobile layout.
- Existing signup remains paused and does not initialize Clerk, so the age candidate cannot accidentally activate.
- Protected preview `dpl_DBwXxmN74TZrA5pNBP7tR25dVmJk` is `READY`, `public=false`, has no production alias and is bound to exact SHA `439fe76350d293a57bcd51b6d863ff46216894ff`. Authenticated read-only smoke checks returned 200 for `/privacy`, `/terms` and `/signup`, confirmed the public privacy contact/project facts, and confirmed registration remains paused with no Clerk signup script.

## Ready for approval

Alexander may approve these separately:

1. legal copy and publication of this branch;
2. temporary 16+ account registration policy and activation work;
3. secure insertion of the already-created Google OAuth credentials into Clerk Production;
4. Clerk legal-consent configuration after the canonical pages are public.

## Blocked

- Google sign-in cannot be certified until Clerk Production receives the authorized Google Web client credentials and callback tests pass.
- The public documents still accurately describe the owner-approved provisional 13+ policy. A 16+ change was not made silently.
- Counsel review is recommended before changing the age policy or relying on parental consent.

## Rollback

Revert the lane commit range or redeploy the prior production SHA. No schema or user-account rollback is required because this lane contains no production data mutation.
