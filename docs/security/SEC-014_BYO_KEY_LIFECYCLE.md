# SEC-014 — BYO key lifecycle

## Containment model

BYO provider credentials now have one lexical, module-private reference in `llm-provider.js`. They are absent from the public `config` object; `getConfig()` exposes only `hasApiKey`. Initialization allowlists non-secret configuration fields, so an `apiKey` option cannot accidentally become public configuration.

The password field is cleared immediately after capture and uses `autocomplete="new-password"`, `spellcheck="false"`, and `autocapitalize="none"`. Provider/model preferences may remain in `localStorage`, but credentials do not enter localStorage, sessionStorage, IndexedDB, cookies, URLs, history, attributes, analytics, or error output. A full reload creates a fresh module with no key.

Reachable references are cleared on:

- provider change;
- explicit Clear key action or `clearApiKey()`;
- invalid/oversized credential input;
- failed `testConnection()`;
- sign-out before the Clerk operation;
- authoritative auth/session/account-change events;
- `pagehide`, including BFCache transitions;
- disabling BYO during Mentor initialization.

JavaScript cannot guarantee physical memory zeroization. This control removes application-reachable references and minimizes lifetime; any JavaScript already executing in the same page context could theoretically inspect a secret while it is actively being used.

## Request boundaries

Proxied BYO uses only the same-origin `/api/mentor/chat` route. The server accepts a maximum 512-character key, does not store or log it, sends it only to a fixed provider allowlist, rejects redirects, and applies `Cache-Control: no-store`. Direct streaming similarly resolves the endpoint from the fixed provider record; custom endpoints remain disabled. Errors are generic and do not log error objects that could contain credential material.

Clerk tokens remain obtained independently through `CAISSA_AUTH.getToken()` and are never stored in the BYO credential location.

## Same-page execution exposure

The classic Mentor page contains repository-local application scripts plus the pinned Clerk browser SDK when auth configuration enables it. The consent-gated Clarity loader can execute only on its eligible production host. js-dos and other feature loaders are not needed for Mentor but remain page-local lazy capabilities. SEC-013 pinning/SRI/local vendoring reduces drift; SEC-015 prevents attacker-controlled content from becoming script. No third-party script is given the key intentionally.

Synthetic tests use sentinel credentials only. No real AI, Clerk, Stripe, database, or production credential was used.
