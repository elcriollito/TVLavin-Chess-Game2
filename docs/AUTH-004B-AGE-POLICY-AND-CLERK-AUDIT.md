# AUTH-004B age policy and Clerk registration audit

Audit date: October 25, 2026

Status: policy approved; enforcement not implemented or certified

This document records implementation facts and a proposed minimum-data design. It is not legal advice and does not authorize production publication, account changes or reopening registration.

## Approved policy

- A user must be at least 13 years old to create a CAISSA Chess account, subject to any higher age or additional permission required by applicable law.
- Accounts for children under 13 are deferred to a future CAISSA Junior initiative with verifiable parental consent and appropriate privacy safeguards.
- Appropriate account-free public access may remain available, but public access does not authorize account creation or submission of personal information by a child.
- Existing accounts are not modified by this decision.

## Verified current production flow

- `https://www.caissa-chess.org/signup` returns the registration-paused page. It does not load the historical `js/signup-page.js` file or mount Clerk's SignUp component.
- The sign-in page mounts Clerk SignIn with `withSignUp: false` and `transferable: false`, so the CAISSA UI does not intentionally transfer an unknown sign-in identity into a new account.
- Clerk production has `sign_up_mode: restricted`.
- Clerk production requires and verifies an email at sign-up; phone and username are not required. First and last name are enabled but optional.
- Clerk production legal consent is disabled and its Privacy Policy and Terms of Service URLs are unset.
- Clerk production configuration exposes no native date-of-birth, age, or minimum-age rule. Clerk legal consent can require acceptance of legal documents, including after an OAuth return, but it is not an age-verification mechanism.
- The legacy `js/signup-page.js` mounts Clerk's prebuilt SignUp component without an age step. It must not be restored unchanged.

No users, accounts or Clerk settings were changed during this audit.

## Minimum-data implementation design

Keep production registration paused and Clerk sign-up restricted until all of the following are implemented and certified:

1. Place a neutral age screen before any Clerk request, email entry, OAuth redirect or other collection of personal information. Do not use only an “I am 13 or older” checkbox and do not reveal which answer unlocks registration.
2. Collect only what is needed to make the decision. A neutral month-and-year-of-birth input is the current FTC example. Evaluate it transiently, do not place it in URLs or logs, and do not retain the entered birth month or year.
3. Retain at most the allowed user's age-band result (`13-or-older`), policy version, decision timestamp and enforcement method. Do not store a birth date. An under-13 response must stop before Clerk or another service receives an email, name, OAuth identifier or account record.
4. Use a non-identifying, time-bounded browser control to prevent immediate back-button retries after an under-13 response, subject to counsel approval and the published storage notice.
5. Enforce the gate for every creation path: email/password, email code, Google or other OAuth, invitations, account linking and any direct/custom Clerk flow. Existing-user sign-in must remain distinct from new-user creation.
6. Clerk `unsafeMetadata` is not authoritative because it is writable from the frontend. If an attestation record or one-time eligibility token is used, validate and bind it server-side and fail closed before granting account-backed access.
7. After the legal pages are approved and published, enable Clerk legal consent with the canonical Privacy and Terms URLs as a separate control. It records agreement to the documents; it does not replace the neutral age screen.
8. Add automated bypass tests, OAuth return tests, blocked-under-13 tests with no personal-data transmission, existing-user sign-in tests, and manual mobile/desktop accessibility tests before reopening registration.

## Legal and product questions still requiring resolution

- Qualified counsel must confirm whether CAISSA is properly classified as a general-audience service in each launch jurisdiction and approve the neutral-screen design.
- Counsel must define the response, deletion and preservation procedure if CAISSA later obtains actual knowledge that an existing account belongs to a child under 13.
- CAISSA Junior requires a separate parental-notice, verifiable-consent, data-minimization, retention and parent-rights design before any implementation.

## Sources

- Clerk legal compliance: https://clerk.com/docs/guides/secure/legal-compliance
- Clerk user metadata security model: https://clerk.com/docs/guides/users/extending
- FTC COPPA FAQ: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
