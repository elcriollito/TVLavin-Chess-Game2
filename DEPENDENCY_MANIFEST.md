# Candidate Dependency Manifest

The Downloads/Polyglot candidate adds no npm dependency. It uses the repository's existing `chess.js` 1.4.0 runtime under BSD-2-Clause and developer-only `python-chess` 1.11.2 for independent validation. The complete lockfile contains 186 package entries; exact license counts and direct dependency versions are recorded in `OPEN_SOURCE_LICENSE_AUDIT.md`.

The existing portable v0.2.0 archive contains CPython 3.14, PyInstaller 6.18.0, python-chess/chess 1.11.2, PySide6 6.10.2 / Qt 6.10, OpenSSL 3.x, and additional bundled native components. Its exact reproducible dependency graph is unavailable because source/build inputs were not found.
