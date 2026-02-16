# Opening Book Pipeline

This pipeline builds a compact, position-indexed opening database from PGN files for Play page usage.

## Why

- Raw PGN databases are too large for browser delivery.
- We precompute shard JSON files keyed by position hash.
- The Play page fetches only one small shard (`book_chunk_xx.json`) per position.

## Data Perspective

All `w/d/l` values are from **White perspective**:
- `w`: games White won
- `d`: draws
- `l`: games White lost

## Hashing

Position key uses deterministic FNV-1a 64-bit on normalized FEN:

`piecePlacement + sideToMove + castling + enPassant`

(halfmove/fullmove counters are ignored)

## Build Command

```bash
npm run build:opening-book
```

Build transposition-safe ECO position labels:

```bash
npm run build:eco-position-map
```

Equivalent explicit command:

```bash
node scripts/build-opening-book.js --pgnDir data/pgn --outDir public/data/book_chunks --maxPlies 16
```

Optional args:

- `--topMoves 10` (default 10)
- `--input <file.pgn>` (can be repeated; bypasses directory scan)

## Outputs

Written to `public/data/book_chunks/`:

- `book_chunk_00.json` ... `book_chunk_ff.json`
- `index.json`

Each entry shape:

```json
{
  "<hash>": {
    "eco": "B20",
    "name": "Sicilian Defense",
    "games": 12345,
    "w": 5100,
    "d": 3200,
    "l": 3925,
    "lastYearSeen": 2023,
    "moves": [
      { "uci": "g1f3", "san": "Nf3", "n": 5200, "w": 2400, "d": 1600, "l": 1200 }
    ]
  }
}
```

## Runtime Integration

Play page uses `js/opening-db-service.js`:

1. Compute hash from current FEN.
2. Fetch shard based on first two hex chars.
3. Read entry and render opening + coach suggestions.

Play page also uses `public/data/eco/eco_position_map.json` for position-based ECO/name labeling.

## Debugging (Dev Only)

Enable opening diagnostics with either:

- URL: `?debug=1`
- or in console: `localStorage.setItem('caissa.openingDebug', '1')`

Logs include FEN, hash, shard load status, entry hit/miss, and fallback reason.

## Deployment Notes

- Do not deploy raw PGN files.
- `.vercelignore` excludes `data/pgn/**`.
- Deploy only generated shard JSONs under `public/data/book_chunks/`.
