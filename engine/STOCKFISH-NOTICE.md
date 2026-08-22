# Bundled Stockfish Worker notice

`stockfish-working.js` is the browser Worker build distributed as
`stockfish.js@10.0.2`. It was retrieved from that npm release through jsDelivr
and introduced in repository commit `f8659abcf87ba914a7bafe7e04cb15b8a0625018`.

- SHA-256: `723fda70117bfa8d5053a7bc4ae50cdc96dc9e3fd41b57627e4dfa0a0025957a`
- Upstream: <https://github.com/niklasf/stockfish.js>
- Stockfish authors: Tord Romstad, Marco Costalba, Joona Kiiski, Gary Linscott,
  and other contributors
- JavaScript/WebAssembly compilation: Niklas Fiekas using Emscripten and Binaryen
- License: GNU General Public License version 3
- License text: <https://www.gnu.org/licenses/gpl-3.0.txt>

The copyright and license header remains embedded at the beginning of the
distributed Worker. CAISSA does not download this engine from a CDN at runtime.

## PGN Replayer engine

The PGN Replayer uses the official Stockfish.js 18 lite single-threaded browser
distribution from the `nmrugg/stockfish.js` `v18.0.0` release. Both files are
served locally from `assets/vendor/stockfish/18.0.0/`; no runtime CDN is used.

- JavaScript SHA-256: `2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe`
- WebAssembly SHA-256: `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1`
- Upstream browser distribution: <https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0>
- Upstream engine: <https://github.com/official-stockfish/Stockfish>
- License: GNU General Public License version 3
- Local license text: `assets/vendor/stockfish/18.0.0/Copying.txt`
