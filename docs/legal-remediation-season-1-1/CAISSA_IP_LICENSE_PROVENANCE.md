# IP, License and Provenance

Status: EVIDENCE IMPLEMENTED AND TESTED; PUBLICATION DECISIONS BLOCKED.

The machine-readable evidence is on `remediation/ip-license-provenance` in `docs/legal-remediation-season-1-1/ip-provenance-manifest.json`.

Files changed: that manifest, `public/dos/games/gnuchess/README.md` and `tests/ip-provenance-manifest.test.js`.

## Verified

- Stockfish 18 JS/WASM bytes match `stockfish@18.0.0`; package, files, version and GPLv3 text are checksummed.
- Existing Stockfish 19 provenance remains available.
- Fairy-Stockfish JS/WASM bytes match `fairy-stockfish-nnue.wasm@1.1.11` and are recorded as GPLv3.
- The Lichess puzzle source manifest records CC0 provenance.
- `gnuchess.zip` is a 464-byte placeholder containing only `PLACEHOLDER.txt` and `README.txt`; its README no longer claims an executable, opening book, playability or completed GPL compliance.

## Blocked

- js-dos is inconsistent: package range `^8.3.20`, lock `8.5.3`, runtime CDN `8.3.20`.
- A public corresponding-source delivery decision is required for GPL engine distribution.
- Syzygy evidence is authoring/private and does not certify public redistribution.
- PGN/media/broadcast collections require item-level rights review; public availability is not treated as redistribution permission.
- The repository says MIT in package metadata but has no approved root LICENSE. No copyright holder or license scope was invented.

## Owner decisions

1. Identify the copyright holder and intended license scope for original CAISSA code.
2. Approve or reject a root LICENSE and consolidated third-party notice.
3. Choose one js-dos version and an immutable, checksummed self-hosted delivery/source strategy.
4. Approve corresponding-source and notice locations for GPL artifacts.

Qualified IP counsel is recommended before a broad public license or paid distribution decision.
