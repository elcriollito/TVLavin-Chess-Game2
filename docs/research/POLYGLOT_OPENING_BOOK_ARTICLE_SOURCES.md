# Polyglot opening book article research

Accessed: 2026-07-23

This is a private editorial research record. The public article uses original
paraphrase and does not reproduce implementation details or long quotations.

## PolyGlot source and documentation

- Source: *PolyGlot chess adapter*, Fabien Letouzey; maintained mirror by
  Ulrich Thiel.
- URL: https://github.com/ulthiel/polyglot
- Supports: PolyGlot is an adapter and includes a simple binary opening-book
  implementation; the `.bin` book format is separate from a chess engine.
- Editorial note: Used to avoid calling Polyglot an engine or an official FIDE
  standard.

## python-chess Polyglot documentation

- Source: *Polyglot opening book reading*, python-chess documentation.
- URL: https://python-chess.readthedocs.io/en/latest/polyglot.html
- Supports: An entry exposes a position key, encoded move, weight, learning
  field, and decoded move. Readers can retrieve all entries for a position,
  select the largest weight, choose uniformly, or choose by weight.
- Editorial note: Used to explain entry fields and to make clear that move
  selection policy is not universal.

## Cute Chess documentation

- Source: *cutechess-cli manual*, Cute Chess project.
- URL: https://github.com/cutechess/cutechess/blob/master/docs/cutechess-cli.6
- Supports: Cute Chess can load a Polyglot book, set a maximum book depth, and
  access the book in memory or from disk.
- Editorial note: Demonstrates support in a recognized interface while also
  supporting the warning that configuration belongs to the receiving software.

## PyChess documentation

- Source: *PyChess features* and *pychess.Utils.book* documentation.
- URLs:
  - https://pychess.readthedocs.io/en/latest/features.html
  - https://pychess.readthedocs.io/en/stable/pychess.Utils.html
- Supports: PyChess lists Polyglot opening-book support. Its book API returns
  move, weight, and learning values; its documentation notes a weight convention
  but also says books are not required to retain that information.
- Editorial note: Supports the distinction between a useful convention and a
  guaranteed universal meaning for weights.

## CAISSA public behavior and focused tests

- Sources reviewed: the released Polyglot page, its user-facing script, builder
  behavior, and `tests/polyglot-tool.test.js`.
- Supports: `.pgn` input; 25 MB client limit; maximum plies; minimum occurrence
  count; side selection; server-side generation; frequency-based weights;
  standard 16-byte entries; BIN download and retained browser link.
- Verified limitations: the tool does not inspect, merge, or edit existing BIN
  books; export BIN to PGN; analyze positions; or operate exclusively in the
  browser.
- Editorial note: Public copy describes capabilities and user workflow without
  exposing repository paths, endpoint details, or source code.

## Claim decisions

- “Widely recognized” is used instead of “universal.”
- Weight is described as selection data, not objective move strength.
- Book lookup is separated explicitly from engine search.
- PGN is described as readable game/move-sequence notation; BIN is described as
  a machine-oriented position-and-move resource.
- Transpositions are explained at position level without publishing a binary
  specification.
- No claim is made that Polyglot invented opening books, that the format is a
  FIDE standard, or that generated output is tournament-ready.
