# Portable Source Audit

## Disposition

**BLOCKED — compiled artifact inspected; portable source and reproducible build inputs not found.**

The mandate explicitly forbids inventing a replacement merely because source is hard to locate and forbids claiming an audit from compiled bytes alone. No portable source was changed or rebuilt.

## Discovery

- Web repository: no portable application source/build project.
- Separate repository inspected: `C:\Users\ALEXANDER\Alexander Projects\caissa-desktop-suite`.
- Candidate location: `apps/polyglot-book-builder`.
- Contents: a 205-byte README only; no Python modules, GUI source, manifests, dependency lock, PyInstaller spec, tests or build scripts.
- That repository had unrelated user work and a stricter no-commit rule; it was left unchanged.
- Historical v1.0.0 download, checksum and changelog URLs returned `404` and are not treated as a release.

## Existing public v0.2.0 artifact

| Property | Observed value |
|---|---|
| ZIP | `CAISSA-Book-Creator-v0.2.0-portable.zip` |
| Bytes | 244,203,091 |
| SHA-256 | `58e12d34644f223c905583318961c3d8dde33644445a78d750709a923ffa4b38` |
| Entries | 7 |
| Main GUI | `CAISSA-Book-Creator-GUI.exe`, 235,976,559 bytes, unsigned |
| CLI | `CAISSA-Book-Builder.exe`, 9,827,177 bytes, unsigned |
| Packaging | PyInstaller 6.18.0 one-file executables |
| Runtime | CPython 3.14 |
| GUI | PySide6 6.10.2 / Qt 6.10 |
| Chess parser | chess/python-chess module 1.11.2 |

Executable SHA-256 values:

- GUI: `7e1c62cf1d014b1ec03ba4b71caeee328f1d91294f04aa1f9f710007f2a14c35`
- CLI: `a51ee2918d0a3c9cd17dab26159ac9008272506400dcf186123e794041dd62ed`

## Static implementation findings

PyInstaller archive inspection and Python 3.14 bytecode disassembly identified `bookbincreator.builder`, `bookbincreator.cli` and `bookbincreator_gui.app`.

- PGNs are discovered from one file or a recursive `*.pgn` directory walk.
- `chess.pgn.read_game()` processes games incrementally from a text stream.
- UTF-8 is attempted with an encoding fallback counter.
- Legal main-line moves are aggregated in a global `Counter[(key, move)]`.
- Polyglot hashes come from `chess.polyglot.zobrist_hash()`.
- Castling and promotions use canonical Polyglot move encoding.
- Filtering creates a second in-memory list, normalization creates another entries list, and the entire entries list is sorted before sequential output.
- There is no bounded aggregate-memory threshold, external sorted-run spill, disk merge, cancellation token, checkpoint or output-replacement protection visible in the compiled builder.
- The GUI bundle includes far more PySide6 modules than this application appears to need, explaining most of the 226 MiB executable.

The implementation can stream input text, but high-cardinality books can still exhaust memory. Low-uniqueness repeated-game tests do not prove a safe maximum for real databases.

## Executed checks

- ZIP extraction: PASS.
- Authenticode: both EXEs `NotSigned`.
- Microsoft Defender custom scan: no detections returned; signature database `1.463.178.0`, updated 2026-11-07. Real-time protection was disabled, so this is recorded only as a custom-scan result.
- Public hash lookup: no indexed VirusTotal/web result found for the ZIP or GUI hash; status remains PENDING. No sample was uploaded.
- CLI `--help`: PASS.
- Bundled sample conversion: PASS, 6 records / 96 bytes.
- Independent `python-chess` validation: PASS.
- Browser/portable byte parity: PASS for the sample.
- GUI startup and interaction: HUMAN QA PENDING; the GUI was not automated or treated as certified.

## Reproducibility and license blockers

- No source commit can be tied to the binaries.
- No PyInstaller spec or locked dependency environment is available.
- The ZIP contains no corresponding source offer or third-party license bundle despite embedding GPL/LGPL components.
- A deterministic rebuild cannot be performed.
- Large-file architecture cannot be corrected without source.

Therefore this artifact must remain **certification pending** and must not be represented as a newly audited portable release.
