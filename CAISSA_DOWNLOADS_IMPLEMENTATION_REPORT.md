# CAISSA Downloads & Polyglot Expansion — Implementation Report

Date: 2026-11-08

Branch: `feature/caissa-downloads-polyglot-expansion`

Baseline: `ce9a5198a8d0618d32fa9c34c500267ad89efc85`

## Executive summary

The candidate replaces normal server-side PGN conversion with a browser Web Worker, introduces `/downloads` as the canonical software catalog, preserves `/vault` through a permanent candidate redirect, and hardens download and public-release integrity controls. No production deployment, R2 mutation, executable publication, merge, push, or VirusTotal sample upload was performed.

## Online converter

- PGN bytes are streamed from `File.stream()` to a module Worker with transferable buffers.
- Conversion is local to the browser; `/api/polyglot/build` is a body-independent `410 Gone` tombstone.
- The page and Worker independently enforce the tested 25 MiB ceiling.
- Progress, cancellation, deterministic Polyglot ordering, memory-budget checks, FEN starts, Unicode headers, comments, NAGs, castling, promotion, and en passant are covered.
- EN, ES, and PT catalogs cover static and live states.

Measured repetitive-corpus results are recorded in `PORTABLE_PERFORMANCE_BENCHMARK.md`. The 25 MiB case completed correctly but took 430.144 seconds; this candidate does not claim unlimited or low-latency conversion.

## Downloads catalog

- `/downloads` is canonical and `/vault` is retained as a legacy redirect in the candidate configuration.
- Only the existing public CAISSA Book Creator v0.2.0 artifact is represented as downloadable.
- Future Scanner and PGN Reader products have no invented links.
- The historical v1.0.0 portable records return `410` and are excluded from the catalog because the objects were not present.
- The existing v0.2.0 identity is pinned to size, ETag, and SHA-256. The Worker requires a matching R2 stored SHA-256 checksum before serving.

## Portable application

No new portable application was built. The existing public v0.2.0 ZIP was inspected, but its source, lockfile, PyInstaller specification, and reproducible build inputs were not found. Its embedded GPL/LGPL obligations and unsigned executables prevent a new certification. See `PORTABLE_SOURCE_AUDIT.md` and `OPEN_SOURCE_LICENSE_AUDIT.md`.

## Security remediation

All five findings from original scan `975a2ce9-51d8-4310-9e2e-7aaee8a3ab76` were addressed in candidate code:

1. Caller-selected OpeningDB ZIP tiers were removed and the unused anonymous ZIP route was retired before body/R2 access.
2. GameSearch metadata is encoded at HTML sinks and PGN URLs are allowlisted before rendering or fetch.
3. Portable downloads fail closed unless R2's validated SHA-256 matches the reviewed digest.
4. Anonymous server Polyglot work was removed; the route is a `410` tombstone.
5. Public release staging rejects risky extensions and file signatures unless the exact path and SHA-256 are approved.

Independent pre-edit and post-patch reviews were performed. The final patch review found no residual issue in the five validated paths.

## Verification summary

- Focused candidate Node suite: 49/49 passed.
- Broader changed-file Node regression: 110/110 passed.
- Chromium/Firefox/WebKit Downloads and Polyglot browser suite: 27/27 passed.
- Navigation/home browser run: 27/28 passed; one pre-existing Endgame Trainer visibility assertion remains reproducibly failing and is unrelated to this candidate.
- Public release audit: passed for the committed-tree inventory before candidate commit.
- Supply-chain policy: 511 runtime files and 186 lock entries passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.

## Release boundary

The implementation is a local candidate only. Production remains locked pending owner review, stored R2 checksum verification, license/provenance disposition for the portable artifact, human QA, and explicit approval of the exact candidate commit.
