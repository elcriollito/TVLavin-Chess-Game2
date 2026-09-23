# EAE-015A.2 Lc0 corresponding-source closeout

Status: publication in progress; `LEGAL_SIGNOFF_REQUIRED`.

This work is compliance-only. It does not change the Lc0 runtime, lifecycle
patches, relay, Runtime Manager, Stockfish engines, Arena UI, Tournament, Maia
network, production database, DNS, or `www.caissa-chess.org` headers. It does
not activate an Lc0 provider.

## Frozen stack

- EAE-015A technical commit: `2b24d2c682eb74e6605df4c850e6fa9197c5d233`
- Lc0 version/commit: `v0.33.0-dev+git.482bb4a` /
  `482bb4a830287b726ebe7d42f14ab7f5f17c18a0`
- Runtime build manifest SHA-256:
  `492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f`
- Maia 1100: 1,313,193 bytes, SHA-256
  `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`
- Toolchain: Emscripten 3.1.64, Meson 1.8.3, Ninja 1.11.1.4,
  esbuild 0.28.1, ONNX Runtime Web 1.27.0

## Package design

The versioned ZIP contains the complete pinned Lc0 source snapshot, exact
three-patch series, CAISSA build scripts/configuration and browser source,
network metadata (not the network binary), four license/notice files, build
instructions, a corresponding-source record, and a per-file SHA-256 manifest.
The package also records the pinned source Git tree, every blob ID, and original
file modes so Windows ZIP extraction cannot erase the Unix executable-mode
provenance.
All CAISSA-supplied text is normalized to BOM-free UTF-8/LF during packaging;
the package builder itself is included under `packaging/`.

The final SHA-256 of an archive cannot be embedded inside that same archive
without changing the archive. Therefore the in-archive corresponding-source
record leaves envelope SHA/bytes null and points to the versioned URL; the
repository record plus a detached `.sha256` release asset bind the final
archive bytes. `manifest.json` binds every other archive member.

## Publication and verification

Release/tag: `lc0-browser-source-v0.1`

Title: CAISSA Lc0 Browser Runtime — Corresponding Source

Public archive URL:
`https://github.com/elcriollito/TVLavin-Chess-Game2/releases/download/lc0-browser-source-v0.1/caissa-lc0-browser-corresponding-source-v0.1.zip`

Archive byte count and SHA-256: pending package generation and external fetch.

The release description states that it is a source/compliance publication and
does not activate Lc0 in CAISSA Engine Arena. Post-publication evidence will
record unauthenticated HTTP status, Content-Length, downloaded digest,
extraction, required-file validation, targeted secret scan, and reconstruction.

## Notices and legal status

The package inventories Lc0, Maia, ONNX Runtime Web, Emscripten, and build-only
dependencies, including versions/commits, licenses, sources, copyrights, and
redistribution status. Human review must resolve Maia network redistribution,
GPL completeness/terms, attribution placement, and retention. The checklist is
`docs/compliance/LC0_PRODUCTION_LEGAL_SIGNOFF.md`; no approval is pre-filled.

Final legal status remains `LEGAL_SIGNOFF_REQUIRED` until an authorized human
reviewer records a decision.
