# CAISSA Engine Arena Match Lab — ML-001D Openings

## Scope

ML-001D makes Match Lab opening selection authoritative for Match and Match Series. It does not change Tournament, engine binaries, Lc0, Clerk, or final PGN export.

## Existing ECO source

The selector reuses `/data/eco/eco_codes.json`, the catalog already consumed by the CAISSA ECO page and exposed through `CaissaEcoOpeningResolver.CATALOG_URL`. Rows use:

```js
{ code: 'B90', name: 'Sicilian Defense: Najdorf', moves: '1. e4 c5 …' }
```

`code` is the ECO identifier, `name` contains the opening and optional colon-separated variation, and `moves` is the canonical SAN line. The existing catalog row containing the Najdorf move sequence was corrected from the erroneous `B27` identifier to `B90` in the three existing canonical projections (`eco_codes.json`, `eco_details.json`, and `openings.json`). No parallel opening catalog was added.

## Loading and selector integration

Normal Arena startup does not fetch the ECO catalog. `arena-match-lab-ui.js` calls the shared resolver only when the compact selector opens, then caches the validated projection for the browser session. Search matches ECO code, opening name, or variation name. Malformed rows are excluded without crashing Arena.

The selector is an in-place modal on desktop and a bottom drawer on mobile. Enter selects the first search result, Escape closes, and focus returns to the trigger. The selected summary has bounded height and a static 8×8 preview rendered from the actual resulting FEN, so it cannot resize the primary board.

## Move-to-FEN derivation

`arena-opening-snapshots.js` replays every catalog move through the existing `Chess` constructor. SAN and coordinate tokens are interpreted by chess.js; successful moves are stored as canonical SAN. Any illegal token rejects the whole entry. The resulting FEN is reloaded through chess.js and must contain all six fields:

- placement;
- side to move;
- castling rights;
- en-passant target;
- halfmove clock;
- fullmove number.

Custom FEN uses the same six-field chess.js validation contract as the certified Arena setup path. Invalid input never replaces the running/ready game state.

## Immutable snapshot

Resolved selections are detached and deeply frozen:

```js
{
  type: 'standard' | 'eco' | 'fen',
  eco,
  openingName,
  variationName,
  sanMoves,
  resultingFen,
  sourceId,
  setId
}
```

Standard Position uses the canonical initial FEN. An ECO or Custom FEN snapshot is fixed when the series configuration is created; later catalog or UI changes cannot mutate an active series.

## Balanced Opening Set

The current-session set editor supports adding canonical ECO positions, removing and reordering them, inspecting each FEN through its title, and toggling `playBothColors`.

```js
{
  type: 'set',
  id,
  title,
  positions: [OpeningSnapshot],
  playBothColors,
  gameCount
}
```

With both colors enabled, each position creates an adjacent deterministic pair: Engine A as White, then Engine B as White. Three positions therefore derive and lock six games. With the option disabled, each position appears once and the White assignment alternates across positions.

## Scheduler and series integration

Every ML-001B schedule item now carries `startingPositionSnapshot` and `startingFen`. A prepared/completed game retains its own frozen `opening` metadata for later ML-001E export. The scheduler never queries ECO data during play.

At each transition Arena applies the scheduled snapshot exactly once before engine readiness and before clock creation. The FEN remains byte-for-byte the same across a paired position; only engine assignment swaps. The FEN side-to-move is never rewritten.

Move limits count plies produced after the loaded snapshot. Historical moves used to derive an ECO FEN are metadata and do not consume the per-game move limit.

## Clock interaction

ML-001C remains the sole clock owner. Position load and worker readiness happen before clock initialization. The engine matching the exact FEN side-to-move starts the first search and receives the normal `wtime`, `btime`, `winc`, and `binc` values (or the selected fixed depth). No opening setup time is charged.

## Verification

Unit coverage includes standard/custom snapshots, legal and invalid ECO lines, castling/en-passant/side-to-move preservation, immutability, set derivation, paired ordering, alternating colors, per-game assignment, move-limit origin, and retained game metadata.

Chromium coverage includes B90 code/name search, exact FEN and mini-board preview, legal ECO Match start, same-FEN color swap, Black-to-move clock ownership, a three-position/six-game set, Custom FEN regression, keyboard operation, and mobile board-first containment. Existing Match Series, clock, setup, history, redesign, and Tournament suites remain the regression boundary.

## Deferred

- persisted user opening sets;
- final PGN/history export and SetUp/FEN headers (ML-001E);
- opening-book move selection, weighted books, or repertoire traversal;
- Tournament opening-set integration.
