# CAISSA Lc0 browser corresponding source

This directory defines the compliance/source package for the isolated Lc0
browser appliance `eae015b2-lc0-0.33.0-maia1100-r3`. It freezes the exact Lc0
source, CAISSA patch series, build inputs, network provenance, licenses, and
notices associated with the technically certified EAE-015B.2 RC3 runtime.

This publication does **not** widen Lc0 access in CAISSA Engine Arena. Lc0
remains limited to `INTERNAL_ONLY`, and the package is not a product release or
legal approval. Current status: `LEGAL_SIGNOFF_REQUIRED_RC3`.

The public package contains:

- Lc0 source commit `482bb4a830287b726ebe7d42f14ab7f5f17c18a0`
  from `https://github.com/jalpp/lc0.js.git`;
- the exact three-patch browser lifecycle series, in documented order;
- the complete CAISSA lab/worker/client build sources and pinned scripts/config;
- the RC3 provenance record and exact patch from the v0.1.1 CAISSA source
  baseline to certified commit `daf3404fbfaf9401783875626bb7eed403c0d9c4`;
- the exact deployed RC3 runtime manifest, SHA-256
  `648daa880e131ebe0b83784b68ce63abb50eee571c0328158cc8a94a7f444d3d`;
- metadata for the separately distributed CSSLab Maia 1100 network;
- the applicable GPL, Maia, ONNX Runtime, and Emscripten license texts;
- a content manifest with SHA-256 and byte count for every member except the
  content manifest itself.

The three patches also appear in their expected reconstructed CAISSA build path
under `caissa-build/`; the copies are byte-identical to the canonical root
`patches/` series.

`source-git-tree.json` additionally records every original Lc0 Git object ID
and file mode, including the seven executable files whose mode a Windows ZIP
extractor cannot preserve.

The Maia network binary is not duplicated. Its exact upstream versioned URL,
1,313,193-byte length, and SHA-256 are recorded in `network/maia-1100.json`.

The RC3 canonical source release is `lc0-browser-source-v0.1.2`. It does not
overwrite v0.1.1. The earlier package remains the immutable corresponding
source for manifest `492c6749...`; v0.1.2 adds the exact CAISSA client and
worker sources required for RC3 manifest `648daa88...`. The upstream Lc0
source, three native patches, WASM, ORT, Maia network, licenses, and notices are
unchanged.

Build the package with:

```powershell
.\scripts\build-source-archive.ps1 `
  -SourceCheckout C:\path\to\clean\lc0.js-at-482bb4a
```

The final external archive digest is recorded in `corresponding-source.json`
and in the release checksum sidecar. The copy of `corresponding-source.json`
inside the archive deliberately leaves the enclosing archive hash/length null:
an archive cannot contain its own final digest without changing that digest.
`manifest.json` authenticates the archive members; the detached repository
manifest and `.sha256` asset authenticate the archive envelope.

The packager normalizes CAISSA-supplied text files to BOM-free UTF-8 with LF
line endings and exports the Lc0 snapshot with `core.autocrlf=false`. This keeps
the source package identical across clean Windows and Unix checkouts.

