# CAISSA Open-Source and Content License Audit

**Verified:** 2026-10-25  
**Baseline:** `d7c48e52465b8764d102313c03cf639c38b3db6f`

## Decision

The project contains substantial open-source provenance and several good component-level notices, but it is not distribution-ready as a single governed product. The repository declares `MIT` in `package.json` without a root `LICENSE`; Fairy-Stockfish distribution lacks exact-version/corresponding-source evidence; js-dos CDN and lockfile versions differ; and third-party notices are not consolidated. No paid PGN collection is rights-certified.

## npm inventory

The locked dependency set contained 186 packages. Detected license expressions included 114 MIT, 25 Apache-2.0, 12 BSD-2-Clause, 2 BSD-3-Clause, 12 ISC, 1 0BSD, 1 Unlicense, 1 WTFPL, 2 MPL-family entries, a GPL-2.0 js-dos package, LGPL platform packages associated with Sharp/libvips, and combined expressions.

### Direct runtime packages

| Package | Locked version | License | Action |
|---|---:|---|---|
| `@clerk/backend` | 2.33.8 | MIT | Retain notice |
| `@supabase/supabase-js` | 2.118.x | MIT | Retain notice; provider terms/DPA are separate |
| `@vercel/functions` | 3.9.9 | Apache-2.0 | Retain license/notice |
| `adm-zip` | 0.6.1 | MIT | Retain notice |
| `chess-openings` | 0.1.1 | WTFPL | Preserve exact license text; assess suitability |
| `chess.js` | 1.4.x | BSD-2-Clause | Preserve copyright/conditions/disclaimer |
| `js-dos` | 8.5.3 in lockfile; 8.3.20 loaded by CDN | GPL-2.0 | Reconcile version; provide license and corresponding-source path for distributed/conveyed artifacts |
| `onnxruntime-node` | 1.30.x | MIT | Retain notice |
| `qrcode` | locked runtime version | MIT | Retain notice |
| `stripe` | 20.4.1 | MIT | Retain notice; Stripe contract is separate |
| `ws` | 8.22.x | MIT | Retain notice |

Development-only MPL and LGPL dependencies still require notices when their covered code/binaries are distributed in outputs. Build-only use does not automatically place CAISSA code under those licenses.

## Engines and binaries

| Component | Observed posture | Finding | Required action |
|---|---|---|---|
| Stockfish 18/19 | Local GPLv3 license/provenance and hashes | Generally strong provenance; distribution still needs corresponding source and notices for exact binary | Keep source offer/link exact, durable and version-matched; preserve modification/build information |
| Legacy Stockfish package | Exact package/version/upstream notice | Stronger than generic attribution | Retain in consolidated notice |
| LC0 | GPL license and exact corresponding-source evidence | Strong | Verify every shipped binary/hash remains paired with source |
| Fairy-Stockfish | Local binary, version recorded as unknown, generic upstream/source link | **Gap:** exact binary/version/build and exact corresponding source are not established | Do not redistribute further until mapped to exact source and build; preserve GPL text |
| GNU Chess / DOS game | GPLv3 binary/game with local license | Source/content bundle needs exact-version and source confirmation | Verify executable, game assets and source correspondence |
| Arasan, Rodent, Texel | Placeholder directories; binaries disabled/absent | No current binary-distribution issue established | Re-audit before enabling or adding binaries |

GPL obligations are distribution obligations, not a ban on use or commercial use. Linking and derivative-work questions depend on architecture and should receive counsel review before native bundling.

## Data, media and content

| Asset | Status | Finding / gate |
|---|---|---|
| Lichess puzzle dataset | CC0 | Strong basis; preserve provenance even where attribution is not required |
| Lichess open datasets generally | Only puzzle data was found downloaded | Do not imply all Lichess data is present or under one license |
| PGN player collections | 82 albums; 0 certified for paid commercial delivery | Keep free/noncommercial posture; per-source rights review before premium/download sale |
| Opening databases/books | Mixed repository/R2/static sources | Maintain origin, license, version and hash per artifact |
| Endgame tablebases | Used/referenced by tools | Confirm exact dataset/API terms and redistribution method |
| Piece sets and board themes | Scanner catalog has item-level records | Keep attribution/source/license with each set; do not promote unverified sets to training/distribution |
| Platform screenshots in Scanner development corpus | Images from chess platforms with “user-provided internal research” rights status | Ownership, consent and platform-terms proof is thin; do not expand training or redistribute without a documented rights determination |
| Broadcast/TV content | External streams/links | Link/embedding terms and trademark/source labels apply; no implied affiliation |
| User-submitted Scanner images | Private evidence | Obtain contributor rights/license and purpose-specific consent; implement takedown/deletion process |
| Generated GIF/media | User-supplied chess input | Terms should allocate input rights and explain output rights/limits |

## Scanner piece-set catalog

The catalog contained 13 sets: 11 marked training-eligible/allowed and 2 reference-only. Recorded licenses included Apache-2.0, CC BY 4.0, CC0, MIT, public-domain material and CAISSA-authored work. Two unverified sets were appropriately reference-only. Checksums and notices are good controls; eligibility must remain fail-closed when source, license or attribution is incomplete.

## Trademark and brand

- “CAISSA Chess” use may create common-law naming issues even without a registration. Run a professional clearance search before commercialization, merchandise, app-store distribution or a fictitious-name filing.
- Third-party names such as Stockfish, Lichess, Chess.com, Google, Clerk, Supabase, Vercel and PayPal should be nominative, accurate and not imply sponsorship.
- A Florida fictitious-name filing does not create trademark rights.

## Required remediation

### P0/P1

1. Decide and document the license for original CAISSA source. If MIT is intended, add the complete root license with the correct copyright holder/year; otherwise remove the unsupported package declaration and document the actual rights posture.
2. Create `THIRD_PARTY_NOTICES` with exact component, version, license, copyright, source URL and corresponding-source location.
3. Resolve Fairy-Stockfish version/hash/build/source before further distribution.
4. Reconcile js-dos 8.3.20 CDN delivery with 8.5.3 lockfile and satisfy the distributed version's GPL obligations.
5. Make license/notice/source links available with downloadable engine/software artifacts.
6. Keep paid PGN delivery, paid books and commercial dataset reuse disabled until collection-level certification is complete.
7. Create a takedown channel. Decide whether to register a DMCA agent after reviewing the identity/address consequences and repeat-infringer process.

### Release acceptance criteria

- Every shipped binary has an exact hash, version, license, source and build/provenance record.
- Every attribution-required asset renders its required credit in an appropriate location.
- No `unverified` or `reference-only` Scanner asset enters training or redistributed output.
- No catalog entry marked noncommercial or uncertified is included in a paid offering.
- CI fails on missing license metadata, version drift or absent corresponding-source link.

## Security-adjacent dependency status

`npm run security:dependencies` passed the repository supply-chain policy inventory but reported six npm audit advisories: one moderate and five high, principally through `undici`/`cheerio` and `zod`/Vercel OIDC dependency chains. This audit did not update packages because it was documentation-only. Dependency vulnerabilities are not license violations, but they affect release governance.

