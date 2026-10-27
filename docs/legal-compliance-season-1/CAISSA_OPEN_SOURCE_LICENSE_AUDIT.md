# CAISSA Open-Source and Content License Audit

**Verified:** 2026-10-26 against `main` `6e912be5c314080be8944efde261b8dc133452a6`.

## Decision

The repository has meaningful component-level notices and provenance, but it is not yet governed as one distributable product. `package.json` declares MIT while no root `LICENSE` exists; notices are not consolidated; some conveyed engine/runtime binaries need exact source/build mapping; and PGN, screenshot and media collections are not universally certified for redistribution or paid use.

## Findings

### IP-001 - Original CAISSA source license is unresolved

The package metadata says MIT, but there is no root license identifying the copyright holder/year and licensed scope. The owner must choose the intended license and public identity. Do not invent a legal name. Until resolved, do not imply every repository file is MIT.

### IP-002 - GPL engine correspondence must be exact

Stockfish 18/19, LC0/Maia, Fairy-Stockfish, GNU Chess and other GPL artifacts require the license, copyright notices and version-matched corresponding source/build information when conveyed. Stockfish 19 and LC0 evidence is comparatively strong; Stockfish 18 and Fairy-Stockfish need exact artifact/hash/source confirmation. Disabling an engine in UI does not end conveyance if its public binary remains downloadable.

### IP-003 - js-dos and bundled game/runtime drift

Source references a CDN js-dos version that differs from the lockfile version, while GPL and bundled DOS-game obligations depend on what users actually receive. Reconcile the delivered version and provide the applicable license/source directions. Counsel should review combined-work questions before native bundling.

### IP-004 - Data, screenshots and media rights are collection-specific

Lichess database exports are CC0 and are strong provenance for the puzzle data, but this does not license every Lichess/Chess.com screenshot, broadcast, brand, PGN collection, book or tablebase. Eighty-two PGN albums were inventoried and none was certified for paid commercial delivery. Scanner platform screenshots and user images require record-level rights/purpose controls.

## Direct dependency posture

The historical locked inventory contained 186 packages, primarily MIT/Apache/BSD/ISC plus GPL/MPL/LGPL-family and uncommon expressions. Important direct components include Clerk backend (MIT), Supabase JS (MIT), Vercel Functions (Apache-2.0), chess.js (BSD-2-Clause), chess-openings (WTFPL), js-dos (GPL-2.0), onnxruntime-node (MIT), Stripe (MIT) and ws (MIT). Provider terms/DPAs are separate from package licenses.

The existing dependency security command previously passed repository inventory policy but reported six npm advisories (one moderate, five high) in transitive chains. This audit did not upgrade dependencies or determine exploitability; see DEP-001 in the security review.

## Scanner piece sets

The catalog contains 13 sets: 11 allowed/training-eligible and 2 reference-only. `caissa-current-wikipedia-unverified` and `historical-replit-geometric-reference` must remain excluded. Keep exact source, creator, license, notice, hash and permitted-purpose metadata; fail closed on missing information.

## Required remediation

1. Owner selects the license for original CAISSA code and the copyright-holder identity; add or correct the root license only in a separately approved task.
2. Create consolidated `THIRD_PARTY_NOTICES` with component, exact version/hash, license, source, modifications and corresponding-source location.
3. Close Stockfish 18/Fairy-Stockfish/js-dos provenance gaps and place clear source directions next to downloadable object code.
4. Keep paid PGN/media/data delivery disabled until collection-level rights certification.
5. Maintain a takedown channel and decide with counsel whether a DMCA agent/repeat-infringer process is proportionate.
6. CI should fail on missing license metadata, version/hash drift or absent corresponding-source links.

## Trademark

CAISSA Chess should receive a professional clearance search before monetization, merchandise, app-store launch or filing. Provider/platform names must be accurate nominative references without implied sponsorship. A Florida fictitious-name filing would not create trademark rights.

## Primary sources

- [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)
- [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html)
- [Lichess open database / CC0 statement](https://database.lichess.org/)
- [U.S. Copyright Office section 512 resources](https://www.copyright.gov/512/)
- [DMCA designated agent directory](https://www.copyright.gov/dmca-directory/)

