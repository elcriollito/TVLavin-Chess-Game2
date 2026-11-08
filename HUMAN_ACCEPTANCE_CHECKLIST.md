# Human Acceptance Checklist

Record only `PASS`, `FAIL`, `BLOCKED`, or `NOT TESTED`.

| ID | Check | Status | Notes |
|---|---|---|---|
| HQA-01 | Downloads desktop: layout, text, current/future product states, exact v0.2.0 checksum | NOT TESTED | |
| HQA-02 | Downloads mobile: 320 px navigation, cards, FAQ, no horizontal overflow | NOT TESTED | |
| HQA-03 | Online converter: choose a small PGN, observe local progress, download valid BIN | NOT TESTED | Verify DevTools shows no `/api/polyglot/build` request |
| HQA-04 | Large PGN conversion: supported input completes; cancel produces no output | NOT TESTED | Do not exceed 25 MiB online ceiling |
| HQA-05 | Portable application startup | NOT TESTED | Existing unsigned v0.2.0 only; certification pending |
| HQA-06 | Portable large-file test | NOT TESTED | Compare with recorded 25/50 MiB evidence |
| HQA-07 | BIN interoperability | NOT TESTED | Open output with an independent Polyglot reader and verify legal moves |
| HQA-08 | SHA-256 verification | NOT TESTED | `Get-FileHash -Algorithm SHA256` must match manifest |
| HQA-09 | VirusTotal report | BLOCKED | No indexed report; no upload performed |
| HQA-10 | Final owner approval of exact candidate commit | NOT TESTED | Required before merge/deploy/publish |

Also verify keyboard navigation, EN/ES/PT switching, Chrome, Edge, Firefox, mobile viewport behavior, legacy `/vault` redirect, and that future products have no download links.
