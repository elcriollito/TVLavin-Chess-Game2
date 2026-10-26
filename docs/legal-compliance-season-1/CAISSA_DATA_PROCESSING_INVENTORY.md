# CAISSA Data Processing Inventory

**Verified:** 2026-10-25  
**Controller/operator description for this audit:** the individual operating the personal CAISSA Chess project; no company is asserted.  
**Contact:** `privacy@caissa-chess.org`

“Legal basis” entries are issue-spotting positions if GDPR/UK GDPR applies; they are not a declaration that those regimes currently apply.

## Inventory

| Data category | Collection point and purpose | Storage / processor | Access | Retention / deletion | Sharing / transfer and safeguards |
|---|---|---|---|---|---|
| Account identifiers and email | Clerk sign-in; account continuity and support | Clerk; Supabase `users`/identity bindings | User; server; limited operator roles | No complete account deletion workflow; Clerk and Supabase must be coordinated | Clerk/Vercel/Supabase; JWT verification, service-only data plane, RLS |
| Public identity / display name | Online/profile surfaces; opponent identification | Supabase public identity/profile tables | Public or participants as designed; server/operator | No user-facing full lifecycle workflow | Supabase Realtime/API; participant policies |
| Age/consent status | Not currently collected in production | None verified | None | Not applicable yet | Proposed release candidate would store an age band, not date of birth |
| Roles, entitlements, premium, credits | Authorization and dormant commercial features | Supabase | Server/service role; operator | Linked to account; no account-wide erasure workflow | Vercel to Supabase; server resolves authority |
| OAuth/session data | Authentication | Clerk, Google, browser cookies/local compatibility state | User, Clerk, verified CAISSA APIs | Clerk configuration governs session; one-week max observed | Google/Clerk; minimize scopes; provide revocation/support path |
| Library positions and collections | Save/pull/delete chess study content | Supabase | Owner-bound API and operator service role | Item deletion exists; local export exists; no whole-account workflow | Vercel/Supabase |
| Opening repertoires | Training and study | Supabase | Owner-bound API | Per-feature operations; whole-account lifecycle absent | Vercel/Supabase |
| Puzzle attempts/progress | Resume and measure puzzle practice | Supabase | Account-bound APIs/operator | No published retention schedule | Vercel/Supabase; 121 attempts and 4 progress rows observed |
| Insight reports | Chess analysis reports | Supabase | Owner-bound API/operator | Per-report deletion exists | Vercel/Supabase; five reports observed |
| Online profile, rating, presence | Matchmaking and play | Supabase/Auth/Realtime | Public/participants/server according to projection and policies | Guest cleanup is documented as a prerequisite, not implemented | Supabase; one profile/ratings/presence row observed |
| Online tickets, challenges, games, events | Matchmaking, authoritative game record, integrity | Supabase | Participants/server; limited public projection | No production schedule; tickets existed, no games/events observed | Vercel/Supabase Realtime; server-side legality and version checks |
| Private-beta Scanner image and hash | Feedback, debugging and possible governed corpus work | Private Supabase Storage bucket and beta tables | Submitting beta user and authorized operator/reviewer | Provisional documents say review/delete at 90/180 days, but no automated job | Vercel/Supabase; private bucket, signed/opaque references; 96 objects observed |
| Scanner prediction snapshot, FEN, correction and feedback | Accuracy review and certification | Supabase | Submitter/operator/reviewer | Raw evidence is append-oriented; no user erasure workflow | Vercel/Supabase; separate correction and image consent fields |
| Public Scanner inference input | Recognize a board | Vercel function / ONNX runtime | Request runtime | Ordinary scans do not store the source image in the Scanner database | Vercel runtime; canonical 512×512 RGBA inference input |
| Public Scanner source image upload | Authenticated feedback evidence | Private Supabase Storage | Owner plus authorized reviewer via short signed URL | Public bucket had zero objects; upload can precede feedback consent and orphan cleanup is absent | Vercel/Supabase; type, magic, size and digest checks |
| Scanner failures and diagnostics | Diagnose recognition failures | Supabase/logs | Operator/reviewer | No final schedule | Minimize client metadata; do not log raw image/body |
| AI Mentor prompts, engine reports and output | Chess explanation | Vercel proxy, selected AI provider; encrypted short-lived result store in economic mode | User; selected provider; runtime/operator logs limited to metadata | Result TTL is configurable/bounded in code; provider retention terms must be disclosed | Together/OpenAI/Anthropic/Llama routes depending mode; fixed endpoints and provider/model allowlists |
| User-supplied AI API key | BYO provider authentication | Request memory, sent to chosen provider | User, Vercel runtime, provider | Intended transient handling; not intentionally logged | Fixed provider destination; disclose direct provider relationship |
| Stripe customer/event/checkout metadata | Dormant subscriptions/credits | Stripe and Supabase | User, Stripe, server/operator | No active Stripe events observed; launch schedule required | Signed webhook, server-selected prices, idempotent fulfillment |
| PayPal contribution details | Voluntary support | PayPal; CAISSA receives transaction/account records | Contributor, PayPal, operator | Set accounting/refund retention schedule | PayPal terms/privacy apply; no feature benefit should attach |
| Support/privacy correspondence | Respond to requests and disputes | Mail provider outside repository | Operator and authorized support | Define ticket/incident retention | Do not use the legacy personal mailbox; publish privacy contact |
| IP address and request metadata | Security, rate limiting, operations | Vercel/Cloudflare/Supabase/provider logs | Platform/operator | External drain/access/retention settings unresolved | Treat as personal/security data; use trusted proxy-derived IPs |
| Security and audit records | Detect abuse, document actions | Supabase audit/event tables and platform logs | Limited operator roles | Incident and legal-hold schedule required | Avoid prompts, tokens, image bytes and full private game content |
| Local browser data | Preferences, compatibility profile, local library/game state | User browser/localStorage/IndexedDB | User and same-origin scripts | User-controlled unless synced | Explain local versus cloud data; third-party script governance matters |

## Production facts

- Supabase production contained 14 user rows and 15 identity bindings.
- All reviewed public-schema tables had RLS enabled. Linter notices reported “RLS enabled, no policy” on tables not granted to browser roles; those notices do not by themselves establish exposure.
- Server APIs commonly use the Supabase service-role key. RLS is therefore not a substitute for API ownership predicates and service-only RPC checks.
- Both Scanner buckets were private and limited to JPEG/PNG/WebP up to 12 MB when inspected.
- Public Scanner evidence tables and the public feedback image bucket were empty. Historical private-beta data remained.
- There was no account-wide export or deletion API and no automated Scanner retention job in the reviewed revision.

## Purposes and possible legal bases

If GDPR/UK GDPR applies, likely bases require a final purpose-by-purpose assessment:

| Purpose | Candidate basis | Limit |
|---|---|---|
| Provide requested chess/account service | Contract or steps requested by user | Do not stretch this to optional training or marketing |
| Secure the service and prevent abuse | Legitimate interests | Document necessity/balancing; minimize IP/log retention |
| Optional Scanner correction/image contribution | Consent plus license/rights representation | Consent must be granular, informed, revocable prospectively and separate from account access |
| Legal claims, accounting and incidents | Legal obligation or legitimate interests | Apply narrow retention and legal hold |
| Generative AI request | Contract/consent depending context | Give provider/transfer notice and avoid sensitive data |

## Missing lifecycle controls

1. One intake path and identity-verification procedure for access, correction, deletion and objection requests.
2. A system map that translates one request across Clerk, Supabase, Storage, Vercel/Cloudflare logs, AI providers and payment providers.
3. An account closure operation with explicit exceptions for fraud, financial, security and legal-hold evidence.
4. Scanner image/object deletion, abandoned-upload cleanup, certification-history handling and future-training withdrawal rules.
5. Online guest/anonymous-user expiry and cleanup.
6. Published retention periods or defensible criteria for each category.
7. Processor/subprocessor register, DPA links, transfer mechanism analysis if territorial law applies, and breach-contact ownership.

## Applicability

- FTC deception/unfairness risk can attach to inaccurate privacy and security claims; commercial jurisdiction over a wholly free hobby project is fact-sensitive.
- Florida §501.171 breach duties apply to covered commercial or governmental entities and require fact-specific review. Use its 30-day individual-notice and 500-person Attorney General thresholds as incident-plan triggers if coverage is confirmed.
- Current facts do not show thresholds for CCPA/CPRA or the reviewed Colorado, Delaware and Maryland comprehensive laws.
- GDPR/UK GDPR requires deliberate territorial analysis: accessibility alone is insufficient, while offering to or monitoring people in those territories may be enough. If applicable, controller identity, lawful bases, notices, rights, processors/transfers and breach response are required.

## Authoritative references

- [FTC, Start with Security](https://www.ftc.gov/business-guidance/resources/start-security-guide-business)
- [Florida breach notification statute](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.171.html)
- [California Attorney General, CCPA](https://oag.ca.gov/privacy/ccpa)
- [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [EDPB, territorial scope guidance](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32018-territorial-scope-gdpr-article-3-version_en)
- [ICO, UK GDPR scope](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-and-the-eu/data-protection-and-the-eu-in-detail/the-uk-gdpr/)
- [Clerk DPA](https://clerk.com/legal/dpa)
- [Supabase DPA](https://supabase.com/legal/dpa)
- [Vercel DPA](https://vercel.com/legal/dpa)
- [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)

