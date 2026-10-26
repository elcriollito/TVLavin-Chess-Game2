# CAISSA Product Compliance Matrix

**Verified:** 2026-10-25 against repository `d7c48e52465b8764d102313c03cf639c38b3db6f` and the production routes noted below.

Status means the product posture observed in source and production; it is not a quality or compliance certification.

## Core products

| Product / route family | Status | Data / external services | Current legal posture | Gate or action |
|---|---|---|---|---|
| Home, About, Help, Blog, Roadmap | PUBLIC | Static content; ordinary hosting logs | No live legal-footer links | Add Privacy, Terms, contact and policy-effective-date links |
| Accounts (`/signin`, `/signup`) | PUBLIC / REGISTRATION PAUSED | Clerk; Supabase account row; Google OAuth | Existing sign-in live; no age gate or legal consent; Clerk under-16 restriction applies | 16+ rule or Clerk-approved VPC; truthful policies; OAuth review |
| Play, Bots, Coach, game replay | PUBLIC | Browser/local game state; optional account data | Ordinary free chess play is not gambling | Keep competition claims accurate; accessibility testing |
| CAISSA Online | PUBLIC / EARLY USE | Public identity, ratings, games, events, presence; Clerk/Supabase | One production profile/ratings/presence record and no completed game population observed | Rules, reporting, retention, fair-play review and appeals before growth |
| CAISSA Classic | PUBLIC | Browser game state; FICS/room surfaces | Some community-facing room/chat UI is inert | Do not advertise unavailable moderation/community features |
| FICS gateway | PUBLIC | Browser WebSocket to Cloudflare and plaintext TCP to FICS | External network terms/privacy and message handling require notice | Document provider role, retention and acceptable-use expectations |
| Puzzles / progress | PUBLIC | Puzzle attempts/progress; Lichess CC0 puzzle data | CC0 provenance is strong; account progress is personal data | Preserve attribution/provenance; include deletion/export runbook |
| Opening Trainer / Explorer / Database / ECO | PUBLIC | Repertoires, FEN/PGN, external/static data | User-created repertoire privacy; data provenance varies | Maintain source/license register and owner-bound access |
| Endgame Trainer / Library / Tablebase | PUBLIC / MIXED | Positions, tablebase calls, local/static assets | Library is described as under construction | Avoid completeness claims; confirm tablebase data/license provenance |
| Analyze / Engine Arena | PUBLIC | Local engine inputs/outputs; optional account state | Chess engines are not generative AI; GPL distribution obligations apply | Corresponding source/notices; label engine limitations |
| PGN Reader / Player collections / Vault | PUBLIC / MIXED | PGNs, catalogs, R2 downloads | 82 player albums; none certified for paid commercial delivery | Keep commerce off; rights review per collection |
| Polyglot book builder | PUBLIC | User PGN submitted to server function | High-cost anonymous parsing uses instance-local limit | Distributed limiter, smaller bounds, retention/log notice |
| Scanner public beta | PUBLIC BETA | Board pixels for inference; authenticated feedback/images optional | Recognition live; public feedback dataset empty; policy/retention incomplete | Keep raw/unverified label; gate image intake/training governance |
| Scanner private beta | PRIVATE BETA / HISTORICAL DATA | Private images, predictions, feedback, corrections | 96 objects and associated historical records remain | Retention/deletion owner runbook; rights proof; no new training use |
| Beta Tester Program | PRIVATE / FEATURE-GATED | Account role/entitlement | Database-backed authorization exists | Publish beta terms/confidentiality and deletion expectations before reopening |
| Insights / reports | PUBLIC / ACCOUNT FEATURE | Uploaded/derived analysis reports | Report-specific deletion exists; no account-wide export/deletion | Privacy notice; account lifecycle workflow |
| Mentor / Academy | DEVELOPMENT / MIXED | Shared or BYO AI prompts/results; catalog UI | Academy is mostly catalog/visual beta; shared AI live state not proven | AI disclosure, provider notice, prompt rules, retention, activation approval |
| Chess TV, Lichess TV, live blitz/tournaments | PUBLIC AGGREGATION | External streams/links | Third-party service terms and trademarks apply | Accurate source labels; no implied affiliation; captions review |
| Cheater Insight / fair-play tooling | PUBLIC TOOL / NOT AN ENFORCEMENT SYSTEM | User-supplied chess data, analytical output | Defamation and due-process risk if used for public accusations | No public accusation; human review, private evidence, appeal policy |
| GIF maker / visualization tools | PUBLIC | User PGN/FEN; generated media | User warrants input rights; output ownership should be explained | Terms and copyright/takedown process |
| DOS Chess | PUBLIC WEB EMULATION | js-dos runtime; bundled game/assets | GPL/source/notice and game-content rights need confirmation | Close js-dos version/notice/source gap and game-rights record |
| Support | PUBLIC / ACTIVE PAYMENT | PayPal hosted contribution flow | Current payment feature, although no subscriptions/revenue reported | Non-charitable/no-benefit disclosure; PayPal and tax review |
| Premium | PUBLIC MARKETING / COMING SOON | No active subscription observed | Legacy paid markup is replaced in current JS | Keep sales disabled until commercialization gate passes |
| Credit store | DORMANT / AUTH-PROTECTED | Stripe code, credit ledger, offers | No Stripe events observed; activation can occur through env configuration | Explicit kill switch and launch review; consumer/tax/refund terms |
| Community forums / broad chat / DMs | PLANNED | Future UGC, communications, moderation data | Not a current public product | Community, DMCA, CSAM, privacy and communications-law gates |
| Desktop/mobile native application | NOT FOUND / PLANNED AT MOST | None verified | Web app and DOS emulation are not native distribution | App-store, code signing, update, telemetry and license review if built |
| Market Reader | OUT OF SCOPE | Separate worktree/branch | Explicitly excluded | No changes made |

## Supporting route inventory

The repository route contract reports 76 destinations: 40 primary navigation entries, 36 internal primary pages, 16 additional public destinations, 4 external destinations, 15 redirects and 5 protected route families. Routes are not equivalent to independently complete products. “PUBLIC” means reachable, not mature, marketed, accessible, secure or legally approved.

External destinations include feedback email, Facebook, YouTube and Discord. Review each link's current ownership and do not imply endorsement or affiliation.

Protected families include player/beta routes and beta APIs. Protection is primarily server-side Clerk verification and database-backed role/experiment authorization.

## Cross-product obligations

| Control | Applies now | Future trigger |
|---|---|---|
| Accurate Privacy Policy and Terms | Accounts, uploads, Online, logs, PayPal support | Any new data or payment feature |
| Account age rule | Existing and future account access | Under-16/under-13 support |
| Data subject/request runbook | All account and upload data | Self-service account center |
| Open-source notices/source | Distributed engines, libraries and web assets | Desktop/native distribution, paid delivery |
| Incident response | Clerk, Supabase, Vercel, Cloudflare, providers | Larger user base or regulated expansion |
| Community rules/moderation | Public identity and Online fair play | Forums, chat, DMs, tournaments |
| Consumer disclosures | Live PayPal contribution | Premium, subscriptions, credits, recurring support |
| AI transparency | Any live generative Mentor interaction | EU offering, human-like companion functions |
| Accessibility program | Public website | Government/education contracts, native apps, commercial scale |

## Classification rules

- **CURRENT REQUIRED:** supported present legal or provider-contract duty.
- **CURRENT RISK / REVIEW:** plausible present duty or liability requiring factual/legal clarification.
- **FUTURE ACTIVATION GATE:** must be completed before a planned feature launches.
- **BEST PRACTICE:** risk-reducing control not established here as legally mandatory.
- **NOT APPLICABLE:** reasoned exclusion on present facts.
- **UNKNOWN:** evidence is insufficient; do not silently convert it into approval.

