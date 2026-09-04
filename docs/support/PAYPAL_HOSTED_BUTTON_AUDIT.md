# Support CAISSA / PayPal Hosted Button audit

Date: 2026-09-03  
Baseline: `c05f12aa8a6e69ea7cef7bf0ed4147ca620259a9`  
Branch: `work/caissa-ux-navigation-language-s1`

## Existing CAISSA architecture

- Modern first-party standalone pages compose `caissa-i18n.js`, the canonical
  `caissa-primary-navigation.js` inventory, and `caissa-standalone-sidebar.js`.
- The canonical Support navigation currently contains Help and About. The
  smallest change is to insert Support CAISSA before them and give `/support`
  its own active navigation identity.
- Vercel rewrites extensionless first-party routes to static HTML documents.
  The local `server.js` mirrors those route aliases for browser QA.
- `vercel.json` applies a shared CSP to the site, then narrower route-specific
  policies to sensitive surfaces such as Play and PGN Replayer. A later
  `/support` policy can therefore extend PayPal origins for that route without
  granting them to Play, Library, Polyglot, Classic, or any other page.
- Current enabled locales are English, Spanish, and Portuguese with exact
  `607 / 607 / 607` key parity. French, German, Russian, and Hindi remain
  supported internally but disabled.

## PayPal resource verification

- Hosted Button name: Support CAISSA Chess.
- Hosted Button ID: `CV3QSCB3RPGVL`.
- The public PayPal payment resource at
  `https://www.paypal.com/ncp/payment/CV3QSCB3RPGVL` returned HTTP 200 and
  reported the button as active on 2026-09-03.
- Its public metadata confirms USD, customer-set price, no shipping, the
  approved description, and the approved custom label.
- The same public PayPal resource exposes the exact public SDK client
  identifier required by Part 1. It is not an API secret and grants no
  server-side access. No dashboard credential, password, access token,
  sandbox credential, merchant secret, or API Secret is required or retained.
- Part 2 is the official `paypal.HostedButtons({ hostedButtonId })` renderer
  targeting one uniquely named container.

PayPal's official Customer Set Price guide requires one SDK setup script and
one unique renderer per button:
https://developer.paypal.com/upgrade/wps/guide/Customer%20Set%20Price/

## Proposed isolated implementation

1. Add `/support` as a first-party standalone page and canonical Support
   navigation destination.
2. Add shared `support.*` and `nav.item.support` keys to EN, ES, and PT only,
   preserving exact parity and documenting the allowed frozen-PT extension.
3. Load one first-party controller only on `/support`. The controller creates
   the official PayPal SDK script exactly once, calls the official Hosted
   Buttons renderer once, and owns localized loading/failure status.
4. Keep all PayPal code absent from the shared sidebar and global bundles.
   Merely visiting `/play` or any other CAISSA route must produce zero PayPal
   SDK requests and zero PayPal DOM nodes.
5. Keep checkout inside PayPal's controlled iframe/popup boundary. CAISSA will
   not inspect or translate PayPal internals and automation will not submit a
   contribution.

## CSP before and after

Before: the shared CAISSA CSP contains no PayPal origins in `script-src`,
`connect-src`, or `img-src`, and only existing Stripe endpoints in
`frame-src`.

After: only the `/support` response receives an override that retains current
CAISSA sources and adds PayPal's documented hosted-button source families:

- `script-src`: `https://*.paypal.com`, `https://*.paypalobjects.com`
- `connect-src`: `https://*.paypal.com`, `https://*.paypalobjects.com`,
  `https://*.venmo.com`
- `frame-src` and `child-src`: the same three source families
- `img-src`: the same three source families plus the existing `data:` policy
- `style-src`: the same PayPal source families, retaining the existing inline
  style allowance already present in the shared policy
- `form-action`: `https://*.paypal.com` in addition to same-origin

No wildcard `*`, `unsafe-eval`, new global PayPal origin, or relaxed Play/PGN
policy is introduced. PayPal's current official CSP guidance lists these
families and recommends `Cross-Origin-Opener-Policy: same-origin-allow-popups`,
which CAISSA already sends:
https://developer.paypal.com/sdk/js/v5/best-practices/

Network certification will verify the effective deployed policy and record
whether the Hosted Button actually uses each permitted family. The allowlist
remains route-scoped even where PayPal requires a subdomain family rather than
a single hostname.

## Failure and accessibility boundaries

- SDK network failure, missing `paypal.HostedButtons`, rejected render promise,
  and an empty render timeout all fail to a localized, non-blocking status.
- No fake checkout, alternate payment URL, unsafe fallback, or feature gate is
  introduced.
- CAISSA owns the page heading, explanation, optional-support disclaimer,
  labeled payment region, status live region, focus order, and responsive
  containment. PayPal owns all semantics and language inside its component.
- The Hosted Button language and eligible funding methods can vary with PayPal
  cookies, browser locale, region, and buyer eligibility. CAISSA does not
  rewrite that third-party UI.

## Scope exclusions

No Premium entitlement, account state, backend API, webhook, database,
analytics event, secret, transaction automation, production deployment, or
additional language is part of SUP-001 through SUP-006.
