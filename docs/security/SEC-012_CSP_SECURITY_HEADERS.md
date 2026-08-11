# SEC-012 — CSP and security-header hardening

Status: **REMEDIATED LOCALLY**. Production deployment and verification are not part of this change.

## Authoritative policy

`vercel.json` is the deployment-level authority. Its global `/(.*)` rule establishes the baseline. The later `/play` rules intentionally retain Play V2's stricter CSP; `middleware.js` retains equivalent Play protection. Legacy HTML meta policies remain defense-in-depth for non-Vercel/local serving, but cannot relax the response header.

| Control | Local policy | Rationale |
| --- | --- | --- |
| CSP | Global; stricter on Play | Deny by default; explicit dependencies only |
| HSTS | `max-age=31536000` | No unreviewed subdomain or preload commitment |
| nosniff | `nosniff` | Prevent MIME confusion |
| Referrer-Policy | `no-referrer` | Avoid query/path leakage |
| Permissions-Policy | camera, microphone, geolocation, payment, USB, serial and HID disabled | No current application use |
| frame ancestors / XFO | `'self'` / `SAMEORIGIN`; Play uses `'none'` | Consistent clickjacking defense |
| COOP | `same-origin-allow-popups` | Preserve OAuth popup communication |
| CORP | `same-site` | Protect resources without blocking CAISSA subdomains |
| COEP | intentionally omitted | Cross-origin isolation is not required or proven compatible |

## CSP dependency inventory

- Scripts: self plus currently used jQuery, cdnjs, jsDelivr, Clerk/challenge and Clarity origins. `unsafe-eval` is absent. Legacy pages still require inline scripts; Play permits only self-hosted scripts.
- Styles/fonts: self plus observed CDN and Google Fonts origins. Legacy inline styles remain allowed.
- Images: self/data/blob plus observed Clerk, CDN/chessboard and Clarity/Bing origins. Image `blob:` is not Worker permission.
- Connections: observed chess.com, Lichess, CAISSA worker, FICS WebSocket, Clerk/Clarity and direct-browser BYO provider APIs only.
- Workers: `'self'` only. Frames: self plus explicit Clerk/challenge and Stripe origins.
- Objects are denied, base is self and forms are self.

Vendor-scoped Clerk and Clarity subdomain patterns remain because those services select tenant/collection hosts. There is no universal source wildcard and no arbitrary script, connection, frame or Worker source. External runtime scripts remain SEC-013 supply-chain debt.

Static tests cover required headers, negative sources and Play's stricter contract. Existing local suites cover application compatibility. No live Clerk, Stripe, provider, Vercel or production endpoint is contacted; real OAuth popup, hosted Checkout and deployed-header behavior require separately authorized test-environment verification.

Rollback is a revert of the single local platform-security commit. HSTS preload and `includeSubDomains` were deliberately not selected.

## Regression baseline repair

The Play compatibility harness still targeted `/?section=play` and configured the retired `internal` beta stage. It now verifies the intentional redirect to authoritative `/play`, runs the current `public-beta` gate, and checks the route CSP in Chromium and WebKit. Its `eval`-based idempotency probe was replaced by a normal same-origin script reload; no CSP exception or production test hook was added. The harness also monitors `securitypolicyviolation` events.

The official Play V2 marker intentionally denies the legacy active-game Analyze handoff, so that case now verifies fail-closed behavior and unchanged game state. Current navigation uses canonical links; section-state testing uses the existing navigation API rather than retired `data-section` buttons.

The Endgame failure was a stale group index: Endgame Practice remains exactly once in the current Learn & Improve group. Yahoo Classic exposed one genuine middleware ordering defect: the general root-to-Play redirect ran before the supported `?section=yahooClassic` redirect. The exact Yahoo redirect now runs first; other legacy root states intentionally consolidate to `/play`. Static navigation expectations were updated to the current middleware matcher.

Final evidence: Chromium 7/7, WebKit 7/7, platform policy 14/14, Endgame 4/4, Yahoo/middleware 8/8, relevant Play/Worker 88/88, and repository top-level regression 356/356. No unexpected CSP violation was observed.
