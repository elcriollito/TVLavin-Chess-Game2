# CAISSA Future Feature Legal Activation Matrix

**Verified:** 2026-10-26. Planned features are not described as current.

| ID / feature | Current status; users/data | Principal legal/provider/IP issues | Required controls and documentation | Release blockers / human review |
|---|---|---|---|---|
| FUT-001 CAISSA Junior | PLANNED; under-13 accounts, parent/child identifiers, play/progress | COPPA, Florida child online-space law, Clerk/provider terms, child safety | Neutral screen; direct notice/VPC; parent access/deletion; minimization/retention; private defaults; no messaging/image/ads; child threat model | Counsel approval; provider acceptance; end-to-end parent tests; no activation in this season |
| FUT-002 Community Forum | PLANNED; UGC, profiles, reports, moderator records | Harassment, privacy, copyright/DMCA, section 230 limits, minors | Rules; report/block/mute/appeal; moderation staffing; anti-spam; copyright workflow; retention; accessible UI | Account-age gate, moderator owner, incident/CSAM counsel review, evidence tests |
| FUT-003 Native tournaments | PLANNED; eligibility, games, possibly prizes/payments | Contest rules, age/geography, prize/tax, fraud; skill-contest/gambling distinctions | Four separate modes: free/no prize, free/prize, paid entry, cash prize; official rules and payment controls | Counsel for any entry fee/prize; no automatic activation |
| COM-001 Premium memberships | NOT ACTIVE; future billing/account data | Pricing, auto-renewal, cancellation, refunds, taxes, chargebacks, processor rules | Clear checkout consent, receipts, self-service cancellation, refund policy, price-change notice, tax/accounting, webhook/idempotency tests | Owner/counsel approval; active legal pages; support/rollback; no current commercial claim |
| SCAN-002 Future Scanner training | NOT AUTHORIZED; images/corrections/model artifacts | Consent, rights, privacy, provenance, revocation, international transfers | Separate recognition/feedback/image/certification/export/training/deploy contracts; immutable dataset/model cards | Record-level eligibility, protected benchmark, human approval, reproducibility; no auto-training |
| FUT-004 Vision Lab | PLANNED; learning progress/performance | Child privacy, behavioral analytics, retention, accessibility | Prefer local/aggregate data; purpose/retention map; no public score; age review | Identifiable learning profiles prohibited until approved |
| FUT-005 GIF Studio expansion | PUBLIC basic capability; future sharing/import expansion | PGN/image/theme rights, platform brands, generated-file retention | Input warranty, asset license register, short temp retention, takedown/share controls | Rights and accessibility tests for every new import/export source |
| FUT-006 Desktop apps | PLANNED / not verified | GPL bundling, secure updates, local permissions, telemetry, signing | SBOM/notices/source; signed installer/update; sandboxed files; crash/telemetry opt-in; privacy map | Platform security review and exact binary/source compliance |
| AI-001 AI Coach/Mentor | MIXED UI/source; external activation unverified | Provider terms, prompt privacy/training, keys, output/error, child access, cost | Provider/model register; just-in-time disclosure; transient BYO keys; budgets; logging redaction; human oversight | Provider/DPA/region approved; abuse/security/accessibility tests; kill switch |
| FUT-007 Market Reader | SEPARATE PRODUCT / out of scope | Shared auth, billing, operator/policy scope may create cross-product obligations | Separate inventory/policies unless purposes/operators truly align; shared processor map only | Do not merge dirty worktree or automatically fold into CAISSA policies |
| FUT-008 Partnerships/APIs | FUTURE | API terms, rates, attribution, trademarks, redistribution, account linking/privacy | Written provider record, minimum scopes, revocation, cache/redistribution rules, audit logs | Provider approval/terms evidence for Chess.com, Lichess, FIDE, ChessBase, ICC, Playchess, AI or schools |

## Pre-monetization checklist

- Confirm operator/entity/DBA/tax posture with qualified advisers.
- Publish and obtain acceptance to accurate Terms/Privacy; identify seller and contact lawfully.
- Approve prices, currency, taxes, trial, renewal, cancellation, refund and chargeback terms.
- Use server-selected products/prices and verified signed webhooks; test idempotency and reconciliation.
- Provide receipts, accessible checkout/cancellation and support response ownership.
- Complete payment processor terms, data map, retention and deletion exceptions.
- Keep PayPal retired unless separately reviewed and expressly authorized.

## Child-safety gate

All features with profiles, communication, uploads, analytics, prizes or AI must separately evaluate users under 18. CAISSA Junior may not inherit adult defaults. "13+" does not resolve provider restrictions for ages 13-15 or Florida rules that define children differently.

## Evidence required for every activation

Product owner, intended users/purpose, data-flow diagram, provider/terms dates, applicable-law analysis, rights/licenses, retention/deletion, threat model, accessibility tests, incident owner, rollback/kill switch, exact release SHA/deployment, and signed human approval. Unknowns remain blockers only when material to that feature.

