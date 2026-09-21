# CAISSA Engine Arena EAE-004 — Stockfish 19 Certification

Baseline: `6c9dc36737b4d377585d8119efc0c6b5fc5efc67`

## Runtime contract

- Provider: `stockfish-19-lite`
- Runtime: `stockfish-19-lite-single-runtime`
- Display name: **Stockfish 19 Lite**
- Worker: `/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js`
- WASM: `/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm`
- Options: `MultiPV=1`, `Hash=16`, `Threads=1`
- UCI identity: `Stockfish 19 Lite WASM` by
  `the Stockfish developers (see AUTHORS file)`
- Accepted name pattern:
  `^Stockfish\s+19(?:\.\d+){0,2}\s+Lite\s+WASM(?:\s.*)?$`
- Browser profile: Lite, single-threaded, NNUE embedded, no separate network asset
- Security posture: no cross-origin isolation, `SharedArrayBuffer`, CSP, COOP, COEP, or
  global worker-policy change

Identity is validated after `uciok` and before `isready`; READY is entered only after `readyok`.
Dedicated regression cases prove that Stockfish 18 Lite and Stockfish 2019 MV identities do not
satisfy this provider, and that Stockfish 19 does not satisfy either older provider.

## Measured resources

| Item | Measurement |
| --- | --- |
| Worker JavaScript | 21,415 bytes |
| WASM, including Lite NNUE | 1,787,571 bytes |
| Separate NNUE asset | None |
| Configured hash | 16 MiB per SF19 worker |
| Threads | 1 per SF19 worker |
| Arena-owned workers | Maximum 3: white, black, evaluator |
| Maximum simultaneous SF19 workers | 2 in SF19 vs SF19, plus the evaluator |
| Independent browser probe `uciok` | 282.2 ms from worker construction |
| Independent browser probe `readyok` | 282.7 ms from worker construction |

The timing values are one local Chromium engineering sample, not a performance guarantee. The
page also has one pre-existing app-level legacy Stockfish worker outside Arena ownership. Arena
stop and exit terminate all three Arena workers while leaving that unrelated application worker
alone. Browser APIs used here do not expose reliable per-worker memory consumption, so no precise
memory claim is made.

Selector rendering creates zero SF19 workers. Selection or Tournament pairing preparation creates
the runtime on demand. Participant replacement terminates the displaced worker; Match stop and
Arena exit clear all Arena instances; startup, identity, and worker errors terminate the failed
worker and clear READY without fallback.

## Browser certification

Real workers completed legal play in all required Match combinations:

- Stockfish 19 Lite vs Stockfish 18 Lite
- Stockfish 18 Lite vs Stockfish 19 Lite
- Stockfish 19 Lite vs Stockfish 2019 MV
- Stockfish 2019 MV vs Stockfish 19 Lite
- Stockfish 19 Lite vs Stockfish 19 Lite, with distinct workers and runtime instance IDs

A real three-provider Tournament used Stockfish 2019 MV, Stockfish 18 Lite, and Stockfish 19 Lite.
Odd-field byes rotated, recorded identities continued to match visible participants, manual draw
Cancel preserved the live game, Confirm stopped active searches, recorded `1/2-1/2`, awarded 0.5
to each participant, rendered `½`, preserved SAN history, and advanced to a correctly attributed
next pairing.

The Game tab was exercised with SF19 for evaluation, SAN PV, SAN move history, evaluation graph,
Pause, Resume, Stop, and finished/adjudicated state. No UCI coordinate move leaked into the
visible PV or score sheet. Board geometry drift stayed within the automated 0.5 px tolerance on
desktop, tablet, 390×844 portrait, and 844×390 landscape. SF19 remained operational at both mobile
sizes, with no Arena overflow, captured console error, or page error. The Arena accessibility scan
reported zero serious or critical findings.
