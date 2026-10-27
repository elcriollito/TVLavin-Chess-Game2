# CAISSA Product Compliance Matrix

**Verified:** 2026-10-26 against `main` `6e912be5c314080be8944efde261b8dc133452a6` and safe production observations.
Status describes reachability/maturity, not a compliance certification.

| Product / route | Status | Data and processors | Principal issue / gate | Evidence |
|---|---|---|---|---|
| Home, About, Help, Blog, Roadmap | PUBLIC | Hosting/request logs | Privacy/Terms links cannot work while both routes return 404 | E-PROD-001 |
| Sign-in / sign-up / accounts | PUBLIC; REGISTRATION PAUSED | Clerk, Google, Supabase | LEGAL-001, AUTH-001, AUTH-002 | E-CLERK-001..004 |
| Play, Bots, Coach, replay | PUBLIC | Local game state; optional account data | Free chess is not gambling; maintain accessible controls and accurate capability claims | E-ROUTE-001 |
| CAISSA Online | PUBLIC / EARLY DATA | Supabase profiles, ratings, presence, tickets | Community rules, reporting, retention, fair-play review and appeals before scale | E-SB-001 |
| CAISSA Classic | PUBLIC | Local/browser state; linked community surfaces | Do not market inert chat/community controls as operational | E-ROUTE-001 |
| FICS Gateway | PUBLIC | Third-party network service, handles/nicknames | Explain third-party terms, transport, visibility and moderation boundary | E-SRC-ONLINE-001 |
| Puzzles | PUBLIC | Progress/attempts; Lichess CC0 dataset | Preserve provenance; include account deletion/export | E-SB-001, E-IP-004 |
| Opening Trainer / Database / Explorer | PUBLIC | FEN, PGN, repertoires, R2/static datasets | Provenance and owner-bound access; SEC-001/002 affect public tools | E-ROUTE-001 |
| Endgame / Syzygy | PUBLIC / MIXED | Positions and tablebase data/API | Confirm exact data source, API and redistribution terms | E-IP-005 |
| Analyze / Engine Arena | PUBLIC | Browser engines and optional saved state | GPL notices and corresponding-source mapping | E-IP-001..003 |
| PGN Reader / player collections / Vault | PUBLIC / MIXED | PGN files and R2 downloads | No collection certified for paid delivery; rights review before commercialization | IP-004 |
| Polyglot Builder | PUBLIC | Server receives PGN and returns binary | SEC-002 resource amplification; Season 2 fix not deployed | E-SEC-002 |
| Scanner Public Beta | PUBLIC BETA | Hosted ONNX, scan JSON, optional feedback/images | SCAN-001/002 and SEC-003..005 | E-PROD-002, E-SB-001 |
| Scanner Private Beta | PRIVATE / HISTORICAL | 96 private images and related records | Retention, rights and deletion review; no automatic training | E-SB-001 |
| Scanner review console | PRIVATE / PROTECTED | Feedback, signed image access, audit/certification | Preserve least privilege and raw-unverified boundary | E-SRC-SCAN-001 |
| Beta Tester Program | PRIVATE / FEATURE-GATED | Roles, entitlements, audit | Beta terms, privacy and lifecycle before reopening | E-SB-001 |
| Library / Insights | PUBLIC ACCOUNT FEATURES | Positions, reports and derived chess data | Per-item controls exist; account-wide lifecycle does not | DATA-001 |
| Mentor / Academy | PUBLIC UI / MIXED | Local engine; optional external AI paths in source | External AI activation requires provider/privacy/cost gate | AI-001 |
| Chess TV / external streams | PUBLIC AGGREGATION | Third-party streams/links | Attribution, trademark and caption/accessibility review | COMM-003 |
| Fair-play / Cheater Insight | PUBLIC TOOL | Public game/account information, derived score | No public accusations; human review, evidence and appeal | COMM-002 |
| GIF Studio | PUBLIC visualization capability | User PGN/FEN and generated files | Input rights, artwork/theme licenses, sharing/takedown terms | IP-004 |
| DOS Chess | PUBLIC EMULATION | js-dos and bundled game/assets | Exact runtime version and GPL/source/notice reconciliation | IP-003 |
| Support | PUBLIC `/help`; PAYPAL RETIRED | Email/help content | Do not describe donations or payments as active; do not restore PayPal | E-PROD-001 |
| Premium | COMING SOON / NOT ACTIVE | No verified active billing | Full subscription/consumer/tax gate before activation | COM-001 |
| Stripe / credits | DORMANT SOURCE / PROTECTED | Stripe and ledger code; zero events observed | Explicit launch approval, prices, refunds, cancellation, tax and webhook verification | COM-001, E-SB-001 |
| Forum / chat / DMs | PLANNED | Future UGC and communications | Moderation, child safety, DMCA, privacy and incident gates | COMM-001 |
| Native tournaments | PLANNED | Future entries, eligibility, prizes/payments | Separate free/no-prize from prizes/paid entry; counsel by jurisdiction | COM-002 |
| CAISSA Junior | PLANNED | Future child accounts/data | COPPA/VPC and provider approval; do not activate | CHILD-002 |
| Desktop/native apps | PLANNED / NOT FOUND | Future local files, updates, telemetry | Signing, secure updates, notices and telemetry disclosure | FUT-006 |
| Vision Lab | PLANNED | Future learning/progress metrics | Avoid identifiable learning profile until purpose/retention/child review | FUT-004 |
| Market Reader | OUT OF SCOPE / SEPARATE PRODUCT | Separate worktree and potentially shared infrastructure | Separate policy analysis; no inspection or modification of dirty worktree | E-GIT-001 |

## Service reachability and non-production work

- The Downloads Worker was reachable and its current `main` code trusts a caller-controlled premium tier for larger downloads (SEC-001).
- Scanner recognition/status and Polyglot routes are deployed. Their current limits are process-local; Security Season 2 contains targeted controls but is not on production.
- The game-fetch and position-stat workers have source-level activation risks (SEC-006/007); public deployment was not established, so they are not described as present public vulnerabilities.
- Privacy branch `season/privacy-governance-remediation-20261026` and integration branch `integration/engineering-governance-s2-20261026` are development evidence only.

## Classification legend

- **CURRENT REQUIRED:** established current duty or binding provider/release requirement.
- **CURRENT RISK / REVIEW:** present exposure needing facts or counsel.
- **FUTURE ACTIVATION GATE:** must be resolved before the described feature launches.
- **BEST PRACTICE:** proportionate risk reduction not established here as mandatory law.
- **NOT APPLICABLE:** reasoned exclusion on current facts.
- **UNKNOWN:** evidence is insufficient; not approval.

