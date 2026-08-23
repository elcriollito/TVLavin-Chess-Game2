# CAISSA player-album commercial-rights audit

Review date: 2026-08-23  
Catalog: 82 privately stored player PGN albums
Decision: **0 of 82 albums are certified for paid commercial delivery. Commerce remains fail-closed; the current files are temporarily presented as free research collections while CAISSA replaces them with independently built, provenance-tracked albums.**

This is a product release-control audit, not a legal opinion. It records the evidence CAISSA currently has and the permission still required before the credit paywall can be activated.

## Provenance result

| Source | Albums | Current evidence | Commercial decision |
| --- | ---: | --- | --- |
| PGN Mentor / 64 Squares | 17 | The provider page says the files are available for free download. No explicit commercial redistribution/paywall license was found on the reviewed PGN Files, home, or contact pages. | Permission required |
| SmallChess / Ted Wong | 65 | Public Apache directory with direct PGN downloads. No license or terms for commercial redistribution/paywall use were found on the reviewed directory or home page. | Permission required |

The 17 PGN Mentor albums consist of the 16 explicitly imported additions plus José Raúl Capablanca. The original Capablanca attachment recorded in `CAPABLANCA_PGN_VALIDATION.md` has SHA-256 `fb5d46cd1ce78665b2d2ea3df03b5bbea72b6ddb643a0c930f66a686a8723a8a`; that is an exact match for the current `Capablanca.pgn` extracted from PGN Mentor's `Capablanca.zip`. The CAISSA LF-normalized derivative has SHA-256 `33cbbea9421f14f51bf55dbd772fed3031e855235fedf05d9247886a9d96f71f`.

## Why free download is not enough for this release gate

The intended CAISSA use is not merely downloading and studying a file. It stores local copies, delivers complete collections to authenticated accounts, and charges credits for permanent access. That commercial redistribution scope must be explicit.

Individual chess moves and factual metadata may receive different legal treatment from creative text, but a database can have protectable selection or arrangement. In addition, 54 of the 65 SmallChess player files contain brace comments and the set includes source/annotator metadata. CAISSA therefore does not infer commercial permission from the factual nature of game scores.

## Interim free-library product decision

The 82 player albums do not consume credits and do not create account entitlements in the current release. They are labeled `Free` and can be replayed without registration. This is a product decision, not a certification of commercial redistribution rights. The source permission requests remain active, the provenance registry remains unchanged, and paid delivery stays technically disabled.

In a future Season, CAISSA will replace these files progressively with independently assembled collections whose per-game provenance, source URL, retrieval date, license, checksum, and mechanical transformations are retained. Credits will be reserved for CAISSA-created study packs, server analysis, and other original services rather than access to the raw interim PGN files.

Primary references reviewed:

- PGN Mentor PGN Files: <https://www.pgnmentor.com/files.html>
- PGN Mentor contact: <https://www.pgnmentor.com/cont.html>
- SmallChess home/contact: <https://www.smallchess.com/>
- SmallChess game directory: <https://www.smallchess.com/Games/>
- U.S. Copyright Office, automated databases: <https://www.copyright.gov/register/tx-databases.html>
- U.S. Copyright Office, non-photographic databases: <https://www.copyright.gov/non-photographic-databases/register-one.html>
- EU Database Directive, Article 7: <https://eur-lex.europa.eu/eli/dir/1996/9/art_7/oj/eng>

## Evidence required to change a source to `certified`

Retain an explicit license or written authorization from a person able to grant the rights. It must cover:

1. storing and maintaining CAISSA copies of the complete player collections;
2. displaying and delivering them to authenticated CAISSA users;
3. charging credits for permanent account access;
4. worldwide use on the CAISSA website and its Preview/production infrastructure;
5. mechanical PGN normalization, validation, deduplication, and future updates;
6. required attribution, duration, revocation rules, and treatment of previously unlocked accounts.

The evidence document must be retained outside the public content bundle. Only then may `commercialRightsStatus` be changed to `certified` in `data/pgn/player-commercial-rights.json`. The application additionally requires every catalog source to be certified before `CAISSA_PLAYER_ALBUM_COMMERCE_ENABLED=true` can take effect.

## Permission request — PGN Mentor

To: `sales@pgnmentor.com`  
Subject: Commercial permission request for selected PGN player collections on CAISSA Chess

Hello,

CAISSA Chess would like written permission to store local copies of 17 PGN Mentor player collections, display and deliver them to authenticated users, and charge one internal CAISSA credit for permanent account access. The set is José Raúl Capablanca plus the 16 selected player archives listed in our catalog. We would identify PGN Mentor as the source and link to your website.

Please confirm whether 64 Squares has authority to grant this use and, if approved, the required attribution, territory, duration, update, modification, revocation, and previously-unlocked-user terms. Mechanical changes would be limited to format normalization, validation, and deduplication; CAISSA would not claim ownership of the source compilation.

Thank you.

## Permission request — SmallChess

To: `tedwong@smallchess.com`  
Subject: Commercial permission request for SmallChess player PGN collections on CAISSA Chess

Hello Ted,

CAISSA Chess would like written permission to store local copies of the 65 player PGN collections currently available in the SmallChess `/Games/` directory, display and deliver them to authenticated users, and charge one internal CAISSA credit for permanent account access. We would identify SmallChess as the source and link to your website.

Please confirm whether you have authority to grant this use for the game scores, database selection/arrangement, annotations, and other included metadata, and specify the required attribution, territory, duration, update, modification, revocation, and previously-unlocked-user terms. Mechanical changes would be limited to format normalization, validation, and deduplication; CAISSA would not claim ownership of the source compilation.

Thank you.

## Release decision

- Keep `CAISSA_PLAYER_ALBUM_COMMERCE_ENABLED` disabled in every environment.
- Serve the 82 current player albums only through the free-library path; do not debit credits or create player-album entitlements.
- Credit-package checkout can be configured and tested separately in Preview after this audit, but credits must not unlock these 82 albums until both source records are certified.
- World Championship and other historical event collections remain on the separate free-library path; they are not evidence of permission to sell player compilations.
