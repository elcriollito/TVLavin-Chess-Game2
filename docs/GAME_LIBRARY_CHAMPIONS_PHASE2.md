# Game Library Champions Season — Phase 2 review packet

Date: 2026-10-04

Status: local visual and functional review only; not published

Base: Phase 1 commit `4c41fec717d6aa278a6ca6250dfa2a3b0d7085ce`

## Final route architecture

- `/game-library` remains the personal IndexedDB library.
- `/game-library/champions` remains the champion-first historical archive.
- `/watch/game-replayer?collection=<allowlisted-id>` is the generic web-reader handoff.
- No separate match route, old PGN-catalog rebuild, desktop protocol, or production deployment was added.

Future conceptual subsections remain Champions, Championship Matches, and Collections. Phase 2 intentionally adds no extra top-level navigation.

## Historical verification changes

The primary sequence remains the 18 recognized champions from Wilhelm Steinitz through Gukesh Dommaraju. FIDE's September 2026 announcement still describes Gukesh as the reigning champion; his first defense is scheduled for November–December 2026 and therefore is not yet an archive event.

The second pass made exceptional events explicit:

| Event | Encoded treatment | Verification outcome |
| --- | --- | --- |
| 1948 | `format: quintuple-round-robin`, `status: tournament`, 50 event games | FIDE filled the vacancy after Alekhine's death; Botvinnik scored 14/20. |
| 1972 | completed match, 21 games, 12½–8½ to Fischer | Connected to the complete local match collection. |
| 1975 | `format: forfeit`, `status: forfeited`, zero games | The match was not played; Karpov received the title after Fischer refused the approved conditions. |
| 1978 | completed first-to-six match, 32 games | Karpov won 6–5 in decisive games. |
| 1981 | completed first-to-six match, 18 games | Karpov won 6–2 in decisive games with ten draws. |
| 1984–85 | 1984 `status: aborted`, 48 games; 1985 completed, 24 games | The first match transferred no title; Kasparov won the replacement match 13–11. |
| 1987 | `status: drawn`, 24 games | Kasparov retained at 12–12. |
| 1993 | explicit administrative split | Classical and FIDE tracks remain parallel. |
| 1999–2005 FIDE line | `status: tournament` | Knockout/tournament champions are not modeled as normal incumbent–challenger matches. |
| 2006 | `lineage: reunification`, `status: reunification` | Kramnik defeated Topalov and reunited the title. |
| 2024/current | Gukesh remains champion | Confirmed against FIDE's current 2026 cycle announcement. |

Unverified defense totals, match totals, and national-identity labels are no longer rendered. The raw historical country strings remain research-only data. Portraits remain generated placeholders.

Primary historical sources:

- FIDE Open Chess Museum champion sequence: <https://museum.fide.com/champions>
- FIDE history for 1948, the 1993 split, and 2006 reunification: <https://museum.fide.com/fide-history>
- 1948 final protocol: <https://museum.fide.com/exhibits/the-final-arbiter-protocol-of-the-1948-world-championship-tournament>
- Fischer biography and 1975 succession: <https://museum.fide.com/champions/robert-bobby-fischer>
- 1972 commemorative program: <https://museum.fide.com/exhibits/icelandic-chess-federations-1972-world-championship-match-commemorative-program>
- 1978 match medal: <https://museum.fide.com/exhibits/medal-of-the-world-chess-championship-match-karpov-vs-korchnoi-in-1978>
- 1981 score sheet: <https://museum.fide.com/exhibits/scoresheet-of-game-4-of-the-1981-world-championship-match-karpov-korchnoi-korchnois-handwriting>
- 1984 match table: <https://museum.fide.com/exhibits/table-used-in-the-1984-world-championship-match-karpov-vs-kasparov>
- 2006 medal: <https://museum.fide.com/exhibits/kramniks-medal-from-the-world-chess-championship-2006>
- Current 2026 match announcement: <https://www.fide.com/salesforce-fide-world-championship-match-2026-schedule-format-and-prize-fund-confirmed/>

## Stabilized entities

`Champion` now carries placeholder-ready portrait policy fields: `portraitAsset`, `attribution`, `source`, `license`, and `licenseUrl`. No external image URL or unlicensed portrait is present.

`Reign` retains linked title-transition IDs and explicit lineage. Existing numerical research fields remain non-UI data until independently verified.

`ChampionshipEvent` supports `numberOfGames`, `format`, `lineage`, `status`, `pgnCollectionId`, and `historicalNote`; `status` is restricted by archive validation to `completed`, `drawn`, `aborted`, `forfeited`, `tournament`, or `reunification`.

`PGNCollection` is now a separate allowlisted registry. Allowed fields are `id`, `title`, `type`, `eventId`, `championId`, `gamesCount`, `source`, `attribution`, `localAsset`, `downloadable`, `readerCompatible`, and optional `checksum`. Registry validation rejects unknown fields, malformed IDs, remote URLs, traversal, query/fragment suffixes, invalid counts, and invalid checksums.

## First complete championship collection

Selected: Fischer–Spassky, Reykjavik 1972.

Reasons: it is historically central to Fischer's reign, the match is finite, PGN Mentor exposes a complete event file, and the file has consistent round/player/result headers. The source is <https://www.pgnmentor.com/events/WorldChamp1972/> and the retrieved asset was <https://www.pgnmentor.com/events/WorldChamp1972.pgn>.

Validation results:

- 21 PGNs and rounds 1–21
- exactly two player header names: `Spassky, Boris V` and `Fischer, Robert James`
- results: five `1-0`, five `0-1`, eleven `1/2-1/2`
- all 21 games accepted by `chess.js` 1.4.0
- no malformed or zero-ply games (Game 2 is a one-move forfeiture score)
- source SHA-256: `2e328e7305609ed01821f6f40cf6da4e3b6bea7e93c10de9cb0c8b5b2d65f875`
- normalized local SHA-256: `562adc8a35bcd62d7c0ad0974de9a75e662fd808f704915cfe2ea0f00bd97c24`
- transformation: CRLF to LF only

Provenance lives beside the PGN in `public/data/pgn/world-championships/`. PGN Mentor describes downloadable game-score collections, but does not provide a conventional SPDX-style license statement. This is acceptable for local review; publication still needs owner/legal confirmation.

## Reader and download implementation

`CaissaPgnReader.open({ collectionId, gameId: null, target: 'best-available' })` resolves only registry entries marked `readerCompatible`. It navigates to the existing web reader with an encoded collection ID. Unknown IDs, traversal-like input, incompatible assets, non-numeric game IDs, and unsupported targets fail closed.

The existing ChessBase wrapper now resolves the same registry and assigns only a known local asset to `data-url`. Provider JavaScript remains dynamically isolated inside the sandboxed iframe with SRI. The upstream ChessBase CSS and runtime changed during Phase 2; their current SHA-384 values were independently fetched and pinned. Provider failure still produces a bounded retry/download fallback.

Capablanca remains the default at `/watch/game-replayer`, retains 597 games and its existing provenance, and passes its former gateway/browser tests.

The 1972 download is a fixed local URL with `application/x-chess-pgn`, a stable suggested filename, cache headers, and no arbitrary-path or remote-redirect surface.

## Personal Library regression

The archive imports no personal-library module and contains no IndexedDB call. Browser coverage seeds a private game collection and a saved position containing a favorite flag, tags, and an engine report in `caissa_library`; it then visits the Champions archive and confirms both records remain byte-for-byte equivalent. The personal route still opens its Positions and Games tabs and does not load the archive runtime.

## Verification performed

- Node: archive graph, 18-champion ordering, ID uniqueness, cross-references, chronology, split lineage, special statuses, registry allowlist/rejections, checksums, reader handoff, Capablanca regression, and gateway security.
- PGN parser: 21/21 games accepted.
- Chromium: archive at 1920×1080, 1440×900, and 1366×768; Fischer detail; reader game list and next-game navigation; download link; return link; Karpov exceptional events; personal IndexedDB preservation; Capablanca reader; failure fallback.
- WebKit focal: the complete Champions suite, including the reader journey and IndexedDB isolation.
- No horizontal document overflow at the required desktop widths.

## Local review

Run `node server.js`, then open:

- <http://127.0.0.1:8000/game-library/champions>
- direct imported collection: <http://127.0.0.1:8000/watch/game-replayer?collection=fischer-spassky-1972-complete>

Recommended path: Bobby Fischer → View reign → Open in PGN Reader → Games → choose/advance games → download → Return to World Champions.

Screenshots are in `artifacts/game-library-champions-phase2/` at 1920×1080, 1440×900, and 1366×768.

## Open questions before publication

1. Obtain explicit publication approval or a clearer license statement for the PGN Mentor derivative, despite factual game scores and source attribution.
2. Decide and document a historically sensitive national-identity editorial policy before enabling those labels.
3. Source portraits only from assets with explicit reusable licenses and complete attribution fields.
4. Decide whether incomplete one-game repository assets should stay visible after more complete match collections arrive.
5. Confirm whether the reader should restore the exact champion-dialog hash on return; Phase 2 returns to the archive route.

## Recommended Phase 3

After legal/source review, import one additional complete match through the same pipeline (Karpov–Korchnoi 1978 is the best coverage test), add a champion-first Championship Matches filter, restore dialog/deep-link state on reader return, and begin a separately reviewed licensed-portrait batch. Do not bulk-import until the second collection proves the provenance and parser process is repeatable.
