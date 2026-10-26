# CAISSA Legal and Compliance Risk Register

**Snapshot:** 2026-10-25  
**Scoring note:** severity is a qualitative product-risk priority, not a prediction of liability, penalty or litigation outcome.

## Human-review priority register

| Priority | Evidence-based decision |
|---|---|
| **P0** | Keep registration paused; do not publish AUTH-004B unchanged; adopt a counsel-reviewed provisional 16+ rule or obtain Clerk's written VPC resolution; publish no policy until operator identity, actual processing, retention/request handling, Google facts and final legal clauses are accurate; keep community Scanner images out of training; retire PayPal only through a separately authorized and verified release plus dashboard deactivation. |
| **P1** | Correct the five findings on currently reachable high-cost services; implement Scanner consent binding/orphan cleanup/quotas/retention; establish account privacy/incident runbooks; close current GPL/artwork/js-dos notice/source gaps; triage the six npm advisories; finish AI provider/prompt/retention disclosure before external generative activation. |
| **P2** | Treat the non-resolving game-fetch and unrouted position-stat findings as activation gates; preserve commerce, under-16, community, tournament, deliberate EU/UK, native-app and material new-AI gates. |

P0 means a human release/publication stop, not a claim that a critical exploitable vulnerability or inevitable statutory violation exists.

| ID | Feature / evidence | Source / risk | Applicability | Severity / confidence | Remediation / effort | Owner / approval |
|---|---|---|---|---|---|---|
| LEG-001 | Sitewide: `/privacy` and `/terms` are 404; no legal links | FTC accuracy principles; Google/Clerk policy expectations. Users lack notice for real collection/providers | CURRENT REQUIRED / RISK | High / High | Publish reviewed, behavior-matched policies and persistent links / M | Product + privacy counsel |
| LEG-002 | Accounts: proposed 13+; Clerk has no age gate; Terms restrict under-16 PI absent VPC | Clerk Standard Terms; inconsistent minimum age can breach provider contract | CURRENT REQUIRED (contract) | High / High | Use 16+ or obtain written Clerk approval and VPC; enforce before OAuth / M | Identity owner + counsel + Clerk |
| LEG-003 | Existing 14 accounts have no age status | Child privacy/provider terms; ages unknown | CURRENT RISK / REVIEW | High / Medium | Counsel-approved migration/age confirmation without collecting full DOB / M | Identity/privacy owner |
| LEG-004 | No account-wide export/deletion; feature-level deletion only | Privacy notice accuracy; possible data-right duties if territorial laws apply | CURRENT RISK / REVIEW | High / High | Operator runbook across Clerk, Supabase, Storage, logs and providers; later self-service / L | Privacy + engineering |
| LEG-005 | Scanner upload accepts bytes before consent is bound | Consent/data minimization; contradicts internal “no upload without consent” claim | CURRENT RISK / REVIEW | High / High | Require consent atomically; delete failed/orphan uploads / M | Scanner + privacy owner |
| LEG-006 | Historical private-beta Scanner data: 96 objects; no automated retention/deletion | FTC accuracy, storage limitation, user request readiness | CURRENT RISK / REVIEW | High / High | Record-level audit, expiry queues, deletion audit and legal-hold rule / M | Scanner data owner |
| LEG-007 | Platform screenshots in real-image corpus have thin ownership/platform-term proof | Copyright, contracts, privacy; future model/data distribution | CURRENT RISK / FUTURE GATE | High / Medium | Quarantine uncertain records; obtain provenance/rights decision before training/commercialization / M | Data/IP counsel |
| LEG-008 | Public Scanner feedback dataset empty; no automatic training | Strong current mitigating evidence | BEST PRACTICE | Low / High | Preserve fail-closed certification and manifest controls / S | Scanner owner |
| LEG-009 | Owner decided to retire PayPal, but production `/support` still presented the Hosted Button and AUTH drafts say no payment processor is active | Provider/consumer accuracy; direct payment link may outlive site code | CURRENT REMEDIATION GATE | High / High | Separate code/release removal; preserve records; manually deactivate Hosted Button/link; verify production/network absence / M | Product owner + release owner |
| LEG-010 | Support appeal could be understood as educational/charitable | Florida Ch. 496 charitable-solicitation definitions | CURRENT RISK / REVIEW | Medium / Medium | Neutral personal-project wording; Florida counsel/FDACS classification if charitable language remains / S | Counsel |
| LEG-011 | Dormant Stripe/credits can activate via configuration rather than a legal launch control | Consumer, tax, refund, renewal and provider obligations | FUTURE ACTIVATION GATE | High / High | Explicit kill switch; checklist and human approval before env activation / M | Commerce owner + counsel |
| LEG-012 | Project declares MIT but has no root `LICENSE` | Copyright/license ambiguity for CAISSA source recipients | CURRENT RISK / REVIEW | High / High | Add correct license or document alternate rights posture / S | Repository owner + IP counsel |
| LEG-013 | Fairy-Stockfish version/corresponding source unknown | GPL distribution requirements | CURRENT REQUIRED if conveyed | High / High | Stop new redistribution; map binary hash to exact source/build/license / M | Release owner |
| LEG-014 | js-dos lock 8.5.3; CDN loads 8.3.20 | GPL source/notice and SBOM drift | CURRENT REQUIRED if conveyed | Medium / High | Pin/reconcile exact version and source/notice path / S | Release owner |
| LEG-015 | 82 PGN albums; none certified for paid delivery | Copyright/database/contract uncertainty | CURRENT RISK / FUTURE GATE | High / High | Keep commerce off; per-collection chain-of-rights review / L | Content owner + IP counsel |
| LEG-016 | Private user-directed Scanner image storage; no DMCA program | 17 U.S.C. §512 safe-harbor prerequisites | CURRENT RISK / REVIEW | Medium / High | Decide whether to designate agent; takedown/counter-notice/repeat-infringer workflow; identity privacy review / M | IP counsel |
| LEG-017 | Online identity/ratings live; no unified community/fair-play policy | User expectations, harassment, defamation and due process | CURRENT RISK / REVIEW | Medium / High | Rules, private evidence, human review, notice and appeal / M | Community owner + counsel |
| LEG-018 | Guest Online cleanup and CAPTCHA documented as prerequisites, not implemented | Retention, abuse and cost | CURRENT RISK / REVIEW | Medium / High | Expiry/deletion job; durable anti-abuse control before promotion / M | Online/security owner |
| LEG-019 | Forums, broad chat and DMs planned | §230 limits, DMCA, ECPA, CSAM reporting, child safety, DSA if scoped | FUTURE ACTIVATION GATE | High / High | Moderation tooling/staffing, reporting, copyright/CSAM/communications runbooks / L | T&S + counsel |
| LEG-020 | CAISSA is an online game; youth audience composition unknown | Fla. Stat. §501.1735 can cover games predominantly accessed by children | CURRENT RISK / REVIEW | High / Medium | Preserve audience evidence; minimize minor data; child-design assessment / M | Privacy counsel |
| LEG-021 | Google OAuth enabled; no public privacy/terms URLs in Clerk; production brand/scopes not fully evidenced | Google OAuth verification and User Data Policy | CURRENT REQUIRED / REVIEW | High / High | Public accurate homepage/privacy policy, verified domain, scope minimization, brand and revocation checks / M | Identity owner |
| LEG-022 | Generative Mentor supports shared/BYO providers; production provider/feature-gate state, retention and training-use terms unproven | Provider privacy/terms; consumer AI claims; EU AI Act only if territorial/role predicates are met | CURRENT DISCLOSURE / FUTURE GATE | Medium / High | Provider/model/payload notice, sensitive-data warning, DPA/retention/training review, evaluations and kill switch / M | AI/privacy owner |
| LEG-023 | Scanner/mentor capability claims could overstate accuracy | FTC deception principles | CURRENT RISK / REVIEW | Medium / High | “Automated, may be wrong, verify” labels; substantiate benchmark claims / S | Product owner |
| LEG-024 | No whole-site WCAG 2.2 AA audit; targeted tests only | Legal applicability uncertain; technical/access risk | BEST PRACTICE / LEGAL REVIEW | Medium / High | Representative keyboard/screen reader/mobile audit and remediation plan / L | Accessibility owner |
| SEC-001 | Deployed downloads Worker accepts client-declared premium tier and builds up to 200-game/80 MiB ZIP with duplicate buffering | CWE-770; availability/cost; live manifest returned 200 | P1 CURRENT PUBLIC | Medium / High | Verified entitlement/capability; durable quotas; streaming/asynchronous ZIP / M-L | Security/downloads owner |
| SEC-002 | Deployed Polyglot API accepts 25 MiB PGNs behind a cold-start-reset local limiter | CWE-770; parsing/replay/map/sort/output resource exhaustion; safe HEAD returned 405 | P1 CURRENT PUBLIC | Medium / High | Account/capability gate, distributed quota, game/move/entry/output caps / M-L | Security/tools owner |
| SEC-003 | Deployed anonymous Scanner inference uses local limiter; response timeout does not cancel inference | CWE-770; public-beta status is active | P1 CURRENT PUBLIC | Medium / High | Global semaphore, challenge/account admission, cancellable isolation / M-L | Scanner/security owner |
| SEC-004 | Deployed anonymous Scanner scan API persists unique JSONB through service role with no row/byte/retention budget | CWE-770; database/backup quota exhaustion | P1 CURRENT PUBLIC | Medium / High | Recognition receipt/auth, strict schema, durable row/byte budgets and deletion / M | Scanner/data owner |
| SEC-005 | Deployed authenticated Scanner image upload has no durable per-user/project object or byte quota | CWE-770; Storage/bandwidth exhaustion | P1 CURRENT PUBLIC | Medium / High | Transactional quotas, feedback-bound capability, orphan cleanup / M | Scanner/data owner |
| SEC-006 | Game-fetch `max` parses nonnumeric input to `NaN`, bypassing the 50-game bound | CWE-20; custom route commented and configured workers.dev hostname did not resolve | P2 ACTIVATION / DECOMMISSION CHECK | Medium / High | Validate/decommission deployment; safe-integer validation, byte cap and durable limiter before any activation / S-M | Cloudflare worker owner |
| SEC-007 | Position-stat Worker can cache all 256 parsed R2 shards without byte/LRU eviction | CWE-770; no route/consumer found; shard sizes/isolate affinity unknown | P2 ACTIVATION GATE | Medium / Medium | Prove deployment and measure shards; strict LRU byte/count cap or indexed/cache design before activation / M | Cloudflare worker owner |
| SEC-008 | `npm audit`: one moderate and five high advisories | Supply-chain exposure depends on reachable vulnerable paths | CURRENT RISK / REVIEW | Medium / Medium | Triage advisories, upgrade/test, record accepted residual risk / M | Dependency owner |
| SEC-009 | No repository-wide incident plan or log schedule | Florida breach and vendor-response readiness; current coverage uncertain | BEST PRACTICE / CURRENT REVIEW | Medium / High | Incident roles, containment, provider contacts, evidence, notice decision tree and exercises / M | Security/privacy owner |
| SEC-010 | Server service role bypasses RLS; API/RPC checks carry the boundary | High-impact architecture, no present bypass found | BEST PRACTICE | Medium / High | Maintain ownership tests, least-privilege RPCs, environment separation and audit / M | Backend/security owner |
| GOV-001 | Fictitious-name status unresolved after live contribution feature | Fla. Stat. §865.09; exception depends on conducting business/compensation facts | CURRENT RISK / REVIEW | Medium / Medium | Florida counsel/DOS fact review; do not file automatically / S | Operator + counsel |
| GOV-002 | Operator identity/address privacy versus enforceable Terms/DMCA/regulator needs | Contract formation, DSA/GDPR if applicable, DMCA public record | CURRENT RISK / REVIEW | High / Medium | Counsel chooses lawful public identity/contact and privacy-preserving agent/address options / M | Operator + counsel |
| GOV-003 | Deliberate EU/UK offering not established | GDPR/UK GDPR, DSA and EU AI Act depend on territory/role; free status is not dispositive | UNKNOWN / FUTURE GATE | Medium / Medium | Record targeting/monitoring facts; re-evaluate before localization/marketing / M | Privacy counsel |

## Seven-finding validation rubric and disposition

Each finding was retained only if it met the same five criteria: (1) attacker-controlled input, (2) reachable source-to-resource sink, (3) missing or bypassable durable bound, (4) concrete availability/cost outcome, and (5) no source-proven compensating control that removes the path. Review was static and non-destructive.

| ID | Input → sink | Source disposition | Deployment disposition | Prioritized non-destructive proposal |
|---|---|---|---|---|
| SEC-001 | public `tier` → high ZIP caps → R2 reads + duplicate buffers | Validated, high confidence | Public deployed | Verify entitlement server-side; lower anonymous caps; distributed account/IP/concurrency budgets; stream or queue archives |
| SEC-002 | anonymous PGN/options → parser/replay/map/sort/output | Validated, high confidence | Public deployed | Capability/account admission; distributed quota; game/ply/entry/output byte ceilings; bounded job isolation |
| SEC-003 | guest image JSON → decode/preprocess/ONNX; timeout race leaves work running | Validated, high confidence | Public deployed | Global semaphore; challenge/account admission; worker process capable of hard cancellation; queue/timeout monitoring |
| SEC-004 | anonymous variable snapshot/metadata → service-role JSONB writes/backups | Validated, high confidence | Public deployed | Recognition receipt or identity; strict allowlist schema; durable row/byte/day budgets; expiry/deletion job |
| SEC-005 | authenticated varied image bytes → unique private Storage objects | Validated, high confidence | Public deployed, account required | Feedback-bound upload capability; transactional per-user/project quotas; abandoned-object cleanup; reserve/alerts |
| SEC-006 | nonnumeric `max` → `NaN` → false stop/trim comparisons → archive aggregation | Validated in source, high confidence | No reachable audited URL established | Decommission confirmation or integer 1–50 validation, independent byte cap and shared limiter before deployment |
| SEC-007 | chosen hex prefix → full R2 shard parse → unbounded module Map | Validated as plausible, medium confidence | No route/consumer established | Measure built/deployed shards in isolation; hard LRU entry/byte ceiling or indexed records; activation test under heap budget |

External WAF, Cloudflare/Vercel concurrency controls, deployment dashboards, production shard sizes and log-based exploit frequency were not inspected and are not credited as mitigations.

## Non-findings and reasoned exclusions

- No current evidence that Florida's Digital Bill of Rights controller thresholds apply.
- No current evidence that CCPA/CPRA or reviewed Colorado, Delaware or Maryland comprehensive-law thresholds apply.
- Free ordinary chess play is not treated as gambling. Paid entry, prizes, wagering or chance promotions remain separate future gates.
- Scanner board recognition is not a general-purpose AI model or apparent Annex III high-risk EU AI use on current facts.
- No embedded live credential, direct Supabase browser exposure, cross-user Online move path, unsigned Stripe event fulfillment or attacker-selected AI destination was established in the standard source scan.

## Review cadence

Review this register at every account, upload, community, AI or commerce launch; after a material incident; on major provider-term change; and at least quarterly while public beta features are active.

