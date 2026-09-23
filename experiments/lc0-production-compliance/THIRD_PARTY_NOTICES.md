# Third-party notices and redistribution inventory

## Lc0 browser runtime

- Project: Lc0 / `jalpp/lc0.js`
- Source: `https://github.com/jalpp/lc0.js.git`
- Commit: `482bb4a830287b726ebe7d42f14ab7f5f17c18a0`
- Upstream: `https://github.com/LeelaChessZero/lc0.git`
- License: GPL-3.0-or-later
- License text: `LICENSES/lc0-GPL-3.0-or-later.txt`
- Local modifications: the ordered patch series listed in
  `corresponding-source.json`, plus the CAISSA browser worker/client sources.
- Copyright: the Lc0 contributors identified by the pinned source history.
- Redistribution status: modified corresponding source included in full in the
  source archive; runtime binary distribution remains subject to human/legal
  approval.

## Maia 1100 network

- Project: CSSLab Maia Chess
- Repository: `https://github.com/CSSLab/maia-chess`
- Commit: `37de81e2bef89336e03266b3b5f7e1155ba68f5d`
- Network: `https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1100.pb.gz`
- Network SHA-256: `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`
- License declared by the pinned project: GPL-3.0
- License text: `LICENSES/maia-GPL-3.0.txt`
- Copyright: the Maia Chess authors and contributors identified by the pinned source.
- Redistribution status: the network binary is not duplicated in this archive;
  its versioned upstream distribution URL and integrity metadata are included.

Human legal review must confirm that the project license covers redistribution
of the released network weights in the intended production context.

## ONNX Runtime Web

- Project: Microsoft ONNX Runtime
- Package: `onnxruntime-web@1.27.0`
- Source package: `https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.27.0.tgz`
- Source repository: `https://github.com/microsoft/onnxruntime/tree/v1.27.0`
- License: MIT
- License text and Microsoft copyright notice:
  `LICENSES/onnxruntime-MIT.txt`
- Redistribution status: the certified runtime redistributes the WebAssembly
  loader/runtime; license and source reference are included.

## Emscripten

- Project: Emscripten
- Version: `3.1.64`
- Source: `https://github.com/emscripten-core/emscripten/tree/3.1.64`
- Declared license expression: MIT AND Apache-2.0 WITH LLVM-exception
- Upstream license/notices: `LICENSES/emscripten.txt`
- Redistribution status: Emscripten-generated support code is present in the
  certified runtime; the upstream license/notice bundle is included.

## chess.js

- Project: chess.js
- Version: `1.4.0`
- Source package: `https://registry.npmjs.org/chess.js/-/chess.js-1.4.0.tgz`
- Source repository: `https://github.com/jhlywa/chess.js/tree/v1.4.0`
- Copyright: Copyright (c) 2025, Jeff Hlywa
- License: BSD-2-Clause
- License text: `LICENSES/chess.js-BSD-2-Clause.txt`
- Redistribution status: bundled in the certified browser client. The exact
  root/lab module resolution graph is reproduced for byte identity.

## Build-only dependencies

Meson 1.8.3 (Apache-2.0; `https://github.com/mesonbuild/meson/tree/1.8.3`),
Ninja 1.11.1.4 (Apache-2.0;
`https://github.com/ninja-build/ninja/tree/v1.11.1`), and esbuild 0.28.1
(MIT; `https://registry.npmjs.org/esbuild/-/esbuild-0.28.1.tgz`) are pinned
build tools and are not redistributed as runtime libraries. Their copyrights
remain with their respective authors and contributors.

No third-party runtime dependency is left unidentified in this compliance
package. Human/legal review remains required to confirm the license analysis,
attribution placement, Maia redistribution terms, and retention policy.

