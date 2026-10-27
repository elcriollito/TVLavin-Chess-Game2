# Age Eligibility Decision

Status: TECHNICAL CANDIDATE IMPLEMENTED AND TESTED; POLICY DECISION BLOCKED.

## Verified requirement

Clerk's Standard Terms, last updated 2026-10-01, state that a customer must not send or store personal information of an end user under 16 without evidence of verifiable parental consent compliant with applicable privacy law. Clerk's privacy policy also says its services are not intended for children under 16. FTC COPPA guidance separately addresses personal information from children under 13 and warns that a simple age checkbox is not a neutral age screen.

Sources reviewed on 2026-10-27:

- https://clerk.com/legal/standard-terms
- https://clerk.com/legal/privacy
- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions

## Recommendation

Use temporary 16+ account registration while preserving public, non-account access where appropriate. This is the lowest-complexity technical route consistent with the verified Clerk contract. It is not a substitute for legal advice.

Do not offer 13–15 account registration through Clerk unless Alexander has:

- documented provider permission;
- counsel-approved verifiable parental consent, notice, deletion and retention processes;
- a tested parent/guardian identity and revocation workflow;
- a data-minimized implementation that avoids collecting full date of birth unless justified.

## Implemented

`js/auth/age-eligibility.js` accepts only neutral bands (`under_13`, `13_to_15`, `16_plus`, `undisclosed`), stores no date of birth, defaults registration to disabled, and fails closed. Only `16_plus` becomes eligible when a future caller explicitly enables registration. The module returns no submitted band, limiting accidental persistence.

## Tested

Tests cover disabled registration, under-13 and 13–15 rejection, 16+ eligibility, undisclosed/malformed input, neutral result codes, and non-disclosure of the submitted band.

## Not activated

There is no production age gate and no claim that existing accounts were age-verified. Existing accounts were not modified. Signup remains restricted. Direct route and API enforcement must be implemented and certified as a separate activation change after Alexander approves the policy.

## Human decision

Choose one:

- approve temporary 16+ account registration and authorize implementation/activation; or
- keep registration restricted while obtaining counsel and Clerk approval for a 13–15 parental-consent system.
