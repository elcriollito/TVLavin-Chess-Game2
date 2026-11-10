# CAISSA Downloads & Polyglot Expansion — Candidate Notes

Status: local release candidate; not published.

## Added

- Canonical `/downloads` software catalog with EN/ES/PT localization, accurate product states, FAQ content, structured data, and responsive design.
- Browser-local PGN-to-Polyglot conversion in a dedicated Web Worker with progress and cancellation.
- Streaming PGN splitting, canonical Polyglot hashing and move encoding, deterministic output, and memory/input ceilings.
- Portable artifact identity and release-staging integrity controls.

## Changed

- `/vault` becomes a candidate legacy redirect to `/downloads`.
- Primary navigation labels the destination as Downloads.
- `/api/polyglot/build` is retired with `410 Gone`; PGNs are not uploaded during normal conversion.
- Unavailable historical v1.0.0 artifacts are not advertised as releases.

## Known limitations

- Browser conversion is capped at the tested 25 MiB ceiling and can be slow on large repetitive inputs.
- The existing portable v0.2.0 source and reproducible build inputs are unavailable; embedded license obligations and unsigned executables keep certification pending.
- The existing R2 object must expose the approved stored SHA-256 before the hardened Worker can be deployed.
- VirusTotal verification is pending and no sample was uploaded.

Production deployment, merge, public upload, and announcement are not authorized by these notes.
