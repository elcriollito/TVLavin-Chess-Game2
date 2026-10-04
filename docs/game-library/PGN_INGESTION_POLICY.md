# CAISSA PGN ingestion and redistribution policy

Status: Phase 3 release gate, 2026-10-04

## Principle

A chess game as a sequence of moves can be factual, while a PGN file may also contain protected annotations, commentary, compilation choices, database structure, or other expressive material. A statement that a file is free to download is not, by itself, permission to redistribute it. The repository's MIT license covers repository code where applicable; it does not retroactively license third-party PGN data.

This is an operational policy, not legal advice. Unclear assets stay non-public until the repository owner or counsel approves the evidence.

## Required registry statuses

- `VERIFIED_REDISTRIBUTABLE`: written license, public-domain basis, or owner authorization is recorded. A public asset path and reader/download capabilities may be enabled.
- `LINK_ONLY`: the source permits linking but not hosting. No local asset or reader handoff.
- `NEEDS_REVIEW`: provenance exists but redistribution rights are not established. No local asset or reader handoff.
- `INTERNAL_TEST_ONLY`: retained solely in a deployment-excluded QA area. It may be served only by an explicit loopback allowlist.
- `REJECTED`: rights, integrity, security, or provenance failed review. Do not ingest or expose.

Only `VERIFIED_REDISTRIBUTABLE` entries may have a production `localAsset`, `downloadable: true`, or `readerCompatible: true`.

## Mandatory provenance record

Every candidate needs: stable collection ID; source name and HTTPS URL; retrieval date; source and derivative SHA-256 checksums; game count; license/permission text and URL or owner authorization; attribution; transformations; validation result; reviewer; and final status. Preserve source bytes outside public output when retention is allowed. Never infer rights from the hosting site's availability or from a package-level software license.

## Review and ingestion gates

1. Identify the exact source and save evidence of its terms on the retrieval date.
2. Separate factual move data from annotations, prose, images, and database/editorial structure.
3. Assign a provisional status before copying any asset into a public directory.
4. Validate encoding, PGN syntax, headers, move legality, count, expected participants/results, and unsafe embedded content.
5. Record all transformations and both source/derivative checksums.
6. Obtain explicit redistribution authority when the source terms do not clearly grant it.
7. Have a second reviewer approve provenance, integrity, and the registry flags.
8. Publish only via the fixed registry allowlist; never accept a URL or filesystem path from the browser.
9. Revoke public capabilities and move the asset out of deployable paths immediately if evidence changes.

## Current repository classification

| Asset group | Source | License evidence | Status | Current use | Publishable | Action required |
|---|---|---|---|---|---:|---|
| `capablanca-complete` (597 games) | Repository owner | Recorded owner authorization for the CAISSA Game Replayer | `VERIFIED_REDISTRIBUTABLE` | Public reader and download | Yes | Retain provenance/checksum and re-review if the asset changes. |
| `fischer-spassky-1972-complete` (21 games) | PGN Mentor event download | Free-download statement; no explicit redistribution license located | `INTERNAL_TEST_ONLY` | Loopback QA reader only | No | Obtain written permission or a clearly applicable license; then repeat review before changing status. |
| Six registered legacy one-game collections | Legacy `pgn/README.md` attribution to PGN Mentor | No collection-specific license or permission recorded | `NEEDS_REVIEW` | Historical metadata/status only; no reader or download | No | Establish per-asset source, permission, checksum and validation evidence. |
| Other PGNs under `pgn/` (not registered for the archive) | Mixed legacy repository catalog | No collection-specific evidence found in the audit | `NEEDS_REVIEW` | Existing repository inputs; not attached as archive assets | No | Inventory individually before registry insertion; do not infer rights from the PGN tooling package's MIT license. |
| `data/pgn_samples`, smoke fixtures, and Opening Database inputs | Internal test/build inputs | Not assessed for Champions redistribution | Out of Champions scope / internal fixtures | Tests and database builds | No | Keep outside the archive pipeline. Opening Database is unchanged by Phase 3. |

## Prepared future-match queue (not imported)

Karpov–Korchnoi 1978, Kasparov–Karpov 1985, Kramnik–Kasparov 2000, and Anand–Topalov 2010 are candidates only. Each must start at source acquisition and rights review; no existing historical fact record or one-game excerpt makes a complete match collection eligible.

## Production controls

The browser registry defaults to production mode. Non-approved entries expose descriptive metadata and a status badge but no path or capability. Internal QA mode is derived only from a loopback hostname. The local server maps a fixed collection ID to a fixed file, rejects unknown IDs and methods, adds `no-store`/`noindex`, and the entire `internal-assets/` tree is excluded from Vercel output.

## Reference framework

- U.S. Copyright Office guidance for games distinguishes game ideas/methods from copyrightable expression: <https://www.copyright.gov/register/tx-games.html>
- EU Directive 96/9/EC provides the European legal framework for database protection: <https://eur-lex.europa.eu/legal-content/en/ALL/?uri=CELEX%3A31996L0009>
- PGN Mentor's download page describes files as freely downloadable but does not state a redistribution license: <https://www.pgnmentor.com/files.html>
