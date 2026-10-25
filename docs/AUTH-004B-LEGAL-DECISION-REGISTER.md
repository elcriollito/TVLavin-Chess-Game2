# AUTH-004B legal decision register

Audit date: October 25, 2026

Release candidate: `release/auth-004b-legal-publication`

Public contact: `privacy@caissa-chess.org`

This register separates verified implementation facts from proposed language and decisions that require Alexander or qualified legal counsel. It is not legal advice and does not approve publication.

| Item | Classification | Verified or proposed treatment | Required action before publication |
| --- | --- | --- | --- |
| A. Individual operator identification | LEGAL REVIEW REQUIRED | CAISSA Chess is operated by an individual and is not represented as an LLC or corporation. The operator's personal identity and residential address are not included in the draft. Florida's official guidance says a person conducting business under a name different from the person's legal name generally must register a fictitious name; the filing is a public record. | Confirm with Florida counsel whether the present activity is “conducting business,” whether an exemption applies, and what operator identification or notice address must appear. Complete any required fictitious-name filing without using this repository as the filing system. |
| B. Privacy contact and legal notices | FACTUALLY VERIFIED | `privacy@caissa-chess.org` is the public contact. Cloudflare Email Routing is operational and a real external delivery test was confirmed by Alexander. The private forwarding destination is not published. | Decide whether a separate postal or service-of-process address is legally required. |
| C. Data retention and deletion | LEGAL REVIEW REQUIRED | Some code-defined expirations exist, but there is no approved service-wide schedule. Public Scanner evidence and certifications are append-only and feedback images have no approved public deletion schedule. The draft promises request evaluation, not automatic deletion. | Approve a per-data-class retention schedule, lawful exceptions and a verified deletion/request workflow. |
| D. Minimum age and parental consent | HUMAN DECISION REQUIRED | The service is general-audience and not designed specifically for children. No minimum account age or parental-consent workflow is approved. | Select an age policy with counsel, then align Clerk configuration, signup copy and request handling. |
| E. International data transfers | LEGAL REVIEW REQUIRED | Users and providers may be in different countries. The contracting entities, processing regions and transfer mechanisms have not been fully documented. | Inventory provider regions and contracts, then approve jurisdiction-specific transfer disclosures. |
| F. Payment, subscription and refund terms | HUMAN DECISION REQUIRED | Stripe code exists, but the production environment audit found no Stripe configuration and no enabled credit-store flag. Paid checkout is not treated as active. | Before activation, approve offers, billing frequency, cancellation, refunds, taxes and support handling; then update both legal pages. |
| G. Suspension and appeal procedure | HUMAN DECISION REQUIRED | Security, abuse and fair-play restrictions are described at a high level. No final notice, appeal or termination process exists. | Approve triggers, notice exceptions, appeal channel, response expectations and record retention. |
| H. Liability provisions | LEGAL REVIEW REQUIRED | The draft includes only a general “as is/as available” disclosure and preserves non-waivable rights. It deliberately contains no monetary cap or damage exclusions. | Obtain jurisdiction-appropriate language from qualified counsel. |
| I. Governing law and disputes | LEGAL REVIEW REQUIRED | No governing law, forum, arbitration requirement or class-action waiver is proposed. | Obtain qualified legal advice and make an explicit human decision. |
| J. Material policy updates | HUMAN DECISION REQUIRED | Revision dates are supported, but notice timing, delivery and re-acceptance rules are not approved. | Approve a material-change notice and consent procedure before publication. |

## Verified implementation facts reflected in the drafts

- Clerk provides account and session handling; Google Sign-In is not yet active in CAISSA production.
- The Google OAuth plan is limited to the three basic identity scopes. Google Auth Platform currently has no saved Data Access scopes, so scope readiness is incomplete rather than certified.
- Vercel Web Analytics is loaded only on the CAISSA production hosts and strips query strings and fragments before sending events.
- Microsoft Clarity is retired from production documents and the active content-security policy.
- Scanner recognition submits image data to the recognition endpoint and requires Review/Edit before confirmation.
- Scanner improvement feedback is optional, account-gated, separates image and correction consent, begins `raw-unverified`, uses private image storage when consented, and requires human certification before training eligibility.
- The public Scanner corpus and certification history are append-only; no automatic training or online weight update path is represented.
- Production Stripe activation was not found, so paid checkout is described as inactive.
- Optional AI requests can send prompts and chess context to the selected provider. User-supplied provider keys are held in page memory and cleared on auth change, page hide or provider changes.

## Google OAuth readiness snapshot

- Project: `caissa-chess-production-auth`
- App name: CAISSA Chess
- Audience: External, Testing
- Web client: CAISSA Chess - Production
- Redirect URI: `https://clerk.caissa-chess.org/v1/oauth_callback`
- Authorized domain: `caissa-chess.org`
- Homepage URL: `https://www.caissa-chess.org`
- Privacy URL: not configured
- Terms URL: not configured
- Logo: not configured
- Data Access scopes saved in Google Auth Platform: none
- Search Console domain property: verified owner
- Publication: not submitted; Publishing remains disabled until Branding is complete

The next Google action is to publish approved legal pages, then enter the canonical Privacy and Terms URLs, decide whether to provide a square logo, explicitly save only `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile`, and review Branding verification. No declaration or publication action should be accepted without Alexander's approval.

## Official references reviewed

- Florida Department of State, Fictitious Name Registration: https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration
- Google Auth Platform, Manage OAuth App Branding: https://support.google.com/cloud/answer/15549049
- Google OAuth production policy compliance: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- Google OAuth app state overview: https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
