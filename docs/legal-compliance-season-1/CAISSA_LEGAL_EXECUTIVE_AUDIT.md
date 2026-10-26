# CAISSA Chess Legal & Compliance Season 1.0

## Executive audit

**Status:** Audit complete; human legal and product review required  
**Evidence date:** 2026-10-25  
**Repository baseline:** `d7c48e52465b8764d102313c03cf639c38b3db6f`  
**Production reviewed:** `https://www.caissa-chess.org`  
**Operator posture supplied for this audit:** personal project; no registered company; no active paid subscriptions; no reported commercial revenue  
**Public privacy contact:** `privacy@caissa-chess.org`

This is technical and regulatory issue-spotting, not legal advice. It does not certify compliance.

## Executive decision

CAISSA can continue operating its currently free, general-audience chess tools, but the present legal layer is incomplete. Production has no published Privacy Policy or Terms, the active PayPal support flow is not reflected in the authentication release-candidate drafts, account-wide privacy request workflows are absent, and the proposed 13+ account rule conflicts with Clerk's current contractual restriction on processing personal information of users under 16 without evidence of verifiable parental consent.

The appropriate current account rule is therefore **16+ until Clerk provides written clarification or a compliant parental-consent program exists**. This is a provider-contract gate, not a conclusion that every 13–15-year-old is prohibited by COPPA. New registration is paused, which reduces immediate exposure; it does not establish the ages of the 14 existing production accounts.

Public Scanner recognition may remain conceptually separate from community training: ordinary scans are processed without source-image storage, while authenticated feedback can upload an image. The latter needs a server-enforced consent-to-upload sequence, retention/deletion operations, rights attestations, and truthful notice before it should be promoted as a governed training intake. No automatic training was found and no model training occurred during this audit.

## Present posture

| Area | Verified position | Classification |
|---|---|---|
| Legal notices | `/privacy` and `/terms` return 404 in production; no persistent legal links were found | CURRENT REQUIRED / CURRENT RISK |
| Accounts | Clerk production sign-up is restricted; sign-in is live; Google OAuth is enabled; legal consent URLs are unset | CURRENT RISK / REVIEW |
| Age | No native age gate or stored age band in production; proposed 13+ rule conflicts with Clerk's under-16 restriction absent VPC | CURRENT REQUIRED (contractual) |
| Data | Supabase contains account, Scanner, Online, puzzle, report and economic records; RLS is enabled but most server operations use service role | CURRENT REQUIRED / BEST PRACTICE |
| Scanner | Public recognition is live; public feedback tables/bucket are empty; historical private-beta evidence remains | CURRENT RISK / REVIEW |
| Community | Online identities, ratings and matchmaking exist at very low use; public forums and broad chat are planned, not active | CURRENT + FUTURE GATES |
| Payments | Stripe subscription/credit paths are dormant; a PayPal voluntary-support button is currently live | CURRENT RISK / REVIEW |
| AI | Local chess engines are active; shared/BYO generative Mentor code exists but live activation was not proven | CURRENT RISK + FUTURE GATE |
| Accessibility | Targeted audits/tests exist; whole-site WCAG 2.2 AA conformance is not established | BEST PRACTICE / LEGAL REVIEW |
| Security | Seven medium findings were validated: six high-confidence and one medium-confidence; no direct data-exposure or credential finding was established | CURRENT RISK / REVIEW |

## Highest-priority conclusions

### P0 — immediate

1. Keep new registration paused until the public Privacy Policy and Terms accurately describe the real service and the account-age decision is resolved.
2. Use **16+ for accounts** under the current Clerk contract, or obtain Clerk's written approval and implement documented verifiable parental consent before accepting users aged 13–15. Do not enable under-13 accounts.
3. Reconcile the legal drafts with the live PayPal support flow. Describe it as a voluntary, non-charitable, non-tax-deductible contribution that buys no feature or preference. Confirm that only one-time contributions are enabled.
4. Publish neither policy until the operator-identity presentation, governing law, liability language, contact method, retention language and payment disclosure receive human legal review.
5. Freeze any new use of community-submitted Scanner images for training. Preserve the distinction between raw evidence, human certification, training eligibility and protected benchmarks.
6. Establish a privacy-request intake and operator runbook covering Clerk, Supabase rows, Storage objects, Stripe/PayPal references, Online guest records and logs. Do not promise self-service deletion or export until it exists.

### P1 — near term

- Bind Scanner image consent before or atomically with upload, delete abandoned objects, implement retention queues and document revocation handling.
- Add distributed cost/rate controls to anonymous high-cost endpoints and replace client-declared premium export authority.
- Add a root project license or an explicit all-rights-reserved statement; close Fairy-Stockfish corresponding-source and js-dos notice/source gaps; consolidate third-party notices.
- Create a repository-wide incident-response plan and log-retention schedule.
- Decide whether to pursue DMCA safe-harbor prerequisites for user-directed image storage; designation can expose operator identity/address information.
- Adopt community rules, reporting, private moderation records and appeals before forums, public chat or anti-cheat accusations launch.
- Validate Google OAuth brand, verified domains, displayed scopes, revocation path and public policy URLs against the actual production connection.

### P2 — future activation gates

- Paid subscriptions, credits, recurring contributions, premium delivery, refunds, tax handling and cancellation.
- Paid-entry or prize tournaments; these require separate gambling/contest and payment-provider review.
- Under-16 and especially under-13 accounts; parental notice, verifiable consent, data minimization and deletion are prerequisites.
- Public forums, direct messages, feeds, push notifications, livestreaming and large-scale moderation.
- EU-targeted generative AI, DSA-covered hosting, or deliberate EU/UK market offering.
- Native desktop/mobile distribution and app-store obligations.

## Applicability highlights

- **Florida fictitious name:** an individual may be outside Florida's registration requirement while not conducting business for compensation or value, but the live contribution feature makes a fact-specific Florida Department of State/counsel review prudent. No filing was made.
- **Florida Digital Bill of Rights:** current facts do not approach its controller thresholds, including the billion-dollar revenue predicate.
- **Florida child design law:** Florida Statutes §501.1735 expressly includes an online game or gaming platform likely to be predominantly accessed by children. Applicability is unknown; audience evidence is needed rather than assuming that a 13+ label resolves it.
- **COPPA:** CAISSA is presented as a general-audience service. COPPA becomes a present issue if the service is child-directed or obtains actual knowledge that a user is under 13. A checkbox is not verifiable parental consent.
- **GDPR/UK GDPR:** mere global accessibility is not enough. Deliberate offering to or monitoring people in those territories can trigger the regimes; free access is not itself an exemption.
- **US comprehensive state privacy laws:** present user scale and project facts do not show California, Colorado, Delaware or Maryland thresholds. Reassess after material growth, commercialization, targeted advertising or data sales/sharing.
- **Accessibility:** WCAG 2.2 AA is the engineering target. Current facts do not establish that a specific statute automatically applies to the entire free hobby project, and they do not establish conformance.

## Key evidence

- Production legal routes were absent; sign-up was paused, sign-in and Google OAuth were available.
- Clerk: production instance, restricted sign-up, no native age gate, no privacy/terms URLs, no legal-consent capture, 14 current account rows in Supabase.
- Supabase: private Scanner buckets; 97 private-beta scans, 92 feedback records, 8 corrections, 20 failures, 96 stored objects; public Scanner feedback records/objects were zero at review time.
- Product contract: 76 routed destinations, including 40 primary-navigation entries; several are catalogs, betas, under construction or future-facing rather than complete products.
- Dependencies: 186 locked npm packages; six npm audit advisories (one moderate, five high) were reported by the repository dependency check.
- Security source review: seven medium findings cover the downloads ZIP tier, Polyglot builds, Scanner inference, anonymous Scanner JSON persistence, Scanner image quotas, a game-fetch `NaN` limit bypass, and the position-stat shard cache. No embedded credential, direct cross-user access, unsigned Stripe fulfillment, or attacker-selected AI-provider destination was established.

## Source register

Primary sources were checked on 2026-10-25. Principal authorities include:

- [Florida Fictitious Name Act, Fla. Stat. §865.09](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0865/Sections/0865.09.html)
- [FTC Act, 15 U.S.C. §45](https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap2-subchapI-sec45.htm)
- [FTC COPPA guidance](https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy)
- [Florida breach notification, Fla. Stat. §501.171](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.171.html)
- [Florida protection of children in online spaces, Fla. Stat. §501.1735](https://www.flsenate.gov/Laws/Statutes/2026/501.1735)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [Clerk Standard Terms](https://clerk.com/legal/terms)
- [Supabase DPA](https://supabase.com/legal/dpa)
- [Vercel DPA](https://vercel.com/legal/dpa)
- [PayPal User Agreement](https://www.paypal.com/US/legalhub/paypal/useragreement-full?locale.x=en_US)
- [PayPal Acceptable Use Policy](https://www.paypal.com/us/legalhub/acceptableuse-full)
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [EU GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [EU AI Act](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689)

Detailed applicability and evidence are maintained in the other documents in this season.

