# ECO E45-E57 Data Integrity Audit — 2026-11-07

## Outcome

E45-E57 now use a reproducible, legally replayed projection of the Lichess chess-openings dataset pinned at commit `3ba6b20d31b2e6125cb0e6a2e792f400717d9d39`. The upstream dataset is CC0-1.0.

- Source: <https://github.com/lichess-org/chess-openings>
- Pinned E-volume data: <https://github.com/lichess-org/chess-openings/blob/3ba6b20d31b2e6125cb0e6a2e792f400717d9d39/e.tsv>
- Repository source snapshot: `data/eco/sources/lichess-e45-e57-3ba6b20d.json`
- Deterministic projection: `node scripts/sync-eco-e45-e57.mjs`

The sync validates all 25 source records with `chess.js`, restores the missing E53 and E55 codes, writes byte-identical canonical/public projections, derives each representative FEN from legal replay, quarantines unauditable aggregates, and regenerates the out-of-range missing-code inventory.

## Audited code matrix

| Code | Representative opening | Source variations | Replayed FEN | Stats / continuations |
| --- | --- | ---: | --- | --- |
| E45 | Nimzo-Indian Defense: St. Petersburg Variation, Fischer Variation | 1 | `rn1qk2r/p1pp1ppp/bp2pn2/8/1bPP4/2N1P3/PP2NPPP/R1BQKB1R w KQkq - 2 6` | Unavailable |
| E46 | Nimzo-Indian Defense: Normal Variation | 3 | `rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2N1P3/PP3PPP/R1BQKBNR w KQ - 1 5` | Unavailable |
| E47 | Nimzo-Indian Defense: Normal Variation | 1 | `rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2NBP3/PP3PPP/R1BQK1NR b KQ - 2 5` | Unavailable |
| E48 | Nimzo-Indian Defense: Normal Variation, Classical Defense | 2 | `rnbq1rk1/ppp2ppp/4pn2/3p4/1bPP4/2NBP3/PP3PPP/R1BQK1NR w KQ - 0 6` | Unavailable |
| E49 | Nimzo-Indian Defense: Normal Variation, Botvinnik System | 1 | `rnbq1rk1/ppp2ppp/4pn2/3p4/2PP4/P1PBP3/5PPP/R1BQK1NR b KQ - 0 7` | Unavailable |
| E50 | Nimzo-Indian Defense | 1 | `rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2N1PN2/PP3PPP/R1BQKB1R b KQ - 2 5` | Unavailable |
| E51 | Nimzo-Indian Defense: Normal Variation, Ragozin Variation | 5 | `rnbq1rk1/ppp2ppp/4pn2/3p4/1bPP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 6` | Unavailable |
| E52 | Nimzo-Indian Defense: Normal Variation, Schlechter Defense | 2 | `rnbq1rk1/p1p2ppp/1p2pn2/3p4/1bPP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7` | Unavailable |
| E53 | Nimzo-Indian Defense: Normal Variation, Gligoric System | 3 | `rnbq1rk1/pp3ppp/4pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7` | Unavailable; no historical aggregate existed |
| E54 | Nimzo-Indian Defense: Normal Variation, Gligoric System, Exchange Variation | 3 | `rnbq1rk1/pp3ppp/4pn2/2p5/1bBP4/2N1PN2/PP3PPP/R1BQ1RK1 b - - 0 8` | Unavailable; contaminated historical rows |
| E55 | Nimzo-Indian Defense: Normal Variation, Gligoric System, Bronstein Variation | 1 | `r1bq1rk1/pp1n1ppp/4pn2/2p5/1bBP4/2N1PN2/PP3PPP/R1BQ1RK1 w - - 1 9` | Unavailable; no historical aggregate existed |
| E56 | Nimzo-Indian Defense: Normal Variation, Gligoric System, Bernstein Defense | 1 | `r1bq1rk1/pp3ppp/2n1pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 2 8` | Unavailable |
| E57 | Nimzo-Indian Defense: Normal Variation, Gligoric System, Bernstein Defense | 1 | `r1bq1rk1/pp3ppp/2n1pn2/8/1bBp4/P1N1PN2/1P3PPP/R1BQ1RK1 w - - 0 10` | Unavailable; contaminated historical rows |

## Statistics decision

The historical aggregate files did not retain the source PGN, source digest, build manifest, or game-level trace needed to prove the W/D/L and game totals against real games. E54 and E57 also included clearly unrelated Caro-Kann and Queen's Gambit Declined lines. E53 and E55 had no aggregate rows at all.

Accordingly, every E45-E57 aggregate and continuation row is removed from the served JSON and retained only in `data/eco/audit/eco-e45-e57-quarantine-20261107.json`. The UI displays **Unavailable** with zero-width W/D/L bars; it does not synthesize values or copy nearby ECO statistics. Reintroduction requires a provenance-bearing PGN build and position-level classification audit.

## Runtime integrity changes

- Opening identity, defining moves, related variation labels, board, and local availability render without waiting for optional theory or cloud-book services.
- The board replays legal SAN first and accepts the stored canonical FEN only after its position, side, castling rights, and counters agree with that replay. Invalid selections never silently fall back to the starting position.
- Theory loads through `data/openings/eco/manifest.json`. Only B20, B34, and B70 are listed; E45-E57 therefore make no individual theory-file requests and show an honest unavailable state.
- Selection changes abort stale theory, book, and position-stat work. Remote book/stat calls have a five-second upper bound. A remote failure may change only optional book/continuation availability, never the opening identity, board, or valid local stats.
- Local aggregate and continuation rows are rejected unless counts are finite, nonnegative, and internally consistent.

## External book diagnosis

`https://caissa-game-fetcher.elcriollito.workers.dev/api/book` failed before HTTP on 2026-11-07:

- Windows DNS resolution returned `DNS_ERROR_RCODE_NAME_ERROR`.
- `curl` returned exit condition 6, “Could not resolve host.”
- The repository still declares a `caissa-game-fetcher` Workers deployment with `workers_dev = true`, but no replacement public URL is configured in this repository.

This is consistent with a retired or misconfigured Workers hostname, not a transient HTTP application error. Cloudflare account lifecycle state could not be established from repository or public evidence, so no replacement endpoint was invented or deployed. The UI now degrades safely while the optional service remains unavailable.

## Legacy route consolidation

The legacy `/database` implementation is strictly weaker than `/eco`: it duplicates list/detail/theory behavior but lacks the canonical verified board, audited availability states, unified navigation, and current metadata. It is therefore not maintained in parallel.

Repository-wide route inspection found no active primary-navigation or feature dependency on `/database`; its remaining links are self-contained inside the retired `database.html`/`js/database-page.js` implementation and historical documentation. `/opening-database` remains a separate, supported Opening Explorer product and is unchanged.

- `/database` and `/database/` permanently redirect to `/eco`.
- `/database/eco/:code` permanently redirects to `/eco/:code`.
- The local server mirrors the redirect with HTTP 308 and preserves query strings.
- `/database` is removed from the sitemap. Legacy source files remain in the repository for history.
- The generated public-route inventory now records `/database` only as a redirect, not a canonical public page.
- IndexNow change mapping no longer submits `database.html` as `/database`.

## Pull-request disposition

- PR #45 (`fix/public-chess-tv-eco-contract-2026-10-02`) was closed as superseded on 2026-11-07. Main commit `2eef0cb05454a48a5e3791d13aae889d04cc5f07` had already restored the equivalent B90 public catalog row. Canonical/public catalog equality is covered by the new integrity test; the stale branch was not merged.
- PR #50 (`test/eco-resolver-cache-contract-2026-10-02`) correctly updates the shell assertion to the already-loaded resolver version `v1.1.0`. That one-line assertion is ported into this isolated repair branch. PR #50 remains open pending a separate owner-authorized merge decision.

## Remaining inventory and release boundary

The catalog now contains 366 unique codes. The 134 missing codes outside E45-E57 are listed in `docs/eco/ECO_MISSING_CODES_INVENTORY_20261107.md`; they are explicitly out of scope for this repair and must not be filled without source validation.

## Automated verification

- Deterministic data sync executed twice without drift.
- 85 affected Node tests passed, including ECO, Mentor, Chess TV, Opening Database, navigation, route inventory, IndexNow, and accessibility contracts.
- 36/36 ECO browser tests passed across Chromium, Firefox, WebKit, installed Microsoft Edge, Pixel-class mobile Chromium, and iPhone-class mobile WebKit.
- The affected advanced Chess TV ECO-resolution browser scenario passed separately in Chromium.
- Offline-book, rapid-selection, theory-request, deep-link redirect, responsive-overflow, and serious/critical axe checks are included in the browser matrix.
- `npm ci` reported zero dependency vulnerabilities.

This repair is preview-only. It does not authorize a production deployment or merge. The terminal state is **READY FOR OWNER HUMAN QA**.
