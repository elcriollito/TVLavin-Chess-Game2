# AUTH-004B legal decision register

Audit date: October 25, 2026

Release candidate: `release/auth-004b-legal-publication`

Public contact: `privacy@caissa-chess.org`

This register separates verified implementation facts from proposed language and decisions that require Alexander or qualified legal counsel. It is not legal advice and does not approve publication.

| Item | Classification | Verified or proposed treatment | Required action before publication |
| --- | --- | --- | --- |
| A. Individual operator and Florida status | FACTS VERIFIED / LEGAL REVIEW REQUIRED | Alexander confirmed that CAISSA Chess is a free personal project operated by one individual, with no company, LLC, corporation, charges, active commercial subscriptions or current commercial revenue. Florida Statutes § 865.09 defines “business” by specified dealing in things of value or rendering services for compensation. The present no-compensation facts materially narrow, but do not conclusively resolve, fictitious-name applicability. | Obtain Florida legal confirmation whether the current free activity falls outside § 865.09 and whether public use of “CAISSA Chess” requires any registration or operator disclosure. Do not file or publish a personal address without a separate decision. |
| B. Privacy contact and legal notices | FACTUALLY VERIFIED / LEGAL REVIEW REQUIRED | `privacy@caissa-chess.org` is the official public contact. Cloudflare Email Routing is operational and a real external delivery test was confirmed by Alexander. No separate company or business address exists or is published. | Confirm whether any applicable law requires the individual's legal name, a postal notice address or another representative disclosure on the final pages. |
| C. Data retention and deletion | LEGAL REVIEW REQUIRED | Production has feature-specific expirations but no service-wide schedule. The audit found 97 beta Scanner scan rows, 92 beta feedback rows and 96 private beta image objects dating from September 20 through October 4, 2026. Neither private Scanner bucket has a lifecycle rule. Public Scanner feedback/certification tables and the public feedback-image bucket were empty at audit time, but the public tables are structurally append-only. | Approve a per-data-class retention schedule, lawful preservation exceptions, account-deletion behavior, image lifecycle and a verified request workflow before publication. |
| D. Minimum age and parental consent | HUMAN DECISION APPROVED / TECHNICAL CANDIDATE TESTED | Alexander approved a provisional minimum age of 16 for new account creation, replacing the earlier 13+ position. New under-16 accounts are deferred to a future CAISSA Junior initiative with separate legal review and verifiable parental consent where required. Public account-free access remains available where appropriate. The neutral month/year candidate is fail-closed and tested, but production registration remains paused. | Obtain counsel review, apply the prepared nonce migration in protected staging, certify Clerk restricted-invitation behavior and complete the Human Release Gate before enabling any sign-up path. |
| E. International data transfers | LEGAL REVIEW REQUIRED | Supabase production database, Auth, Storage and backups are primarily hosted in `us-east-1` (North Virginia). Supabase documents limited processing outside the selected region and SCC-based transfers to Singapore and the United States. Vercel and Clerk publish DPAs and cross-border mechanisms, but a complete provider/subprocessor and user-jurisdiction assessment is not finished. | Complete the provider/subprocessor inventory, identify relevant user jurisdictions and approve the final transfer disclosure and any required assessments or contractual steps. |
| F. Current and future commercial status | FACTUALLY VERIFIED / FUTURE ACTIVATION GATE | CAISSA is currently free, has no active paid subscription or commercial revenue, and has zero production Stripe events, zero Stripe-linked users and zero premium users. Existing credits and entitlements are internal access state, not evidence of a current paid offer. | No payment terms are needed for the current free service. Before any commercial feature is activated, conduct a new legal/product review and publish applicable pricing, billing, cancellation, refund, tax and privacy terms. |
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
- CAISSA's current free, noncommercial status is reflected directly; no paid service, subscription, renewal or refund program is presented as active.
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
- Florida Statutes § 865.09, Fictitious Name Act: https://leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0865/Sections/0865.09.html
- Florida Statutes § 501.171, Security of confidential personal information: https://leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.171.html
- Supabase Data Residency and Transfers FAQ: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Clerk Data Processing Addendum: https://clerk.com/legal/dpa
- Vercel Data Processing Addendum: https://vercel.com/legal/dpa
- Google Auth Platform, Manage OAuth App Branding: https://support.google.com/cloud/answer/15549049
- Google OAuth production policy compliance: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
- Google OAuth app state overview: https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
