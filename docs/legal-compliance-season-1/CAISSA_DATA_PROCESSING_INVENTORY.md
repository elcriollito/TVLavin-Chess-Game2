# CAISSA Data Processing Inventory

**Verified:** 2026-10-26
**Controller description for this audit:** the individual operating the personal CAISSA Chess project; no company is asserted.
**Contact:** `privacy@caissa-chess.org`

Possible GDPR legal bases below are issue-spotting only; territorial applicability is unresolved.

| Data category | Purpose / source | Processor / storage | Access and sharing | Retention / rights status |
|---|---|---|---|---|
| Email, account and identity binding | Authentication and continuity | Clerk; Supabase | User, verified APIs, limited operator access | No coordinated account export/deletion (DATA-001) |
| OAuth/session tokens and metadata | Session creation/security | Clerk, Google, browser cookies | Clerk/Google and CAISSA verification path | Clerk maximum session life observed as 7 days; revocation workflow not documented |
| Public display name/profile/rating | Online identity and play | Supabase | Public/participants as designed | No published lifecycle schedule |
| Roles, entitlements, credits | Authorization; dormant commerce | Supabase | Service-role APIs/operator | Account-linked; no full closure workflow |
| Saved positions/repertoires/reports | User study and analysis | Browser/Supabase | Owner-bound APIs and operator service | Some item deletion/export; not account-wide |
| Puzzle attempts/progress | Resume and performance | Supabase | Account APIs/operator | No published retention criteria |
| Online tickets, presence, games/events | Matchmaking/integrity | Supabase/Realtime | Participants/server; limited public projection | Guest cleanup and archive criteria unresolved |
| Ordinary Scanner recognition image | Requested board recognition | Vercel function/ONNX runtime | Request runtime | Source image not intentionally stored by ordinary scan; platform logs not fully inspected |
| Scanner scan snapshot/FEN/diagnostics | Feedback linkage and quality | Supabase | Anonymous or account-bound service/operator | Public tables empty at inspection; no durable row/byte budget on current `main` |
| Optional Scanner feedback/correction | Quality review | Supabase | Submitter and authorized reviewer | Raw-unverified; no automated retention/deletion workflow |
| Optional Scanner image | Private review evidence | Private Supabase Storage | Submitter; authorized reviewer via signed URL | Public bucket empty; current upload precedes consent binding (SCAN-001) |
| Historical private-beta images/predictions | Beta accuracy/research evidence | Private Storage/Supabase | Authorized operator/reviewer | 96 objects; rights/consent/retention reconciliation required |
| Security/request logs and IP | Security, reliability and rate limiting | Vercel/Cloudflare/providers | Platform/operator | Provider retention/log-drain settings not fully evidenced; minimize and restrict |
| Support/privacy correspondence | Requests and disputes | Email provider | Operator | Define support/incident/legal-hold criteria; do not publish forwarding destination |
| Browser local storage/IndexedDB | Preferences/local chess state | User device | User and same-origin scripts | User-controlled unless synchronized; explain local vs cloud |
| Local engine inputs/outputs | Chess analysis | Browser workers | User | Ephemeral unless saved; not external generative AI |
| External AI prompts/results/API key | Optional future/feature-gated explanation | Vercel and selected provider | User, runtime, provider | Deployed activation and provider settings unverified; API keys must remain transient |
| Stripe/billing metadata | Dormant future commerce | Stripe/Supabase | User, processor, server/operator | Zero Stripe events observed; no active commerce claimed |
| Google OAuth basic profile/email | Future restored sign-in | Google/Clerk | User, Google, Clerk, CAISSA | Not production-ready; basic identity scopes only |

## Production database and storage snapshot

Read-only production inspection found 14 user rows, 15 identity bindings, 121 puzzle attempts, 5 insight reports, 97 private-beta scans, 6,208 square predictions, 92 feedback rows, 8 corrections, 20 failures and 96 objects in `scanner-beta-images`. Public Scanner scan/feedback/certification tables and its feedback-image bucket were empty at inspection time. Both Scanner buckets were private and limited to JPEG/PNG/WebP up to 12 MB.

All reviewed public-schema tables had RLS enabled and no browser-role policies. This is deny-by-default for browser roles, not proof of exposure. Server functions use Supabase service-role credentials and bypass RLS, so endpoint authorization, ownership predicates and service-only RPC design remain the actual trust boundary. Forty-eight public `SECURITY DEFINER` functions require maintained grant/search-path/body review; their existence alone is not a finding.

## Purposes and possible legal basis if territorial law applies

| Purpose | Candidate basis | Boundary |
|---|---|---|
| Deliver requested chess/account service | Contract / steps requested | Does not extend to optional training or marketing |
| Security and abuse prevention | Legitimate interests | Necessity/balancing, minimization and retention required |
| Optional correction/image contribution | Specific consent plus rights representation | Separate, informed, revocable prospectively, not a condition of recognition |
| Incidents, disputes and accounting | Legal obligation or legitimate interests | Narrow retention and documented legal hold |
| External generative AI request | Contract/consent depending context | Provider, transfer, retention and training disclosure before transmission |

## Required lifecycle controls

1. One verified request channel and operator runbook for access, correction, export and deletion.
2. A deletion map across Clerk, Supabase rows, Storage objects, Vercel/Cloudflare logs and downstream processors.
3. Category-specific retention criteria and an exception process for fraud, incidents and legal holds.
4. Scanner orphan-object cleanup, certification-history handling and prospective training withdrawal.
5. Processor/subprocessor register, DPA/region/transfer evidence and breach contacts.
6. Proof that production logs avoid tokens, secrets, raw image bodies and excessive prompt content.

## Applicability

- Florida Digital Bill of Rights: **NOT APPLICABLE on current verified facts** because CAISSA is not a qualifying controller (including the $1B global revenue and specified business-model elements in section 501.702).
- Florida section 501.171: **UNKNOWN / COUNSEL REVIEW** because its covered-entity definition is commercial; use it as incident-planning guidance without claiming conclusive coverage.
- GDPR/UK GDPR: **UNKNOWN** until offering/monitoring, residence, targeting and processor facts are established.
- CCPA/CPRA and other state comprehensive laws: revenue/volume/activity thresholds were not shown; re-evaluate upon scale, sale/sharing, targeted advertising or monetization.

## Primary sources

- [Florida Digital Bill of Rights definitions](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.702.html)
- [Florida breach notification statute](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.171.html)
- [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [EDPB territorial-scope guidance](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32018-territorial-scope-gdpr-article-3-version_en)
- [Clerk DPA](https://clerk.com/legal/dpa), [Supabase DPA](https://supabase.com/legal/dpa), [Vercel DPA](https://vercel.com/legal/dpa), [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)

