# Polyglot Compatibility Report

Audit date: 2026-11-07
Candidate: browser worker/core on `feature/caissa-downloads-polyglot-expansion`

## Result

**PASS for the exercised canonical vectors and PGN corpus.** Broader engine interoperability remains a human acceptance item because no external chess GUI was launched during automated testing.

## Canonical hash vectors

Expected values were independently generated with `python-chess` 1.11.2.

| Position | Expected / actual Polyglot key | Result |
|---|---|---|
| Standard initial position, White, KQkq | `463b96181691fc9c` | PASS |
| After `1.e4 e5`, non-capturable `e6` EP field | `0844931a6ef4b9a0` | PASS |
| Kings/rooks with KQkq rights | `fda239cc692a6053` | PASS |
| Capturable `f6` en-passant position | `22a48b5a8e47ff78` | PASS |

The capturable en-passant vector changes when the EP field is removed; the non-capturable vector follows Polyglot's rule and does not hash a file without a possible capture.

## Move encoding

- White king-side castle `e1g1` encodes king-to-rook square `e1h1`: PASS.
- Black queen-side castle `e8c8` encodes `e8a8`: PASS.
- Queen promotion `a7a8q` sets promotion code 4: PASS.
- To-square occupies bits 0–5 and from-square bits 6–11: PASS.

## PGN behavior matrix

| Case | Policy/result |
|---|---|
| Multiple games | Parsed independently |
| Header without Event / different order | Accepted |
| UTF-8 headers | Streaming decoder preserves characters |
| CRLF / CR / LF | Normalized |
| Missing final newline | Final pending game emitted |
| Comments and semicolon comments | Ignored for boundary detection; accepted by parser |
| NAGs | Accepted and not encoded |
| RAV variations | Explicitly ignored; main line only |
| `SetUp` + `FEN` | Actual initial board replayed |
| Castling | Canonical Polyglot representation |
| Promotion | Canonical 3-bit promotion field |
| En passant | Legal replay and conditional key hashing |
| Illegal/truncated game | Skipped with an error sample; neighboring valid games continue |
| Oversized unterminated game | Rejected at 8 MiB per-game safety bound |

## Binary structure

Automated tests verify:

- output length is an exact multiple of 16;
- key is unsigned 64-bit big-endian;
- move and weight are unsigned 16-bit big-endian;
- learn is unsigned 32-bit big-endian and zero;
- rows are sorted by `(key, move)`;
- occurrence weights are deterministic and capped at 65,535.

## Independent sample validation

Input: the public portable ZIP's `pgns\sample.pgn` (`1.e4 e5 2.Nf3 Nc6 3.Bb5 a6`).

| Builder | Entries | Bytes | SHA-256 |
|---|---:|---:|---|
| Existing portable CLI v0.2.0 | 6 | 96 | `10519c9389a1d9f84a475b4f9a2b1de2dfaed74f26ada1c4ea929774c58e5db4` |
| Candidate browser core | 6 | 96 | `10519c9389a1d9f84a475b4f9a2b1de2dfaed74f26ada1c4ea929774c58e5db4` |

`scripts/validate-polyglot.py` independently compared the portable BIN with python-chess-derived expected rows: PASS, sorted, all learn fields zero.

## Reproduction

```powershell
node --test tests/polyglot-tool.test.js
python scripts/validate-polyglot.py --pgn .\sample.pgn --bin .\sample.bin --max-ply 8 --min-count 1 --side both
```

## Remaining human checks

- Load representative output in at least one known Polyglot-compatible engine/GUI.
- Confirm expected book choices for castling, en-passant and promotion positions.
- Confirm a real, diverse PGN database produces acceptable move distribution and memory behavior.
