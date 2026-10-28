# CAISSA privacy data lifecycle

Status: `VERIFIED` from repository/schema evidence; runtime provider settings, platform logs, backups, and private records were not inspected. The controller description remains the individual operating the personal CAISSA Chess project; no company or nonprofit is asserted. Contact: `privacy@caissa-chess.org`.

| Flow | Data/purpose/authentication | Location/processors and controls | Retention/deletion reality | Evidence |
|---|---|---|---|---|
| Account identity | Clerk subject, email/profile/session for sign-in and account continuity; authenticated | Clerk plus Supabase user/identity bindings; server JWT verification and owner checks | No verified account-wide export/deletion orchestrator; Clerk and Supabase actions must be coordinated | `api/_lib/clerk-auth.js`, identity migrations/APIs |
| Public identity/Online | Nickname, rating, presence, challenges, games/events for multiplayer; guest or account | Supabase/Postgres/Realtime; projections and participant ownership | Feature records exist; no approved account/guest retention schedule | `api/online.js`, `api/_lib/online-*`, Online migrations |
| Puzzles | Attempts, progress and sync metadata; account | Supabase through account-bound API | No approved schedule or account-wide erasure | `api/puzzles/progress.js`, puzzle migrations |
| Library/PGN | User-created positions, collections and imported chess content; local or account | Browser and Supabase owner-bound APIs | Per-item actions/local export exist; full-account workflow absent | library APIs and Supabase migrations |
| Opening Trainer | Repertoire/progress; local or account | Browser plus Supabase owner-bound APIs | Feature-level operations; no global lifecycle | `api/opening-trainer/repertoires.js` |
| Scanner ordinary recognition | Source image/derived 512x512 input for requested inference; guest/account | Vercel function and local ONNX runtime | Season 2 client no longer persists an anonymous scan merely to recognize; request/provider logs remain unverified | `scanner/public/scanner-public-client.js`, `api/scanner/public/recognize.js` |
| Scanner correction feedback | FEN/prediction/correction, model/localizer versions, hash, limited context; now account required for persistence | Private Supabase tables; server-only service role and ownership checks | Raw/certification history is append-oriented; no approved deletion schedule | `api/_lib/scanner-public-service.js`, prior Scanner migration |
| Scanner optional source image | JPEG/PNG/WebP, hash, size/type, purpose/consent/right evidence; authenticated | Private Supabase Storage plus new grant table; server-issued object key; no public URL | Expiry is configurable for unbound grants; final retention duration and destructive cleanup remain unapproved | Season 2 migration, image-consent/image endpoints |
| Scanner training permission | Separate future permission and lineage | New private table; trigger blocks `training_eligible` without an active separate permission | Inactive; no UI or grant path intentionally provided | `scanner_public_training_permissions`, `scanner_training_permission_gate` |
| Mentor/local engines | Local Stockfish/Fairy-Stockfish positions stay in browser unless saved; optional generative Mentor may send prompts/chess context | Local Worker or Vercel proxy and selected external AI provider | Local analysis is ephemeral by default. Deployed AI provider/model/retention/training settings remain unverified | engine workers; Mentor provider code and Legal Season 1 AI review |
| Analytics | Aggregate route/use data; optional Clarity consent | Vercel Analytics, and Microsoft Clarity only through existing gate | Provider settings/log retention not inspected. Play event foundations intentionally have no transport or persistence | `js/caissa-vercel-analytics.js`, `js/caissa-clarity.js`, Play analytics audits |
| Operational/security logs | IP/request metadata, error/security events for operations/abuse | Vercel, Cloudflare, Supabase and selected providers | Log drains/access/retention unknown; raw bodies/images/prompts should not be logged | platform configuration and server code only |
| Payments/entitlements | Historical provider/accounting data if it exists; dormant Stripe metadata | PayPal retired from product; Stripe code remains but production activation is unverified | Preserve any real tax/refund/dispute records under counsel-approved criteria; transactions were not inspected | current main, prior PayPal release evidence, Stripe code |
| Browser data | Language, UI state, local chess/library data, consent/preferences | localStorage/sessionStorage/IndexedDB on user device | User/browser-controlled unless separately synchronized | client storage code |
| Backups/exports/support | Provider backups, governed exports, privacy/support correspondence | Supabase/platform/provider and operator mailbox | Backup deletion propagation, mail retention, and processor restore behavior unverified | configuration/docs only; no private data inspected |

## Governing distinctions

- Ordinary recognition is requested processing, not feedback, image sharing, certification, or training permission.
- Correction permission and source-image permission are separate. Source rights are a further required attestation, not a substitute for consent.
- Review eligibility is not training eligibility. Training requires a separately versioned future permission, human governance, dataset lineage, and release approval.
- Immutable/audit-integrity designs do not erase legal rights. Counsel must decide whether deletion, anonymization, restricted retention, or a legal hold applies category by category.

## Unverified matters

No live database, Storage object, backup, private account, transaction, provider dashboard, log drain, AI prompt/result, or mail record was inspected in Season 2. The earlier audit's point-in-time counts were not re-queried and must not be treated as current. No legal retention period is invented here.

