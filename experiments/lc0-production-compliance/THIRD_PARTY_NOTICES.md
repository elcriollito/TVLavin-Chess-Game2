# Third-party notices

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

## Maia 1100 network

- Project: CSSLab Maia Chess
- Repository: `https://github.com/CSSLab/maia-chess`
- Commit: `37de81e2bef89336e03266b3b5f7e1155ba68f5d`
- Network: `https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1100.pb.gz`
- Network SHA-256: `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`
- License declared by the pinned project: GPL-3.0
- License text: `LICENSES/maia-GPL-3.0.txt`
- Copyright: the Maia Chess authors and contributors identified by the pinned source.

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

## Emscripten

- Project: Emscripten
- Version: `3.1.64`
- Source: `https://github.com/emscripten-core/emscripten/tree/3.1.64`
- Declared license expression: MIT AND Apache-2.0 WITH LLVM-exception
- Upstream license/notices: `LICENSES/emscripten.txt`

## Build-only dependencies

Meson 1.8.3 (Apache-2.0), Ninja 1.11.1.4 (Apache-2.0), and esbuild
0.28.1 (MIT) are pinned build tools and are not shipped as runtime libraries.
`chess.js@1.4.0` (BSD-2-Clause) is used by the isolated validation lab and is
not included in the runtime appliance manifest.

