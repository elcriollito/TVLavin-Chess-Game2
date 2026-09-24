# Lc0 browser runtime RC3 — legal sign-off record

Status: `LEGAL_SIGNOFF_REQUIRED_RC3`

This record covers corresponding-source release `lc0-browser-source-v0.1.2`
for runtime release `eae015b2-lc0-0.33.0-maia1100-r3`. It does not inherit or
extend the human approval previously recorded for v0.1.1.

## Immutable technical record

- certified CAISSA RC commit: `daf3404fbfaf9401783875626bb7eed403c0d9c4`
- runtime manifest SHA-256: `648daa880e131ebe0b83784b68ce63abb50eee571c0328158cc8a94a7f444d3d`
- source archive: `caissa-lc0-browser-corresponding-source-v0.1.2.zip`
- source archive SHA-256: `3ef4c920c0e05536ef26be1e4a47dc5ad2c247e59c4a2145f6f003e5a0506d4a`
- source archive bytes: `1,441,144`
- upstream Lc0 commit: `482bb4a830287b726ebe7d42f14ab7f5f17c18a0`
- upstream native patch series: unchanged, three patches
- Maia 1100, Lc0 WASM, ONNX Runtime, and pthread worker binaries: unchanged

## RC3 source delta

`client.js` is generated with esbuild 0.28.1 from
`experiments/lc0-preview-relay/engine/client-source.js`. Its RC3 source changes
are introduced by commits `9d2b7db`, `a409a37`, `cd5b065`, and `94138d7`.

`lc0-worker.js` is generated with the same pinned esbuild invocation from
`experiments/lc0-browser-lab/src/lc0-worker.js`. Its RC3 source change is
introduced by commit `94138d7`.

Both are CAISSA-authored runtime integration sources distributed in the source
archive under the existing `GPL-3.0-or-later` classification. The exact
baseline-to-RC3 diff and full commit identifiers are included under
`rc3-provenance/` in v0.1.2.

The clean reconstruction produced all eight certified artifacts, total
24,792,351 bytes, manifest SHA-256 `648daa88...`, and a successful tamper
self-test. Technical reproducibility does not constitute legal approval.

## Human review

- [ ] APPROVED
- [ ] REJECTED

Reviewer:

Review date:

Notes:

Until a human completes this section, the controlling result remains
`LEGAL_SIGNOFF_REQUIRED_RC3` and Stage 2A Match/Tournament certification must
not begin.
