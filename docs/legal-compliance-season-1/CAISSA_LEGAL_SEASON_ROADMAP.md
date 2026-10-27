# CAISSA Legal Season Roadmap

**Verified:** 2026-10-26. Work is sequenced to protect current users without turning a free personal chess project into unnecessary bureaucracy.

## P0 - Immediate current-service work

| Work item | Evidence / why now | Technical work | Human/legal decision | Test / release dependency |
|---|---|---|---|---|
| LEGAL-001 legal pages | Production routes 404; Google requires them | Publish versioned Privacy/Terms and footer links in AUTH-004 | Owner approves truth/identity; counsel as needed | 200, link crawl, mobile/desktop, content checklist |
| AUTH-001 age/provider gate | Clerk terms conflict with provisional 13+ | Enforce approved eligibility before Clerk creation; keep signup paused until then | Choose 16+, VPC/provider path or alternative | Boundary tests; no unnecessary DOB storage |
| AUTH-002 Google production auth | Clerk has no custom credentials | AUTH-004-only credential/config work and callback tests | Owner production approval | Real `client_id`, callback, session, stale/invalid token, Safari |
| DATA-001 request runbook | Existing account/storage data; no coordinated workflow | Map identity, export, deletion and exceptions across processors | Approve retention/verification | Dry-run on synthetic/test account only |
| SCAN-001/003 image lifecycle | Current endpoint plus 96 historical objects | Review Privacy S2 consent grant/migration; reconcile history; add cleanup | Approve purpose/retention/rights | Consent-before-byte, rollback, quota, deletion tests |
| SEC-001..005 resource controls | Reachable public services | Review/integrate Security S2 through separate branch; add durable/platform safeguards | Security release approval | Adversarial unit/integration and rollback/kill switch |
| IR-001 incident plan | Multi-provider personal/account data | One-page severity/provider/restore/notification playbook | Name operator/counsel escalation | Tabletop; restore/credential-rotation checklist |

## P1 - Near-term governance

- DATA-002: retention criteria, processor/subprocessor/DPA/region register, log minimization and periodic deletion evidence.
- IP-001..004: root license decision, consolidated notices, exact engine source mapping, js-dos reconciliation and content-rights manifest.
- DEP-001: dependency reachability triage, supported upgrades and regression tests.
- COMM-001: concise community/fair-play rules, private report intake and appeals.
- A11Y-001: retain cross-browser/keyboard/screen-reader/mobile checks for changed critical flows; publish no blanket certification.
- Security: review `SECURITY DEFINER` grants/search paths, service-role API ownership predicates, backups and restore evidence.
- Privacy: define account closure, guest/anonymous cleanup and international offering/monitoring facts.

## P2 - Future activation

- CAISSA Junior: full COPPA/provider/parent/child-safety program.
- Forum/chat/DMs: moderation staffing, reporting, DMCA decision, privacy and child controls.
- Premium/credits/donations: seller identity, DBA/entity/tax review, pricing/renewal/cancellation/refund/payment controls.
- Prize/paid tournaments: official rules, eligibility, geography, prize/tax/fraud and gambling/skill-contest counsel.
- Scanner training: record-level rights/consent, certification, reproducible dataset/model release and revocation lineage.
- External generative AI: exact provider/model/DPA/region, prompt privacy, cost controls and human oversight.
- Desktop/native apps: signing, secure updates, file permissions, telemetry and GPL/SBOM distribution.
- Market Reader: separate product/policy review; do not merge scope merely because infrastructure is shared.

## Ownership and sequencing

1. **Owner + counsel:** identity, age, policy text, DMCA/DBA/commerce/tournament questions.
2. **AUTH-004:** legal publication and OAuth configuration/testing only after decisions.
3. **Privacy Season 2:** consent, retention, rights requests and migration review; no production apply without approval.
4. **Security Season 2:** code fixes, dependency triage and deployment controls; no implicit merge from this audit.
5. **Product owners:** feature-specific activation packets using the future matrix.

## Completion definition

P0 is complete only when evidence shows deployed behavior, not merely a branch or draft. P1 may proceed without blocking unrelated safe releases. P2 controls are dormant gates and must not be prematurely represented as current features.

