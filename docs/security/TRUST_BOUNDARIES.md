# Trust Boundaries

## Boundaries

1. Browser → Vercel API
   - Inputs: Bearer tokens, profile/library objects, PGN, AI messages, BYO keys, billing selections.
   - Controls: Clerk verification on protected routes, method checks, uneven schemas/limits, wildcard non-credentialed CORS.

2. Vercel API → Supabase
   - Uses a service-role credential and therefore must enforce ownership in application code.
   - Library, wallet and user routes derive identity from the verified Clerk subject. Credit and webhook RPCs have elevated mutation authority.

3. Vercel API → AI providers
   - Shared Together uses a CAISSA-owned secret; BYO uses a user credential.
   - Destinations are immutable and redirects rejected. Anonymous BYO still consumes CAISSA proxy resources.

4. Browser → AI providers
   - `chatStream()` uses fixed provider endpoints and exposes the BYO key to same-origin JS and the chosen provider. No CAISSA SSRF is involved.

5. Stripe → webhook → Supabase
   - Stripe signature is the authentication boundary. Event fulfillment mutates premium and credits. Event idempotency must be atomic before mutation; the current flow is not.

6. Clerk → browser/API
   - Publishable configuration selects the identity instance. Production currently selects a development instance. JWT verification depends on the matching server-side secret.

7. External chess data → browser/parser
   - PGN/FEN, opening shards, Chess.com/Lichess data and FICS messages enter parsers and UI sinks. Resource and output encoding controls are inconsistent.

8. CDN/runtime scripts → origin DOM
   - Clerk, jQuery, chess.js and chessboard.js execute with origin privileges. Clerk is sometimes loaded with a floating `@latest` URL; SRI coverage is incomplete.

9. Browser storage → same-origin scripts
   - Profile compatibility data, preferences and feature flags are writable/readable by any executing same-origin script. They are not authoritative server privilege inputs, but can alter UI and increase impact of XSS.

## Authorization invariants

- Browser `role`, `isPremium`, and `credits` are display/cache values only.
- Server economic/entitlement decisions must use verified Clerk identity and database state.
- Every private object query must include caller ownership.
- Stripe metadata is trusted only after signature verification and must be fulfilled once.
- Request-provided AI endpoints are never authoritative destinations.
