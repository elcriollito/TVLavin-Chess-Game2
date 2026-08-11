# SEC-013 — Supply-chain hardening

## Local containment

This change pins browser-executed dependencies, reduces remote execution, and makes the npm dependency graph reproducible and auditable. It is local only: no deployment, production service, live Clerk/Stripe authority, database, or Vercel configuration was accessed.

The baseline was `42b93cae06877369ab304d103602ca5960013972` on `main`, seven commits ahead of `origin/main` (`0c3c1599ad47aae9477db863146bd3909020355d`) with a clean worktree.

## Dependency inventory and remediation

`package.json` has eight direct runtime dependencies and four direct development dependencies. The lockfile is npm lockfile version 3 and contains 138 package entries (76 production, 60 development, 28 optional, and 4 peer; categories overlap). Registry packages have npm integrity metadata; no Git, HTTP, local-file, link, or non-registry resolved source is present.

The pre-remediation audit reported 0 Critical, 5 High, 1 Moderate, and 0 Low vulnerable package nodes. The final audit reports 0 in every severity. Narrow remediations are:

- `adm-zip` 0.6.0, exact: direct runtime dependency used only by `tools/fetch-pgnmentor.mjs` to unpack public PGNMentor archives. No upload or arbitrary application ZIP path reaches it. A real public archive downloaded and extracted successfully; a later upstream test URL returned 404, unrelated to archive compatibility.
- `sharp` 0.35.3, exact: development/build-chain package.
- `lodash` 4.18.1 override: transitive through `js-dos` / `react-checkbox-tree`.
- `nanoid` 3.3.18 override: transitive through the same path. SEC-005 does not use it and its cryptographic challenge construction is unchanged.
- `qs` 6.15.3 override: transitive through `stripe`; application request parsing semantics are unchanged.
- `undici` 7.29.0 override: transitive development dependency through `cheerio`.

All overrides are exact and API-compatible within the existing dependency paths. They should be removed when their direct parents adopt equivalent patched minimums. Review them at each dependency-update cycle; no advisory exception is currently open.

Install-time execution observed after remediation is limited to Clerk's shared package hooks and the optional `fsevents` package on supported platforms. Package identities and registry origins match the expected official npm packages; no suspicious near-duplicate was introduced.

## Browser executable register

The final executable dependency classes are:

| Component | Loading/provenance | Execution and exposure | Control |
| --- | --- | --- | --- |
| Clerk browser SDK 6.28.1 | Exact jsDelivr URL on four static pages and the shared dynamic loader | Full page JavaScript privileges; may observe auth state | Exact version, SHA-384 SRI, anonymous CORS; no `@latest` |
| Clerk UI 1.30.1 | Exact version from the server-controlled Clerk tenant host on sign-in/sign-up | Full auth-page privileges | Exact version and fixed server-controlled host; dynamic tenant asset does not have stable bytes for repository SRI |
| Microsoft Clarity | Vendor-managed `clarity.ms` loader on consent-eligible pages | DOM/storage/network analytics capability | Fixed project configuration, privacy masking/exclusions, CSP-scoped vendor origin; vendor-managed response cannot use a repository-pinned SRI hash |
| js-dos 8.3.20 | Exact jsDelivr WASM JavaScript URL, lazy DOS feature | Feature-page JavaScript/WASM privileges | Exact version; dynamic feature loader. Future work may vendor the complete licensed runtime after compatibility review |
| chess.js 1.4.0 ESM | Exact jsDelivr ESM import-map URL on endgame pages | Chess-data parsing on those pages | Exact version; import maps do not provide element SRI. Candidate for later local ESM bundling |
| jQuery 3.6.0, chess.js 0.10.3, chessboard.js 1.0.0 | Existing reviewed local vendor assets | Same-origin page privileges | Remote runtime fetch removed; repository provenance/hashes are maintained by `scripts/vendor-play-v2-dependencies.mjs` |
| Stockfish | Existing local worker | Worker scope only | Same-origin Worker retained; no blob or remote Worker source |

There is no browser-loaded Stripe executable in the repository. Checkout remains server-created and redirects to Stripe; SEC-010 semantics are untouched. Official Stripe script/frame origins remain CSP allowances for existing integration boundaries, not runtime script loads.

No external executable runs merely because an unversioned CDN tag moves. The remaining remote static Clerk browser asset uses integrity generated from the exact 6.28.1 bytes. Clerk behavior and SEC-005 identity-authority logic are unchanged; validation is mocked/local, not against live Clerk.

## CSS, fonts, licenses, and rendering inputs

Existing Font Awesome 6.4.0 CSS and Google Fonts stylesheets remain non-executable external inputs on legacy pages. They are versioned/vendor-scoped but do not have repository SRI because their transitive font responses and vendor CSS may change; migration to the existing local Font Awesome asset and local font files is recommended as separate presentation work. Chessboard CSS is local on changed pages. Existing Stockfish licensing/provenance and local vendor provenance files were not altered.

Libraries that parse or render imported chess/HTML-like content remain inputs for SEC-015 active taint testing: chess.js, chessboard.js, PGN ingestion, and any Markdown/HTML rendering paths. This task does not claim SEC-015 completion.

## Controls and policy

`npm run security:dependencies` rejects floating `@latest`/`@next` runtime references, HTTP executable sources, unknown external static scripts, missing Clerk SRI/CORS attributes, invalid lockfile provenance/integrity, and drift from the exact security overrides, then runs npm audit at the High threshold.

Advisory policy:

- Critical: release-blocking unless demonstrably non-applicable.
- High: release-blocking for reachable production or build-chain risk; otherwise requires a documented, expiring exception.
- Moderate: remediate when compatible, otherwise track with reachability evidence.
- Low: track in normal update maintenance.

Any exception must name the package/advisory, dependency path, reachability, rationale, owner, and review/expiry date. Silent ignores are prohibited.

SEC-012 was not weakened: no CSP source was broadened, and the Play Worker remains same-origin. Production deployment and browser verification against two separately authorized isolated Clerk authorities remain outside this task.
