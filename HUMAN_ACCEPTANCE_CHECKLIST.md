# Human Acceptance Checklist

Record only `PASS`, `FAIL`, `BLOCKED`, or `NOT TESTED`.

## Local startup

From the repository root:

```powershell
npm install
npm start
```

The local test origin is `http://127.0.0.1:8000`. Production must remain locked while this checklist is open.

Primary acceptance URLs:

- Downloads: `http://127.0.0.1:8000/downloads`
- Browser converter: `http://127.0.0.1:8000/tools/polyglot`
- Opening Database V2.4: `http://127.0.0.1:8000/opening-database`
- ECO catalogue: `http://127.0.0.1:8000/eco`
- Retired build API: `http://127.0.0.1:8000/api/polyglot/build`
- Legacy vault redirect: `http://127.0.0.1:8000/vault`

| ID | Check | Status | Notes |
|---|---|---|---|
| HQA-01 | Downloads desktop: layout, text, current/future product states, exact v0.2.0 checksum | NOT TESTED | |
| HQA-02 | Downloads mobile: 320 px navigation, cards, FAQ, no horizontal overflow | NOT TESTED | |
| HQA-03 | Online converter: choose a small PGN, observe local progress, download valid BIN | NOT TESTED | Verify DevTools shows no `/api/polyglot/build` request |
| HQA-04 | Large PGN conversion: supported input completes; cancel produces no output | NOT TESTED | Do not exceed 25 MiB online ceiling |
| HQA-05 | Portable application startup | NOT TESTED | Existing unsigned v0.2.0 only; certification pending |
| HQA-06 | Portable large-file test | NOT TESTED | Compare with recorded 25/50 MiB evidence |
| HQA-07 | BIN interoperability | NOT TESTED | Open output with an independent Polyglot reader and verify legal moves |
| HQA-08 | SHA-256 verification | NOT TESTED | `Get-FileHash -Algorithm SHA256` must match manifest |
| HQA-09 | VirusTotal report | BLOCKED | No indexed report; no upload performed |
| HQA-10 | Final owner approval of exact candidate commit | NOT TESTED | Required before merge/deploy/publish |
| HQA-11 | Exact staged Vercel inventory | NOT TESTED | Run `npm run release:public:verify-vercel`; require exact manifest parity and repository-root block |
| HQA-12 | Opening Database V2.4 | NOT TESTED | Explorer, Analysis, Games and Moves tabs work; metadata-only games remain honest; Stockfish 19 Lite and Quiet Drag load |
| HQA-13 | ECO and legacy database routing | NOT TESTED | `/eco` and `/eco/A00` load; `/database` redirects to `/eco`; `/database/eco/A00` redirects to `/eco/A00` |
| HQA-14 | Retired server converter | NOT TESTED | GET returns `405` and POST returns `410`; no build, storage or download side effect |
| HQA-15 | Accessibility and responsive checks | NOT TESTED | Keyboard-only navigation, visible focus, 200% zoom, 320 px width and screen-reader labels are usable |
| HQA-16 | SEO and public routing | NOT TESTED | Canonicals, sitemap entries and public navigation expose `/downloads`, `/tools/polyglot`, `/opening-database` and `/eco` correctly |

Also verify keyboard navigation, EN/ES/PT switching, Chrome, Edge, Firefox, mobile viewport behavior, legacy `/vault` redirect, and that future products have no download links.

## Expected outcomes

- `/vault`, `/vault/` and `/vault.html` issue a permanent redirect to `/downloads`.
- The downloads page labels only the existing unsigned portable v0.2.0 artifact as available; future products have no live download link.
- The browser converter accepts a supported PGN, reports local progress and downloads a deterministic `.bin` without requesting `/api/polyglot/build`.
- The retired build endpoint returns `410 Gone` for POST, rejects unsupported methods with `405`, and never processes a request body.
- Opening Database V2.4 preserves the latest production explorer, engine sorting, Moves review, metadata-only disclosure and ECO navigation.
- Public staging contains exactly the paths and SHA-256 digests in `PUBLIC_RELEASE_ARTIFACT_MANIFEST.json`, with no repository metadata or release-only evidence.
- Portable publication stays independently blocked until provenance, signing, malware-review and human acceptance requirements are satisfied.

## Reproducible verification commands

```powershell
npm run test:caissa-downloads-polyglot
npm run test:caissa-downloads-polyglot:browser
node --test tests/opening-database-v2-shell.test.js tests/opening-database-data-parity.test.js tests/opening-database-quiet-drag.test.js tests/eco-seo.test.js tests/blog-foundation.test.js tests/accessibility-season-001b.test.js
npx playwright test tests/browser/opening-database-v2.spec.js tests/browser/opening-database-sort-mode.spec.js tests/browser/opening-database-tab-init-race.spec.js tests/browser/opening-database-mobile-ux.spec.js --project=chromium
npm run test:home
npm run test:home:browser
npm run release:public:audit
npm run release:public:verify-vercel
```

For the retired endpoint while the local server is running:

```powershell
curl.exe -i http://127.0.0.1:8000/api/polyglot/build
curl.exe -i -X POST -H "Content-Type: application/json" --data "{}" http://127.0.0.1:8000/api/polyglot/build
```

GET must return `405` and POST must return `410`. Do not upload a binary or deploy from this checklist.
