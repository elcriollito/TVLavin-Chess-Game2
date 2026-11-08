# Polyglot Performance Benchmark

Audit date: 2026-11-07

Machine: local Windows x64 audit workstation

Corpus: repeated legal six-ply Ruy Lopez game, UTF-8 PGN

Options: max ply 12, minimum count 1, both sides, capped weights

## Important limitation

The corpus deliberately makes file-size testing reproducible, but it has only six unique `(position, move)` records. It measures input streaming/parser throughput, not worst-case aggregate memory. Real databases with many distinct positions can use substantially more memory.

## Candidate browser core

Command:

```powershell
node scripts/benchmark-polyglot.mjs --output-dir="C:\temp\caissa-polyglot" --sizes=1,5,10,25
```

| Input | Exact bytes | Games | Elapsed | Peak Node RSS | Output | Result |
|---:|---:|---:|---:|---:|---:|---|
| 1 MiB | 1,048,668 | 11,276 | 14.522 s | 95,719,424 B (91.3 MiB) | 96 B | PASS |
| 5 MiB | 5,242,968 | 56,376 | 84.717 s | 204,124,160 B (194.7 MiB) | 96 B | PASS |
| 10 MiB | 10,485,843 | 112,751 | 174.465 s | 209,063,936 B (199.4 MiB) | 96 B | PASS |
| 25 MiB | 26,214,468 | 281,876 | 430.144 s | 188,514,304 B (179.8 MiB) | 96 B | PASS |
| 50 MiB | 52,428,843 | — | — | — | — | EXPECTED REJECTION at UI 25 MiB gate |

RSS includes the Node runtime and varies with garbage collection, so it is not the worker's aggregate-map estimate. The 25 MiB case was correct and stable but slow. The candidate therefore keeps a tested 25 MiB ceiling and makes no latency or unlimited-size promise.

## Existing portable v0.2.0 CLI

Executable: independently downloaded public `CAISSA-Book-Builder.exe`
SHA-256: `a51ee2918d0a3c9cd17dab26159ac9008272506400dcf186123e794041dd62ed`

| Input | Exact bytes | Games | Elapsed | Peak process-tree working set | Output | Result |
|---:|---:|---:|---:|---:|---:|---|
| Bundled sample | 157 | 1 | 2.1 s including one-file startup | not sampled | 96 B | PASS |
| 25 MiB | 26,214,468 | 281,876 | 147.121 s | sampling invalid for this run | 96 B | PASS |
| 50 MiB | 52,428,843 | 563,751 | 292.253 s | 48,361,472 B (46.1 MiB) | 96 B | PASS |
| 100 MiB | — | — | — | — | — | NOT TESTED |
| 250 MiB | — | — | — | — | — | NOT TESTED |
| 500 MiB | — | — | — | — | — | NOT TESTED |
| 1 GiB | — | — | — | — | — | NOT TESTED |

Both 25 and 50 MiB outputs had SHA-256 `02cf46d26fe21088f546240e4af946a33b8a895ade91dbf7c98837426ac86e6a`; all six weights reached the expected 65,535 cap.

## Stop decision

Testing stopped after 50 MiB because:

1. portable source/build inputs were not found;
2. static inspection shows no aggregate-memory bound or external merge;
3. the repeated corpus cannot exercise high-cardinality memory;
4. 50 MiB already required nearly five minutes;
5. escalating size without a diverse corpus would create a marketing number, not a safety result.

No 100 MiB, 250 MiB, 500 MiB, 1 GiB or “300 MiB+” capability is certified. Recovering source and implementing bounded aggregation/external merge are prerequisites for that claim.

## Correctness evidence

- Browser and portable bytes matched exactly for the bundled sample.
- `scripts/validate-polyglot.py` independently validated the portable sample with python-chess 1.11.2.
- Canonical start, castling and en-passant hash vectors pass unit tests.

## Reproduction notes

The benchmark corpus generator rounds up to the next complete PGN game, so exact bytes slightly exceed the nominal MiB target. Output paths used for this audit were outside both source repositories under `.caissa-polyglot-portable-audit`; no binary was added to the web project.
