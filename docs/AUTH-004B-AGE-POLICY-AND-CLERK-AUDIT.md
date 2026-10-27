# AUTH-004 age policy and Clerk registration certification

Audit date: October 27, 2026

Status: 16+ policy approved; technical candidate implemented and tested; production activation blocked by the Human Release Gate

This record is not legal advice and does not authorize production publication, account changes, a database migration, Clerk configuration changes, or reopening registration.

## Approved policy

- A person must be at least 16 years old to create a new CAISSA Chess account, subject to any higher age or additional permission required by applicable law. This replaces the former provisional 13+ position.
- New accounts for people under 16 are deferred. Existing accounts are not modified, classified, suspended, or deleted by this change.
- Appropriate account-free public chess tools may remain available. Public access does not authorize account creation or submission of personal information by a child.
- CAISSA Junior is a future, separately gated initiative and is not implemented by this candidate.

## Read-only Clerk production verification

The connected Clerk production instance was read on October 27, 2026 without mutation.

- Application: `app_38rhCJXZbKJZGln3mL8wFm7Iaxr`
- Production instance: `ins_3KCrtSZ0xYIWxGejoyQf5JvUsjH`
- `sign_up_mode` remains `restricted`.
- Email is required and verified at sign-up; phone and username are not required.
- Google is marked enabled but has no configured client ID or secret, so it is not a ready production sign-up path.
- Clerk legal consent remains disabled and its Privacy Policy and Terms URLs remain unset.
- No Clerk setting, user, invitation, or account was changed.

## Technical candidate

The candidate uses an invitation-first architecture so a visual or route change cannot by itself create an account.

1. The `/signup` document shows the existing pause page unless the server confirms every release prerequisite. Query strings or DOM changes cannot enable the server gate.
2. When a future authorized release enables the gate, the first step asks neutrally for birth month and year before email or OAuth and before any Clerk request. It does not ask for a full date of birth, email, name, OAuth identity, or Clerk identifier.
3. The server evaluates month/year transiently. Someone who may turn 16 during the current month is conservatively held until the next month because CAISSA does not collect a birth day.
4. CAISSA does not retain those values: the response and application logs contain no submitted month or year, and the values are not placed in URLs, browser storage, Clerk metadata, or the database.
5. An eligible decision produces a short-lived, host-only, Secure, HttpOnly, SameSite=Strict signed cookie. An ineligible decision produces a longer, non-identifying blocked cookie to reduce immediate back-button retries.
6. Only the invitation endpoint accepts email, and only after it validates the eligible cookie. A fail-closed, atomic Supabase limiter bounds eligibility by request source and invitations by source and recipient; it stores only HMAC digests and short window counters, never raw IP addresses or email addresses.
7. The invitation endpoint atomically consumes a one-way nonce digest before requesting a one-day Clerk invitation.
8. The invitation carries only policy version, screening method, and screening timestamp. These are an attestation of the completed self-declaration flow, not proof of age.
9. Direct email, API, invitation and OAuth account creation remain blocked by Clerk restricted mode. OAuth may be offered only after a valid restricted invitation. The sign-in UI continues with `withSignUp: false` and `transferable: false`, so an unknown OAuth identity is not transferred into sign-up.
10. The old prebuilt `Clerk.mountSignUp` client was removed. No public CAISSA API exposes Clerk `users.createUser`.
11. Every release dependency fails closed. Missing flags, limiter confirmation, database credentials, secret, Clerk server key, migration, same-origin request, exact JSON shape, valid cookie, capacity claim, or atomic nonce consumption prevents invitation issuance.

## Release prerequisites not activated

- Obtain final qualified legal review of the general-audience classification, jurisdictions, disclosure, and actual-knowledge response.
- Publish approved Privacy Policy and Terms, then configure Clerk legal consent separately. Legal consent does not replace the age screen.
- Apply `20261027120000_registration_age_gate.sql` to protected staging first and rehearse rollback. Production migration is not authorized.
- Re-audit Clerk immediately before release and confirm restricted invitation-only sign-up, no alternative provider path, and correct legal URLs.
- Configure a dedicated 32+ byte registration-gate secret and explicitly set the release, restricted-invitation and durable-limiter confirmations only after human approval.
- Rehearse the migration's durable source/recipient limiter under concurrency and verify bounded cleanup/retention before public activation.
- Run a real invitation acceptance test in protected staging for email and Google, including new-user denial without an invitation and existing-user sign-in.

## Applicable source constraints

- Clerk Standard Terms, updated October 1, 2026, state that customers must not send or store personal information of an end user under 16 without evidence of legally compliant verifiable parental consent.
- Clerk's Privacy Policy says its services are not intended for children under 16, while clarifying that customer data is governed by the customer and the customer contract.
- FTC COPPA guidance recommends a neutral age screen at the point personal information or a user ID would otherwise be collected; month/year entry is an example, while a checkbox announcing the threshold is not neutral.

Sources:

- https://clerk.com/legal/standard-terms
- https://clerk.com/legal/privacy
- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
