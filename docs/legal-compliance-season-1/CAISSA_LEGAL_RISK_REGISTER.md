# CAISSA Legal and Governance Risk Register

**Verified:** 2026-10-26. Severity is proportionate and does not imply a judicial conclusion.

| ID | Category / affected product | Facts and rule | Status / uncertainty | Severity / likelihood | Remediation / dependency / approval | Acceptance |
|---|---|---|---|---|---|---|
| LEGAL-001 | Privacy/consumer; accounts/OAuth | `/privacy` and `/terms` are 404; Google production apps require public matching pages | Current provider/release duty | HIGH / certain | Publish approved accurate pages through AUTH-004; owner/counsel | 200, linked, content verified |
| AUTH-001 | Child/provider; accounts | Owner 13+ policy conflicts with Clerk under-16 VPC term | Current, registration paused; ages unknown | HIGH / high if signup opens | Choose 16+, valid VPC/provider approval, or alternative | Documented decision and enforced tests |
| AUTH-002 | OAuth; accounts | Clerk Google enabled but custom credentials empty | Current technical/provider blocker | HIGH / certain | AUTH-004 inserts verified production credentials and tests | `client_id`, callback/session/mobile tests pass |
| DATA-001 | Privacy; all accounts | No coordinated export/deletion workflow | Current risk; laws vary | HIGH / medium | Build operator runbook then automation; retention exceptions | Verified request test across processors |
| DATA-002 | Retention/processors | Category retention, log settings and subprocessor register incomplete | Current governance risk | MEDIUM / high | Approve criteria, DPAs/regions/contacts and deletion jobs | Signed schedule and sample deletion evidence |
| CHILD-001 | Signup | No certified age control; signup paused | Current factual gap | HIGH if reopened / high | Resolve AUTH-001; neutral pre-account screen | Ineligible flow creates no account/excess data |
| CHILD-002 | Junior | Under-13 program only planned | Future | CRITICAL if launched ungated / unknown | Full COPPA/VPC/parent program and counsel | Checklist in child review passes |
| SCAN-001 | Scanner images | Upload can occur before consent binding | Current deployed endpoint; bucket empty | HIGH / medium | Season 2-style grant/atomic binding/quota, migration/release | Orphan/consent/quota tests pass |
| SCAN-002 | Scanner training | Historical/community rights and lineage not complete | Future training gate | HIGH / medium | Record-level eligibility, manifests, human approval | Reproducible clean export; no protected overlap |
| SCAN-003 | Scanner retention | 96 historical objects; no operational deletion schedule | Current private evidence | MEDIUM / high | Reconcile, quarantine, approve/delete by criteria | Object-to-record report and deletion log |
| SEC-001 | Downloads Worker | Caller declares premium tier | Current reachable security finding | HIGH / high | Signed capability/entitlement; Security S2 review | Forged tier stays free; valid capability bounded |
| SEC-002 | Polyglot | Anonymous 25 MB parse lacks structural budgets | Current public security finding | MEDIUM / medium | Budgets, concurrency, durable/platform limits | Amplification tests rejected early |
| SEC-003 | Scanner inference | Timer does not constrain underlying work | Current public security finding | MEDIUM / medium | Admission until settlement, durable quotas | Timeout blocks overlap; recovery test |
| SEC-004 | Scanner scan persistence | Anonymous writes lack durable row/byte quota | Current public security finding | MEDIUM / medium | Auth or durable privacy-preserving budget/retention | Multi-instance quota and cleanup evidence |
| SEC-005 | Scanner images | No durable storage quota/atomic binding | Current public security finding | MEDIUM / medium | Consent grant, quotas, cleanup | Project/user budgets and rollback tested |
| SEC-006 | Game worker | `max=NaN` parsing risk | Activation; deployment not established | LOW current / medium if activated | Strict integer parsing | Invalid/fraction/overflow tests |
| SEC-007 | Stats worker | Whole-shard cache unbounded | Activation; size/deploy unknown | LOW current / medium if activated | Object/aggregate/LRU caps | Oversize/LRU tests |
| DEP-001 | Supply chain | Six historical npm advisories not reachability-triaged | Current review | MEDIUM / unknown | Reachability, upgrades, regression, SBOM | No unreviewed high reachable advisory |
| IP-001 | Source license | MIT declared, root license absent | Current distribution ambiguity | MEDIUM / certain | Owner selects license/holder | Root scope and metadata consistent |
| IP-002 | Engines | Some exact binary/source mapping incomplete | Current conveyed artifacts | HIGH / medium | Hash/version/build/source notices | Every object code has matching source path |
| IP-003 | js-dos/DOS | Delivered vs locked version drift | Current public emulation | MEDIUM / high | Reconcile actual runtime/license/source | Network artifact matches notice |
| IP-004 | PGN/media/screenshots | Rights are collection-specific | Current/future | HIGH for paid redistribution / medium | Keep paid use off; certify per item/collection | Rights manifest complete |
| COMM-001 | Online/community | Early identity/fair-play; no broad forum verified | Current policy maturity | MEDIUM / medium | Rules/report/appeal; forum activation gate | Accessible report and response runbook |
| IR-001 | Incident response | No complete operator playbook evidenced | Current governance | MEDIUM / medium | Provider contacts, triage, notice analysis, restore test | Tabletop and signed owner list |
| A11Y-001 | Accessibility | 001B passed scoped tests, not whole-site certification | Ongoing | MEDIUM / medium | Preserve regression/human testing; accurate claims | New critical flow evidence |
| FL-001 | Florida identity | Free personal facts; DBA duty not clear | Current legal question | LOW now / rises with commerce | Counsel before compensated activity/public filing | Written determination at trigger |
| COM-001 | Commerce | No active revenue/subscriptions; code exists | Future | HIGH if activated ungated | Full pre-monetization gate | Consumer/payment/tax checklist |
| AI-001 | External GenAI | Activation/provider settings unverified | Future/current feature flag question | MEDIUM / unknown | Provider/data/cost/security gate | Exact model/provider evidence and tests |

## Verification state

All entries are either source/configuration-evidenced or explicitly marked future/unknown. None is a certification of illegality. Responsible workstreams are AUTH-004, Privacy Season 2, Security Season 2, Scanner Governance, Product/Community, Accessibility, Licensing and Owner/Counsel as indicated in companion reports.

