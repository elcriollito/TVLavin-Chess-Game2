# Open-Source License Audit

Audit date: 2026-11-07
Scope: CAISSA Downloads/Polyglot candidate and the existing public v0.2.0 portable archive.

## Result

- **Web candidate:** CONDITIONAL PASS. No npm dependency was added. The new converter uses the already-vendored chess.js 1.4.0 under BSD-2-Clause, whose license file is present at `assets/vendor/chess.js/LICENSE`.
- **Existing portable v0.2.0:** BLOCKED. The archive embeds GPL/LGPL components but contains neither corresponding source/build inputs nor a third-party notice/license bundle.
- **Repository-level licensing:** REVIEW REQUIRED. No root `LICENSE` file was found, so the license for CAISSA-authored source is not explicit.

This is an engineering compliance review, not legal advice.

## New web runtime components

| Component | Version/source | License | Use | Distribution obligations | Status |
|---|---|---|---|---|---|
| chess.js | 1.4.0, https://github.com/jhlywa/chess.js | BSD-2-Clause | PGN parsing and legal move replay | Retain copyright, conditions and disclaimer | PASS — vendored license present |
| Polyglot 781-value key table | Fabien Letouzey Polyglot protocol compatibility data; independently checked with python-chess 1.11.2 | Protocol constants; original Polyglot implementation is GPL | Canonical Zobrist interoperability | Provenance disclosure; obtain legal review if policy treats constants as copyrightable expression | REVIEW |
| CAISSA worker/core/UI code | This candidate | CAISSA-authored | Streaming, aggregation, encoding and UI | Governed by repository owner; no root license found | REVIEW |

`python-chess` is used only by `scripts/validate-polyglot.py` as an independent developer-side validator. It is not imported or distributed by the public web runtime.

## Root lockfile inventory

`package-lock.json` contains 186 package entries. Declared license counts:

| License expression | Packages |
|---|---:|
| MIT | 114 |
| Apache-2.0 | 25 |
| BSD-2-Clause | 12 |
| ISC | 12 |
| LGPL-3.0-or-later | 10 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| MPL-2.0 | 2 |
| BSD-3-Clause | 2 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| GPL-2.0 | 1 |
| Unlicense | 1 |
| WTFPL | 1 |
| 0BSD | 1 |
| MIT OR CC0-1.0 | 1 |

The LGPL entries are platform packages for sharp/libvips; `js-dos` 8.5.3 is GPL-2.0. These are pre-existing and not used by the new Polyglot converter. This audit does not recertify every historical product surface.

Direct package inventory:

| Package | Locked version | License | Scope |
|---|---:|---|---|
| @clerk/backend | 2.33.8 | MIT | runtime |
| @mliebelt/pgn-parser | 1.4.19 | Apache-2.0 | runtime |
| @supabase/supabase-js | 2.118.0 | MIT | runtime |
| @vercel/functions | 3.9.9 | Apache-2.0 | runtime |
| adm-zip | 0.6.1 | MIT | runtime |
| chess-openings | 0.1.1 | WTFPL | runtime |
| chess.js | 1.4.0 | BSD-2-Clause | runtime |
| js-dos | 8.5.3 | GPL-2.0 | runtime, pre-existing DOS feature |
| onnxruntime-node | 1.30.0 | MIT | runtime |
| qrcode | 1.5.4 | MIT | runtime |
| stripe | 20.4.1 | MIT | runtime |
| ws | 8.22.0 | MIT | runtime |
| @axe-core/playwright | 4.14.0 | MPL-2.0 | development/test |
| @playwright/test | 1.64.1 | Apache-2.0 | development/test |
| cheerio | 1.2.0 | MIT | development/test |
| jsqr | 1.4.0 | Apache-2.0 | development/test |
| sharp | 0.35.5 | Apache-2.0; binary libvips packages carry LGPL terms | development/test |

## Portable v0.2.0 embedded components

Static PyInstaller inspection established at least:

| Component | Observed version | License/source | Obligation relevant to redistribution | Artifact evidence |
|---|---:|---|---|---|
| CPython | 3.14 | PSF License, https://www.python.org/downloads/ | Preserve notices/license | No notice bundle found |
| PyInstaller | 6.18.0 | GPL-2.0-or-later with bootloader exception, https://pyinstaller.org/en/stable/license.html | Preserve applicable notices; exception permits bundled executables | No notice bundle found |
| chess/python-chess | chess module 1.11.2 | GPL-3.0-or-later, https://github.com/niklasf/python-chess | Distribute complete corresponding source under GPL and license notices for a distributed derivative | Source/offer/license absent — BLOCKED |
| PySide6 / Qt | 6.10.2 / 6.10 | LGPL-3.0/GPL/commercial options, https://doc.qt.io/qtforpython-6/licenses.html | Provide license/notices and satisfy LGPL relinking/replacement and source obligations for the chosen license | Source, offer and notices absent — BLOCKED |
| OpenSSL | 3.x DLLs embedded | Apache-2.0, https://www.openssl.org/source/license.html | Preserve notices/license | No notice bundle found |

The 244 MB GUI also embeds broad Qt modules, FFmpeg libraries and other platform DLLs. Exact transitive versions and license selections cannot be reconstructed reliably without the missing build environment and dependency manifest.

## Required remediation before a portable release

1. Recover the exact portable source commit, PyInstaller spec, dependency lock and build instructions.
2. Determine the intended license for CAISSA-authored portable code and whether it is compatible with python-chess GPL-3.0-or-later.
3. Include complete corresponding source or a compliant written source offer as required.
4. Ship `LICENSE`, `SOURCE_AVAILABILITY`, and a complete `THIRD_PARTY_NOTICES`/license directory with the ZIP.
5. Remove unused PySide6 modules to reduce the surface and make the actual dependency inventory tractable.
6. Rebuild reproducibly, regenerate hashes, and repeat security/functional testing on the exact final bytes.

Until those steps are complete, the existing v0.2.0 download may be described only as an existing public artifact with certification pending; it must not receive a new compliance PASS.
