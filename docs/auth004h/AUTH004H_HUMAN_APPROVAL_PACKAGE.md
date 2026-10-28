# AUTH-004H human approval package

Status: **TECHNICALLY CERTIFIED — LEGAL APPROVAL PENDING**

This package separates approvals. Approval of one item does not authorize any other item.

## Candidate identity

- Technical candidate: `2e4e23b5c96e1724ae87735851ac9a7b77332b02`
- Production baseline: `6e912be5c314080be8944efde261b8dc133452a6`
- AUTH-004H package branch: `release/auth004h-final-package`
- AUTH-004H final package SHA: recorded after commit in the release report/final handoff
- Runtime delta introduced by AUTH-004H: none; documentation only

## Approval 1 — final legal text

**Action:** approve the exact Privacy Policy and Terms text for publication after qualified review.

**Consequence:** the texts become public representations/contract terms. They cannot be fully retracted from people or caches after publication.

**Required first:** resolve or accept counsel's disposition of retention, suspension/appeal, liability, governing law/disputes, material-change notice, operator/address disclosure, and international applicability.

## Approval 2 — Release A legal pages

**Action:** publish only `/privacy` and `/terms` from the approved immutable release.

**Consequence:** public URLs become available for users and Google Branding; authentication/registration remains unchanged.

## Approval 3 — Release B Google Branding/publication

**Action:** enter approved legal URLs, confirm only basic identity scopes, and follow Google's displayed publication/verification flow.

**Consequence:** the OAuth app may move from Testing toward public production availability. Any Google declaration/attestation must be approved at action time.

## Approval 4 — Release C Clerk Google credentials

**Action:** install the dedicated existing Google Web client credentials into Clerk Production instance `ins_3KCrtSZ0xYIWxGejoyQf5JvUsjH`.

**Consequence:** Google sign-in can operate against the production Clerk instance after redeployment/testing. Restricted signup must remain enabled.

## Approval 5 — Clerk legal consent

**Action:** set the exact approved Privacy and Terms URLs and enable the approved consent behavior in Clerk Production.

**Consequence:** Clerk registration surfaces can require legal acceptance. This does not replace the 16+ eligibility screen.

## Approval 6 — Release D Supabase migration

**Action:** apply only `20261027120000_registration_age_gate.sql` with SHA-256 `92CBBCBF64251EEBD3CEFE6B96EEB437C8317106373349DD599190D2B242831C` to production project `jczauvkfkweuvdpurpem` using the certified transaction plan.

**Consequence:** dormant nonce/rate-limit tables and service-role RPCs are added. Registration remains disabled.

## Approval 7 — Release E application

**Action:** deploy/promote the exact approved immutable application candidate with registration still paused.

**Consequence:** legal/auth runtime changes become production code, but no new account path opens. Existing login, Scanner, Beta, and mobile smokes are mandatory.

## Approval 8 — retention policy

**Action:** select retention/deletion outcomes in the matrix after counsel review.

**Consequence:** authorizes a later implementation task; it does **not** authorize immediate deletion of real data or historical Scanner evidence.

## Approval 9 — Release F registration activation

**Action:** configure the dedicated production gate secret and the three explicit release confirmations, then redeploy after A–E pass.

**Consequence:** eligible new users can receive automatic restricted invitations and complete Clerk signup. The kill switch remains the registration release variable.

**This approval must be separate and last.**

## Required release-night evidence

- Exact deployment ID/SHA and no unexpected file delta.
- Legal pages public 200, canonical, mobile/desktop/a11y, official contact.
- Google production status and three-scope inspection.
- Clerk production keys/issuer/JWKS/domain and callback without secret disclosure.
- Migration checksum/object/ACL/RLS/concurrency verification.
- Existing account login/sync/refresh/logout.
- Direct signup, invitation transfer/replay, invalid JWT, CSRF/origin, and quota rejection.
- Scanner guest/authenticated/feedback/review policies.
- Beta Program and owner authorization.
- Kill switch and independent rollback verification.

## Current recommendation

Do not approve publication or production actions until qualified legal review closes the C/D decisions. All technical preparatory work is complete enough for that review.

Decision: **TECHNICALLY CERTIFIED — LEGAL APPROVAL PENDING**
