# Attack Surface

Baseline: `6bcec62d5bb9306313ddf889198d98f1579ae37a`

## Inventory counts

- API routes: 12
- Authenticated-only routes: 7
- Public-only routes: 3
- Mixed authenticated/anonymous route: 1
- Privileged third-party webhook: 1
- Third-party service families: 10 (Clerk, Supabase, Stripe, Together, OpenAI, Anthropic, Llama, Microsoft Clarity/Bing, Chess.com/Lichess, CAISSA Cloudflare/FICS services)
- Statically named browser-storage keys: 9, plus dynamically constructed module/feature keys
- Outbound server fetch call sites: 4, all in Mentor implementations and mapped to fixed provider registries
- Unique external script URLs in root HTML: 4

## Server/API

| Route | Access | Untrusted input | Sensitive action |
| --- | --- | --- | --- |
| `POST /api/checkout/session` | Clerk Bearer | package/plan, proxy headers | Creates Stripe Checkout session. |
| `POST /api/credits/add` | Public | JSON | Disabled; always denies grants. |
| `POST /api/credits/consume` | Clerk Bearer | feature | Atomic credit deduction RPC. |
| `GET /api/library/pull` | Clerk Bearer | `since` | Reads caller-owned library records. |
| `POST /api/library/push` | Clerk Bearer | positions/collections/deletions | Writes caller-owned library records. |
| `POST /api/library/delete` | Clerk Bearer | item identifiers/types | Deletes caller-owned records. |
| `POST /api/mentor/chat` | Mixed | provider/key/messages/model/tokens/temp | Calls fixed LLM provider; shared mode uses CAISSA key and credits. |
| `POST /api/polyglot/build` | Public | PGN/filename/options | CPU/memory-intensive book generation. |
| `GET /api/public-auth-config` | Public | none | Returns publishable Clerk config and capability boolean. |
| `POST /api/stripe/webhook` | Stripe signature | signed Stripe event | Premium/credit fulfillment. |
| `POST /api/user/sync` | Clerk Bearer | email | Creates/updates caller user row. |
| `GET /api/wallet` | Clerk Bearer | none | Returns caller credits/role/premium. |

## Client surfaces

- Public: Play, Academy, Analyze, openings/database, Endgame, Vault, DOS games, FICS/spectator, auth and premium pages.
- Authenticated: wallet, checkout, cloud library synchronization, default shared Mentor.
- Browser storage: profile compatibility cache, feature flags/beta opt-in, navigation, arena engines, FICS sound preference, debug switches, and dynamic learning/library keys.
- AI: prompt/FEN/PGN/engine context crosses browser-to-CAISSA and then CAISSA-to-provider. BYO streaming can cross browser-to-provider directly.
- Imports: PGN/FEN, cloud library JSON-like structures, Chess.com/Lichess-derived game data, opening database shards, and FICS messages.

## Privileged and legacy

- Privileged: server-held Clerk, Supabase service-role, Stripe, webhook and Together credentials; Stripe webhook; database RPCs.
- Legacy runtime: `server.js` exposes health, Lichess game fetch and secured fixed-destination Mentor routing when run with `npm start`. It is committed but not the current Vercel API runtime.
- Tooling: archive/PGN download and build scripts, opening database uploaders, IndexNow submission, and local FICS gateway. These are not normal browser APIs but process external data or credentials during operations.
