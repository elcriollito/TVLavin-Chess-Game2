# CAISSA Chess Legal & Compliance Season 1.0

## Executive audit

**Status:** 12/12 documentation deliverables complete; human legal and product review required
**Evidence date:** 2026-10-25  
**Repository baseline:** `d7c48e52465b8764d102313c03cf639c38b3db6f`  
**Production reviewed:** `https://www.caissa-chess.org`  
**Operator posture supplied for this audit:** personal project; no registered company; no active paid subscriptions; financial records and transaction history were not inspected
**Public privacy contact:** `privacy@caissa-chess.org`

This is technical and regulatory issue-spotting, not legal advice. It does not certify compliance.

## Executive decision

CAISSA can continue operating its currently free, general-audience chess tools, but the present legal layer is incomplete. Production has no published Privacy Policy or Terms, account-wide privacy request workflows are absent, and the proposed 13+ account rule conflicts with Clerk's current contractual restriction on processing personal information of users under 16 without evidence of verifiable parental consent.

The owner has now decided to discontinue PayPal support. That decision is recorded as a remediation/release gate, not as a completed production fact: on 2026-10-25 `/support` still returned HTTP 200 and presented the PayPal Hosted Button. This audit did not remove code, alter PayPal, inspect transactions or claim that payments occurred. A later authorized implementation must remove the website integration and separately deactivate the Hosted Button/payment link in the PayPal dashboard before retirement can be certified.

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
| Payments | Stripe subscription/credit paths are dormant; PayPal retirement is owner-approved but the Hosted Button remains live in production | CURRENT REMEDIATION GATE |
| AI | Local engines and hosted Scanner inference are active; shared/BYO generative Mentor code exists but live provider activation was not proven | CURRENT DISCLOSURE + FUTURE GATE |
| Accessibility | Targeted audits/tests exist; whole-site WCAG 2.2 AA conformance is not established | BEST PRACTICE / LEGAL REVIEW |
| Security | Seven medium findings were validated: six high-confidence and one medium-confidence; no direct data-exposure or credential finding was established | CURRENT RISK / REVIEW |

## Highest-priority conclusions

### P0 — immediate

1. Keep new registration paused until the public Privacy Policy and Terms accurately describe the real service and the account-age decision is resolved.
2. Use **16+ for accounts** under the current Clerk contract, or obtain Clerk's written approval and implement documented verifiable parental consent before accepting users aged 13–15. Do not enable under-13 accounts.
3. Retire PayPal in a separately authorized code/release change, remove the route-specific SDK/CSP/translations, and manually deactivate the Hosted Button/payment link. Until verified deployed, policies must describe the live flow accurately; after verified retirement, they must not claim PayPal is active or falsely claim it was never offered.
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
- Under-16 and especially under-13 accounts; provider approval, parental notice, verifiable consent, data minimization and deletion are prerequisites.
- Public forums, direct messages, feeds, push notifications, livestreaming and large-scale moderation.
- EU-targeted generative AI, DSA-covered hosting, or deliberate EU/UK market offering.
- Native desktop/mobile distribution and app-store obligations.

## Applicability highlights

- **Florida fictitious name:** an individual may be outside Florida's registration requirement while not conducting business for compensation or value, but the live contribution feature makes a fact-specific Florida Department of State/counsel review prudent. No filing was made.
- **Florida Digital Bill of Rights:** current facts do not approach its controller thresholds, including the billion-dollar revenue predicate.
- **Florida child design law:** Florida Statutes §501.1735 expressly includes an online game or gaming platform that offers a service, product, game or feature likely to be predominantly accessed by children. Applicability is **UNKNOWN**, not inapplicable: audience facts are missing. Its minimization, purpose-limitation, profiling, geolocation and dark-pattern rules are legal requirements if the predicate is met.
- **COPPA:** CAISSA is presented as a general-audience service. COPPA applies if it is child-directed or has actual knowledge it collects personal information from a child under 13. The revised 2025 Rule is now in its full-compliance period and adds explicit retention/deletion-schedule and separate-consent requirements for covered processing. A checkbox is not VPC.
- **GDPR/UK GDPR:** mere global accessibility is not enough. Deliberate offering to or monitoring people in those territories can trigger the regimes; free access is not itself an exemption.
- **US comprehensive state privacy laws:** present user scale and project facts do not show California, Colorado, Delaware or Maryland thresholds. Reassess after material growth, commercialization, targeted advertising or data sales/sharing.
- **Accessibility:** WCAG 2.2 AA is the engineering target. Current facts do not establish that a specific statute automatically applies to the entire free hobby project, and they do not establish conformance.

## Key evidence

- Production legal routes were absent; sign-up was paused, sign-in and Google OAuth were available.
- Clerk: production instance, restricted sign-up, no native age gate, no privacy/terms URLs, no legal-consent capture, 14 current account rows in Supabase.
- Supabase: private Scanner buckets; 97 private-beta scans, 92 feedback records, 8 corrections, 20 failures, 96 stored objects; public Scanner feedback records/objects were zero at review time.
- Product contract: 76 routed destinations, including 40 primary-navigation entries; several are catalogs, betas, under construction or future-facing rather than complete products.
- Dependencies: 186 locked npm packages; six npm audit advisories (one moderate, five high) were reported by the repository dependency check.
- Security source review: seven medium findings cover the downloads ZIP tier, Polyglot builds, Scanner inference, anonymous Scanner JSON persistence, Scanner image quotas, a game-fetch `NaN` limit bypass, and the position-stat shard cache. Five affect currently reachable public services. The configured game-fetch workers.dev hostname did not resolve and its custom route is commented; the position-stat Worker has no source-controlled route and no public consumer reference. Those two remain valid activation findings, not proven current production exposure. No embedded credential, direct cross-user access, unsigned Stripe fulfillment, or attacker-selected AI-provider destination was established.

## Requirement classification

| Class | Verified requirement or conclusion |
|---|---|
| Law | COPPA's under-13/actual-knowledge rule and revised retention/security requirements apply only if coverage facts are met; Florida §501.1735 applies only if the child-audience predicate is met; general privacy/consumer duties remain fact- and jurisdiction-specific. |
| Provider contract | Clerk bars under-16 personal information without evidence of VPC. Google requires an accurate public home page/privacy policy, verified domains, truthful brand, minimal scopes and secure production redirects. PayPal terms apply while the Hosted Button remains active. |
| Product policy | Provisional 16+ accounts, no under-13 registration, PayPal retirement, no automatic Scanner training and human review of AI/Scanner output are owner/product controls. |
| Recommendation | WCAG 2.2 AA, distributed quotas, model/data cards, consolidated notices and broader incident exercises are risk controls unless a specific applicable law or contract makes one mandatory. |

## Security deployment reconciliation

| Finding | Exact source paths | Deployment evidence | Priority |
|---|---|---|---|
| Downloads caller-declared premium ZIP | `downloads-worker/worker.js:624-628,840-922,925-1039,1266-1273`; `downloads-worker/wrangler.toml:5-12` | `downloads.caissa-chess.org/openingdb/manifest.json` returned 200 and the Worker has custom-domain routes | P1 current public service |
| Polyglot local limiter/high-cost build | `api/polyglot/build.js:10-59`; `api/_lib/rate-limit.js:1-53`; `api/_lib/auth.js:109-116`; `api/_lib/polyglot-builder.js:58-259` | `/api/polyglot/build` returned 405 to safe HEAD, proving deployed routing; UI calls it | P1 current public service |
| Scanner inference limiter/non-cancelling timeout | `api/_lib/scanner-public-recognition-service.js:28-74`; `api/_lib/scanner-public-policy.js:24-33`; `api/_lib/rate-limit.js:1-53`; `api/_lib/scanner-beta-inference.js:46-94,226-238`; `vercel.json:33-35` | public status returned `available:true`, `stage:"public-beta"`; recognize route returned 405 to GET | P1 current public service |
| Anonymous Scanner JSON persistence | `api/_lib/scanner-public-policy.js:4-12`; `api/_lib/scanner-public-service.js:30-58,110-152`; `scanner/beta/scanner-beta-contract.js:115-138`; `api/_lib/scanner-public-store.js:45-53`; `supabase/migrations/20261024230355_scanner_public_feedback_v01.sql:5-20,134-160` | scan route returned 405 to GET and public-beta status is active | P1 current public service |
| Scanner image storage without durable quota/binding | `api/scanner/public/image.js:3-19`; `api/_lib/scanner-public-service.js:233-248`; `api/_lib/scanner-public-store.js:69-79`; `api/_lib/scanner-public-policy.js:4-12`; `supabase/migrations/20261024230355_scanner_public_feedback_v01.sql:301-311` | image route returned 405 to GET; account is required, but the public service is deployed | P1 current public service |
| Game-fetch `max=NaN` cap bypass | `cloudflare-worker/worker.js:21-28,604-677,899-970`; `cloudflare-worker/wrangler.toml:1-6` | custom route is commented and `caissa-game-fetcher.elcriollito.workers.dev` did not resolve; source/frontend references remain | P2 activation/decommission confirmation |
| Position-stat all-shard cache | `worker/stats-worker.js:14-15,36-58,65-106`; `experimental/openingdb-research/build-pos-stats.js:192-228`; `worker/wrangler.toml:1-7` | no route or public consumer is source-controlled; dashboard deployment and shard sizes were not inspected | P2 activation gate; medium confidence |

No load, mutation, payment, destructive or abusive production test was performed.

## Verification record

Commands were run from the isolated audit worktree on 2026-10-25 (local date):

| Command | Result |
|---|---|
| `node --test tests/public-route-inventory.test.js tests/navigation-integrity.test.js tests/support-paypal.test.js tests/i18n-foundation.test.js tests/scanner-public-beta.test.js tests/platform-security-policy.test.js tests/auth-complete-recovery.test.js tests/auth-registration-sync.test.js tests/mentor-auth-handoff.test.js` | Exit 1: 80 tests, 78 passed, 2 failed. Existing non-document failures were shared-navigation script order for `game-library-champions.html` and EN/ES/PT catalog-count parity (`624 !== 621`). Scanner, auth, route, platform-security and all other selected PayPal assertions passed. |
| `$env:PLAYWRIGHT_BASE_URL='https://www.caissa-chess.org'; $env:CAISSA_PAYPAL_LIVE='1'; npx playwright test tests/browser/support-paypal.spec.js --project=chromium --grep 'live PayPal Hosted Button'` | Exit 0: 1/1 passed; PayPal SDK returned 200 and the Hosted Button reached the rendered boundary. No checkout was initiated. |
| `npm run security:dependencies` | Exit 1 as expected: supply-chain policy passed (503 runtime files; 186 locked entries); npm audit reported 6 vulnerabilities (1 moderate, 5 high) in `undici`/`cheerio` and `zod`/Vercel OIDC chains. No automatic fix was run. |
| `curl.exe` safe GET/status checks for public pages/APIs/workers | `/support` 200; `/privacy` 404; `/terms` 404; `/scanner` 200; `/mentor` 200; Polyglot 405; downloads manifest 200; configured game-fetch host 000/non-resolving; Scanner status available/public-beta; Scanner recognize/scan/image GETs each 405. |
| `curl.exe` safe engine-asset checks | Fairy-Stockfish WASM 200; exact Stockfish 18 and 19 WASM paths each 200 with `application/wasm`. |
| `git diff --check` and twelve-document inventory check | Whitespace-clean after correction; exactly 12 Markdown deliverables; no non-document working-tree change. |

The focused failures and dependency advisories are recorded, not repaired, because product remediation was outside this audit.

## Deliverable inventory — 12/12

1. `CAISSA_LEGAL_EXECUTIVE_AUDIT.md`
2. `CAISSA_PRODUCT_COMPLIANCE_MATRIX.md`
3. `CAISSA_DATA_PROCESSING_INVENTORY.md`
4. `CAISSA_CHILD_PRIVACY_REVIEW.md`
5. `CAISSA_SCANNER_DATA_GOVERNANCE.md`
6. `CAISSA_AI_GOVERNANCE_REVIEW.md`
7. `CAISSA_OPEN_SOURCE_LICENSE_AUDIT.md`
8. `CAISSA_COMMUNITY_POLICY_GAPS.md`
9. `CAISSA_FUTURE_FEATURE_LEGAL_GATES.md`
10. `CAISSA_AUTH004_BLOCKER_ANALYSIS.md`
11. `CAISSA_LEGAL_RISK_REGISTER.md`
12. `CAISSA_LEGAL_SEASON_ROADMAP.md`

## Source register

Primary sources were checked on 2026-10-25. Clerk's terms showed an October 1, 2026 update; Google's OAuth guidance showed an August 19, 2026 update. Principal authorities include:

- [Florida Fictitious Name Act, Fla. Stat. §865.09](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0865/Sections/0865.09.html)
- [FTC Act, 15 U.S.C. §45](https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap2-subchapI-sec45.htm)
- [FTC COPPA guidance](https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy)
- [Florida breach notification, Fla. Stat. §501.171](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.171.html)
- [Florida protection of children in online spaces, Fla. Stat. §501.1735](https://www.flsenate.gov/Laws/Statutes/2026/501.1735)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [Clerk Standard Terms](https://clerk.com/legal/standard-terms)
- [Supabase DPA](https://supabase.com/legal/dpa)
- [Vercel DPA](https://vercel.com/legal/dpa)
- [PayPal User Agreement](https://www.paypal.com/US/legalhub/paypal/useragreement-full?locale.x=en_US)
- [PayPal Acceptable Use Policy](https://www.paypal.com/us/legalhub/acceptableuse-full)
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [EU GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [EU AI Act](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689)

Detailed applicability and evidence are maintained in the other documents in this season.

