# CAISSA Security Scan & Remediation Report

Date: 2026-11-08

Original scan: `975a2ce9-51d8-4310-9e2e-7aaee8a3ab76`

Original baseline: `ce9a5198a8d0618d32fa9c34c500267ad89efc85`

## Recovery evidence

Windows `LongPathsEnabled` was verified as `1`. Ordinary unprefixed `os.stat()` from the scanner's Python 3.14 runtime succeeded on the original 265-character checkpoint path, whose exact size was 28,767 bytes. All preserved checkpoints matched their SHA-256 names, coverage was complete, and all five findings retained evidence, severity, validation, attack path, and remediation data.

The supported completion operation was invoked exactly once with the original scan ID and handoff token. The scan sealed at `2026-11-08T05:51:01.635605Z`. Database status is `complete`; report, manifest, findings, coverage, SARIF, and threat-model artifacts exist. Manifest digest: `sha256:5b7511338ca1aafbdea7be69eeac0dc3eeae6f7174cd89fa017de83a5675aa6c`.

## Remediation matrix

| Finding | Root cause | Affected code | Impact/exposure | Candidate correction | Regression evidence | Priority | Dependencies |
|---|---|---|---|---|---|---|---|
| `resource-exhaustion.unsigned-tier-zip` | Public query/header selected an unverified premium workload and buffered R2 objects plus a ZIP | `downloads-worker/worker.js` | Anonymous memory, R2, CPU, and cost exhaustion | Removed caller tier; retired ZIP route with `410` before body/R2 access | Direct POST test asserts zero bucket reads | High | Future ZIP service needs verified entitlement and durable budget |
| `cross-site-scripting.gamesearch-metadata` | Raw PGN metadata and URL values reached `innerHTML` | `js/opening-database.js` | Stored same-origin script execution after malicious index publication | Final-sink encoding plus exact downloads-origin/path URL validation for render and fetch | Static sink guards and browser regression coverage | High | CSP nonce/hash migration remains defense-in-depth work |
| `resource-exhaustion.anonymous-polyglot-build` | Anonymous Vercel parsing/aggregation behind an instance-local limiter | `api/polyglot/build.js`, `js/polyglot-*` | Serverless memory/CPU/cost denial | Body-independent `410`; local streaming Worker with independent 25 MiB cap | Unit and Chromium/Firefox/WebKit build/cancel/oversize tests | High | None for local conversion |
| `download-integrity.unbound-portable-artifact` | Fixed R2 key lacked enforced reviewed digest | `downloads-worker/worker.js` | Trojan replacement served under trusted immutable URL | Pinned size, ETag, SHA-256; require matching `object.checksums.sha256` | Missing/wrong checksum returns `503`; headers emitted only after verification | High | Existing R2 object must carry stored SHA-256 before deployment; provenance/signing still pending |
| `release-integrity.opaque-artifact-denylist` | Public staging admitted every tracked path unless a finite denylist recognized it | `scripts/build-public-release.mjs`, `PUBLIC_RELEASE_ARTIFACT_MANIFEST.json`, `.vercelignore` | Unapproved opaque content could cross the release boundary | Positive manifest binds every public path and SHA-256; `.vercelignore` is generated from the same allowlist; extension/magic checks remain defense in depth | Unknown opaque file, `.iso`/`.img`/`.vhd`/`.vhdx`, deep ISO magic, manifest drift, and output re-audit tests | High | Regenerate and review the manifest for each frozen candidate commit |

## Final-candidate scan binding

The fresh canonical scan is an external sealed attestation and must be run only after the candidate commit is frozen. Its scan ID, digest, and result are recorded in the final engineering handoff rather than modifying this commit after it has been scanned.

## Residual security gates

- Confirm the existing R2 object exposes the approved stored SHA-256 before any Worker deployment.
- Do not treat unsigned, non-reproducible v0.2.0 binaries as newly certified.
- VirusTotal remains hash-lookup-only/PENDING; no unpublished sample was uploaded.
- Production deployment and publication require explicit owner approval.
