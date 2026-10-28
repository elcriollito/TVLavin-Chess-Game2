# AUTH-004H retention and deletion matrix

Audit date: October 27, 2026

Status: **PROPOSAL — NOT IMPLEMENTED OR APPROVED**

No real data was opened, changed, or deleted. “Proposed policy” is a decision aid, not a promise.

| Data category | Storage / processor | Purpose | Current observed retention | Proposed policy | Deletion capability / backup notes | Approval |
| --- | --- | --- | --- | --- | --- | --- |
| Clerk account and session data | Clerk Production | Authentication, session/security | Account lifetime plus provider operational retention; no CAISSA-wide period | Account lifetime; delete after verified request unless security/legal preservation applies | Clerk API/dashboard can delete accounts; provider DPA describes post-termination deletion, not CAISSA per-user timing | C/D |
| CAISSA user/identity binding | Supabase Production | Link Clerk subject to CAISSA profile/entitlements | Indefinite while account exists | Account lifetime plus a documented recovery/security window | Database deletion/anonymization must preserve referential integrity and audit needs; backups may lag | C/D + implementation |
| Public chess profile | Supabase | Nickname/alias, ratings, public identity | No approved service-wide period | While account is active; define post-deletion anonymization | Requires verified cascade/anonymization workflow | C/D |
| Games, moves, ratings, puzzle/progress | Supabase/browser | Chess service and user history | Feature-specific or indefinite | User-controlled deletion where feasible; preserve integrity through anonymization when needed | Some linked records require transactional handling; browser data can be cleared locally | C/D |
| Saved positions/library | Supabase/browser | User-requested storage | Until user removes or browser clears; no unified account purge | Until user deletes/account closes, subject to backup delay | Feature deletion exists in places; full account workflow not certified | C + implementation |
| Scanner recognition request image | Vercel function/runtime, transient processing | Return proposed position | Ordinary recognition is intended to be transient; hosting/security logs may remain | Do not persist image absent explicit feedback consent; document log behavior | Verify no application persistence; provider logs/backups follow provider controls | A/B + periodic verification |
| Public Scanner raw feedback | Supabase tables | Human-reviewed improvement feedback | Append-only design; no approved period | Retain until review outcome plus an approved audit period; support withdrawal where law/consent requires | Updates/deletes intentionally restricted; controlled admin procedure required | C/D |
| Scanner private feedback images | Private Supabase Storage | Evidence for opted-in review | No lifecycle rule; historical private objects remain quarantined | Quarantine pending rights review; then approve lifecycle by consent/review state | Storage API can delete, but no certified lifecycle or backup timing | C/D |
| Scanner certification/review audit | Supabase | Provenance, safety, training eligibility | Append-only | Retain for defensible provenance while derived artifacts exist; define anonymization | Destructive deletion can break provenance; pseudonymization may be safer | C/D |
| 16+ eligibility month/year | Request memory only | Eligibility decision | Discarded after evaluation | Continue immediate discard | No database/browser/Clerk/log storage permitted | A — settled |
| Age-gate nonce digest | Supabase after migration | Replay prevention | Up to 15-minute validity; row cleanup not yet production-active | Delete after short operational/grace window | Has expiry field; production cleanup runbook must be certified | C + implementation |
| Age-gate rate windows | Supabase after migration | Abuse control | Short windows plus bounded cleanup logic | Keep only the minimum operational window; automate cleanup | HMAC digests only, no raw IP/email; verify cleanup metrics | C + implementation |
| Security/request logs | Vercel/Clerk/Supabase/Cloudflare | Abuse prevention, incident response | Provider/product dependent | Minimum period needed for security/operations; document actual plan limits | Provider backups/log systems may not offer record-level deletion | C/D/provider |
| Vercel Web Analytics | Vercel | Aggregate usage measurement | Provider-dependent; exact project setting not certified here | Keep aggregate/minimized analytics; periodically verify configuration | Query/fragment removed client-side; provider retention governs | C/D/provider |
| Browser local/session storage | User device | UI, handoff, preferences, queues | Until cleared, expired, or overwritten | Continue feature-specific expiry and user clearing instructions | User controls browser clearing; app should remove sensitive temporary state on completion/logout | A/B |
| Beta Program records | Supabase | Eligibility, access, audit | No unified public period | While beta is active plus approved audit window | Role/security history may require controlled pseudonymization | C/D |
| Optional AI prompts/chess context | Selected AI provider; page memory for user key | Requested AI feature | Provider-dependent; CAISSA key designed not to persist | Disclose provider choice and retention; do not persist user keys | Provider request logs may exist; provider policy governs | C/D/provider |
| Backups | Supabase and other providers | Recovery | Supabase retention varies by plan; project core data/backups in selected region | Document actual plan before publication; deletion completion must include backup horizon | Per-record immediate deletion may be impossible from backups; access-restrict until expiry | C/D/provider |

## Global exceptions to define

Any final schedule must narrowly define security investigation, fraud/abuse prevention, record integrity, dispute, and legal-hold exceptions. “Legal hold” must not become an indefinite default.

## Required implementation before promising deletion

1. Produce a dry-run inventory tied to the verified Clerk subject/public identity.
2. Define delete versus anonymize per relational dependency.
3. Add dual-control execution and audit logging for destructive actions.
4. Verify private Storage ownership and object lifecycle.
5. Document provider backup and log horizons.
6. Test idempotency, partial failure, rollback/recovery, and preservation exceptions on synthetic data.
