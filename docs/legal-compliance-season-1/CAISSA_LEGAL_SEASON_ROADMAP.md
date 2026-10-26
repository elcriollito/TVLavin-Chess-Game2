# CAISSA Legal Season Roadmap

**Baseline:** `d7c48e52465b8764d102313c03cf639c38b3db6f`  
**Planning date:** 2026-10-25

## P0 — immediate legal baseline

### P0.1 Account and policy freeze

**Dependency:** none.  
**Action:** keep registration paused; use a 16+ account rule under current Clerk terms; do not enable under-13 accounts or publish current AUTH-004B drafts unchanged.  
**Acceptance:** one approved age decision is enforced across password, Google OAuth, callbacks and user sync; no route can create a younger account.

### P0.2 Truthful Privacy Policy and Terms

**Dependency:** operator/counsel identity decision, age decision, transition-accurate PayPal wording, retention statements.
**Action:** revise drafts against the data inventory and product matrix; add permanent legal links and version/effective dates.  
**Acceptance:** every material production processor and feature is described; no promised deletion/retention feature is fictitious; counsel approves governing law/liability/operator wording.

### P0.3 PayPal retirement

**Current fact:** production `/support` still presents a PayPal Hosted Button. The owner has decided to discontinue it, but this documentation audit does not implement or verify retirement. No private transaction history was inspected, and no conclusion is made about whether any payment occurred, revenue, charitable status or tax deductibility.
**Action in a separately authorized release:** remove the support-page button/controller and PayPal-specific copy, navigation and route-specific CSP allowances; then deactivate the hosted button/payment link in the PayPal dashboard. Preserve any records required for accounting, refunds, disputes, tax or legal hold.
**Acceptance:** production contains no CAISSA PayPal button, iframe, script, redirect or stale contribution claim; the direct hosted-button/payment-link state is verified inactive in PayPal; policies describe the resulting state without claiming PayPal was never used.

### P0.4 Scanner evidence freeze and inventory

**Dependency:** production object/row mapping.  
**Action:** do not use new community evidence for training; map all historical objects to consent/rights/feedback; quarantine uncertain records.  
**Acceptance:** every retained object has an owner, purpose, consent/version, rights state, deadline and status; unmatched/expired records are queued under an approved deletion rule.

### P0.5 Manual privacy and incident intake

**Dependency:** named operator roles; provider contacts.  
**Action:** establish private runbooks at `privacy@caissa-chess.org` for access/deletion and security incidents.  
**Acceptance:** test case traces one user across Clerk, Supabase, Storage, logs and providers; incident tree identifies containment, evidence, counsel, provider and notice decision owners.

## P1 — near-term controls

### Identity and privacy

- Implement neutral age-band enforcement and policy-version evidence after legal approval.
- Build reliable manual account closure, then self-service export/deletion.
- Add Online guest expiry/deletion and abuse-resistant creation.
- Maintain processor/subprocessor, retention and international-transfer registers.

### Scanner

- Bind consent before/with upload and remove orphaned objects.
- Implement retention queues, deletion audit and revocation/version lineage.
- Formalize reviewer training, conflicts, access and evidence handling.
- Create dataset and model cards; keep benchmark sets non-trainable.

### Security

- Replace client-declared download tier with a verified entitlement or signed capability and stream or asynchronously build archives.
- Add durable account/IP/concurrency controls to Polyglot and Scanner inference; implement true inference cancellation/isolation.
- Add durable row/byte retention budgets to anonymous Scanner evidence and per-user/project quotas plus feedback binding to Scanner image upload.
- Treat the game-fetch nonnumeric-limit issue and position-stat all-shard cache as activation gates until deployment/use is proved; if activated, reject nonnumeric limits, cap response bytes, and use a byte/count-bounded cache or indexed design.
- Triage six dependency advisories and upgrade with regression tests.
- Document secrets rotation, backups, restore testing, log access/retention and provider incident contacts.

### IP and community

- Add the root source license and consolidated third-party notices.
- Close Fairy-Stockfish and js-dos version/source gaps.
- Certify PGN/data collections before any paid distribution.
- Create community/fair-play rules, reports, private evidence, appeals, DMCA decision and CSAM escalation.

### Accessibility

- Run representative WCAG 2.2 AA manual tests across home, sign-in, Play, Online, Scanner, study tools and support.
- Prioritize keyboard board operation, screen-reader game state, focus/error messages, contrast, touch targets and captions.
- Track exceptions and publish no conformance claim until independently supported.

## P2 — future seasons

### Commerce season

Business/tax identity, provider KYC, product pricing, consumer disclosures, subscription consent/cancellation, refund/support, sales-tax classification, credit-wallet terms and payment incident response. Keep Stripe and credit-store activation behind a human release gate.

### Child account season

Only if strategically required: Clerk approval, COPPA/under-16 VPC, parent portal, child-safe defaults, vendor commitments, child impact assessment and deletion. Under-13 support is a separate program, not an extension of a checkbox.

### Community season

Forums/chat/DM design, moderator staffing, trust-and-safety operations, copyright/CSAM/lawful-request procedures, communications privacy, minor protection and DSA analysis if offered in the EU.

### Tournament season

Separate counsel opinion for entry fees/prizes/skill contests, payment-provider approval, official rules, geofencing, age/tax/refund/fair-play/dispute controls.

### AI and international season

Keep external generative Mentor activation behind verified environment flags, provider/model approval, provider retention/training review, prompt/context disclosure, data minimization, evaluation, cost/abuse controls and an incident/kill-switch path. Maintain Scanner dataset/model cards and exact artifact provenance before retraining. Local chess engines remain distinct from external generative AI. Then assess EU AI Act role/territory, AI literacy, DSA/GDPR/UK targeting and representative decisions.

### Native distribution season

Desktop/mobile app-store rules, signing, update security, crash/telemetry privacy, accessibility labels and exact corresponding-source/notice delivery.

## Incident-response minimum plan

1. **Triage:** record reporter, time, systems, suspected data, accounts and current exposure without copying unnecessary sensitive content.
2. **Contain:** revoke tokens/keys, feature-flag or isolate affected path, preserve logs and avoid destructive cleanup.
3. **Assess:** determine confidentiality/integrity/availability impact, affected jurisdictions and whether personal information was acquired/accessed.
4. **Coordinate:** contact Vercel, Supabase, Clerk, Cloudflare, Google, PayPal/Stripe or AI provider through verified channels as applicable.
5. **Legal decision:** counsel evaluates Florida §501.171 and other notice duties. If Florida applies, calendar the 30-day individual-notice rule and 500-person Attorney General threshold.
6. **Notify:** use accurate, non-speculative content; document delay decisions and law-enforcement requests.
7. **Recover:** validate fixes, rotate credentials, restore safely and monitor recurrence.
8. **Learn:** post-incident review, control owner, deadline and policy/data-inventory updates.

## Legal counsel decisions

Counsel, not automation, should decide:

- sufficient public operator/contracting identity while preserving personal privacy;
- Florida fictitious-name and any historical charitable-solicitation posture after considering the actual PayPal appeal and any real transaction facts;
- governing law, venue/arbitration, warranty and liability language;
- 16+ versus a provider-approved 13–15 parental-consent program;
- privacy-law territorial scope and Florida §501.1735 audience applicability;
- DMCA-agent registration and its public identity/address implications;
- platform screenshots, PGN collections, engine linking/distribution and model-training rights;
- paid-entry/prize tournament legality and provider approval;
- tax treatment of contributions, subscriptions, credits, digital goods and prizes;
- accessibility duties if commercial, educational, governmental or app-store facts change.

## Source verification log

| Topic | Primary authority | Verification | Limitation |
|---|---|---|---|
| Florida identity/DBA | Fla. Stat. §865.09; Florida DOS | 2026-10-25 | Compensation/business facts and exceptions need counsel |
| Privacy/security | FTC Act §5; FTC guidance; Fla. Stat. §501.171 | 2026-10-25 | FTC commerce and Florida entity coverage are fact-specific |
| Children | Amended COPPA Rule/FTC; Clerk Terms; Fla. Stat. §§501.1735–.1736 | 2026-10-25 | Audience composition, actual knowledge and provider interpretation unresolved |
| OAuth | Google API Services User Data Policy and OAuth verification guidance | 2026-10-25 | Actual Google console configuration requires separate readback |
| Providers | Clerk/Supabase/Vercel/Cloudflare terms and DPAs | 2026-10-25 | Account-specific settings and negotiated terms not assumed |
| Contributions | PayPal User Agreement/AUP; Fla. Stat. Ch. 496; IRS guidance | 2026-10-25 | Tax/charitable classification is fact-specific |
| Community | 47 U.S.C. §230; 17 U.S.C. §512; 18 U.S.C. §§2258A, 2511, 2702 | 2026-10-25 | Service classification and claim facts matter |
| International | GDPR/EDPB/ICO; EU DSA; EU AI Act/Commission | 2026-10-25 | Territorial/material scope not established by accessibility alone |
| Accessibility | WCAG 2.2; DOJ ADA guidance | 2026-10-25 | Technical target is not a universal legal conclusion |
| Commerce | Stripe terms/restricted businesses; ROSCA; Fla. Stat. §§501.165, 849.14, 849.094 | 2026-10-25 | Future design/jurisdictions drive applicability |

## Governance cadence

- Monthly while P0 is open.
- Before every account, upload, community, AI, commerce or international launch.
- Quarterly provider-term, dependency, license, data-retention and audience review.
- Annual accessibility/manual security review, and immediately after material incidents or architecture changes.

## Completion criteria for Season 1 follow-through

The twelve-document Season 1 audit package is complete at the local audit commit. Operational remediation is not complete: it requires P0 owners to sign evidence, counsel to approve policies, and production changes to pass a separate authorized release process. PayPal retirement, AUTH-004 publication, provider-console changes, database work and security fixes remain outside this documentation-only audit.

