# CAISSA Legal Audit Evidence Index

**Evidence freeze:** 2026-10-26/27
**Repository baseline:** `6e912be5c314080be8944efde261b8dc133452a6`
**Branch:** `audit/caissa-legal-compliance-season-1`

Evidence identifiers are sanitized. No secret value, full token, private forwarding destination, residential address or user-level record appears here.

## Repository and production evidence

| ID | Evidence | Verification / scope |
|---|---|---|
| E-GIT-001 | `git fetch origin`; `git worktree list --porcelain`; isolated branch/worktree certification | Original dirty worktree and all existing worktrees preserved; audit worktree clean at creation |
| E-GIT-002 | `git rev-parse origin/main` | `6e912be5c314080be8944efde261b8dc133452a6` |
| E-VERCEL-001 | Read-only Vercel project/deployment listing | Production deployment `dpl_8nwALfzyrVugZeqksfiAwvUecgUJ`, READY, branch `main`, matching SHA, region `iad1` |
| E-PROD-001 | Safe GET/redirect checks | `/` 200; `/privacy` 404; `/terms` 404; `/scanner` 200; `/signup` 200; `/signin` 200; `/support` redirects to `/help` 200 |
| E-PROD-002 | `GET /api/scanner/public/status` | Public beta available; frozen v0.5 occupancy-recovery classifier; localizer v4; JPEG/PNG/WebP |
| E-ROUTE-001 | `js/caissa-public-route-inventory.js` / route-contract tests | Contract v1.4.0: 78 destinations, 39 primary, 18 redirects, 5 protected families |
| E-BRANCH-PRIV-001 | `season/privacy-governance-remediation-20261026` at `7f79a034` | Unmerged consent/lifecycle code and migration `20261026100419_scanner_public_consent_governance_v02.sql`; not production |
| E-BRANCH-SEC-001 | `integration/engineering-governance-s2-20261026` at `69ef0401` | Unmerged privacy/security/accessibility integration and tests; not production |

## Clerk / authentication evidence

| ID | Read-only fact |
|---|---|
| E-CLERK-001 | Production sign-up mode restricted; CAPTCHA/lockout/HIBP enabled |
| E-CLERK-002 | Google connection enabled but custom client ID/secret empty and provider `configured:false` |
| E-CLERK-003 | Legal consent disabled; Privacy/Terms URLs unset; maximum session life 604800 seconds |
| E-CLERK-004 | Production frontend domain `clerk.caissa-chess.org`; exact OAuth redirect specified by Clerk/owner |
| E-SRC-AUTH-001 | `api/_lib/auth.js:29-120` | Official token verification, authorized parties, fail-closed invalid/service-error handling and CORS controls |

## Supabase and Scanner evidence

| ID | Read-only fact |
|---|---|
| E-SB-001 | Aggregate production counts only: 14 users; 97 beta scans; 6,208 predictions; 92 feedback; 8 corrections; 20 failures; public Scanner feedback/certification records 0 |
| E-SB-002 | Private buckets `scanner-beta-images` and `scanner-public-feedback-images`; 12 MB; JPEG/PNG/WebP; 96 beta objects, 0 public objects |
| E-SB-003 | All inspected public tables RLS enabled; no policies; 48 public `SECURITY DEFINER` functions; service-role server client in `api/_lib/supabase.js` |
| E-SRC-SCAN-001 | `api/_lib/scanner-public-service.js`, recognition service, policy/store and review authorization | Purpose/auth/storage/resource boundaries documented in Scanner and security reports |

## Security evidence

| ID | Source / conclusion |
|---|---|
| E-SEC-001 | `downloads-worker/worker.js:624-628,951-955`: caller-controlled premium tier; worker reachability observed |
| E-SEC-002 | `api/polyglot/build.js:10-51`; `api/_lib/polyglot-builder.js:65-149`: high-cost anonymous parse lacks structural budgets |
| E-SEC-003 | `api/_lib/scanner-public-recognition-service.js:28-75`; `api/_lib/rate-limit.js:3-7`: timeout/local limiter limitations |
| E-SEC-004 | `api/_lib/scanner-public-service.js:144-152`: anonymous persistent scan path |
| E-SEC-005 | `api/_lib/scanner-public-service.js:174-183,233-244`: image upload before consent binding; no durable storage quota shown |
| E-SEC-006 | `cloudflare-worker/worker.js:910-914`; deployment not established |
| E-SEC-007 | `worker/stats-worker.js:14-58`; deployment/shard size not established |
| E-SEC-SCAN-001 | Codex Security Standard scan `ae2c997f-e0d2-4255-8170-b0c3373fa205`; persistent report stored under Codex Security state, not committed because it includes operational path metadata |

## Licensing evidence

| ID | Evidence |
|---|---|
| E-IP-001 | No repository-root `LICENSE`; `package.json` declares MIT; component licenses/notices exist under `assets/vendor`, `public/engines`, `engine` and experiments |
| E-IP-002 | Stockfish 18/19 copying/provenance files and public artifacts; LC0 compliance notices; Fairy-Stockfish license/artifact metadata |
| E-IP-003 | js-dos runtime version in source differs from lockfile record; GNU Chess local license exists |
| E-IP-004 | Lichess official open database declares CC0; repository PGN/player manifests warn that commercial rights require separate review |
| E-IP-005 | Tablebase/opening/media exact terms vary by source and were not universally certified |

## Official legal and provider sources

All links were checked during the audit; current status must be rechecked at release/activation.

- [Florida Fictitious Name Act, section 865.09](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0865/Sections/0865.09.html)
- [Florida breach notification, section 501.171](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.171.html)
- [Florida Digital Bill of Rights definitions, section 501.702](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.702.html)
- [Florida child online spaces, section 501.1735](https://www.flsenate.gov/Laws/Statutes/2026/501.1735)
- [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [FTC 2025 COPPA Rule amendments](https://www.ftc.gov/legal-library/browse/federal-register-notices/16-cfr-part-312-coppa-final-rule-amendments)
- [Google OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [Google OAuth branding requirements](https://support.google.com/cloud/answer/15549049?hl=en)
- [Clerk Google production connection guide](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google)
- [Clerk Standard Terms](https://clerk.com/legal/standard-terms)
- [Clerk DPA](https://clerk.com/legal/dpa), [Supabase DPA](https://supabase.com/legal/dpa), [Vercel DPA](https://vercel.com/legal/dpa), [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)
- [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj) and [EDPB territorial-scope guidance](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32018-territorial-scope-gdpr-article-3-version_en)
- [U.S. Copyright Office section 512](https://www.copyright.gov/512/) and [DMCA agent directory](https://www.copyright.gov/dmca-directory/)
- [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html), [Lichess open database](https://database.lichess.org/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [DOJ web accessibility guidance](https://www.ada.gov/resources/web-guidance/)
- [EU AI Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj), [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework)

## Quality and sensitivity controls

- No full token, password, secret, OAuth client value, private email destination, residential address or row-level user record was collected into these documents.
- Production and provider checks were read-only; no load test or destructive request was performed.
- Branch-only work is explicitly labeled not deployed.
- Every required report cross-references stable finding/evidence IDs.
- The exact 17-file manifest, relative links, secret patterns and trailing whitespace passed local validation.
- A 59-test Node regression covering authentication, fail-closed CORS/security policy, Scanner public-beta governance, route inventory/navigation and Accessibility 001B passed after `npm ci`.
- Supply-chain inventory passed for 501 runtime files and 186 locked entries; `npm audit --audit-level=high` correctly remained nonzero for six known advisories (one moderate, five high). No automatic upgrade was made.
- Automated external-link fetch reached 20 of 26 official URLs directly. FTC, GNU, ADA and one Google help URL returned bot/redirect/404 responses to that client; those official pages were separately verified through current search/open results. This is not a permanent availability guarantee.
- Final Git validation includes `git diff --check`, review of the documentation-only diff, push verification and clean-status verification after commit.
