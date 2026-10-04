# Game Library Champions — Phase 3 handoff

Date: 2026-10-04

Branch: `feature/arena-redesign`

Base: `281c37909fb69e9bfa1fbd1c9baeba53b3719f6f`

## Delivered

- Canonical `CaissaPgnReader.open({ collectionId, gameId, target, returnTo })` handoff.
- Strict internal return-state allowlist for archive view, lineage filter, champion, reign, event, document scroll and mural offset.
- Exact archive restoration after using the reader, including reopening the selected champion/event dialog.
- Lightweight chronological Championship Matches view with All, Undisputed, Classical, FIDE and Special transitions filters.
- Responsive four/three/two/one-column museum-style champion grid, using original CAISSA styling and license-status placeholders rather than third-party portraits.
- In-flow champion detail panel inserted immediately after the selected champion card or match, with reign, lineage, events and PGN collection cards together.
- Honest PGN badges: available, internal QA, pending review, or historical data only.
- Production-safe registry with explicit rights statuses and capability gates.
- Fischer–Spassky 1972 moved out of the public tree into `internal-assets/`; loopback-only fixed-ID QA route; Vercel exclusion.
- Formal ingestion/redistribution policy and present-asset classification in `docs/game-library/PGN_INGESTION_POLICY.md`.
- No additional PGNs imported. Opening Database and personal Game Library code/data remain unchanged.

## Rights decision

Capablanca remains the sole `VERIFIED_REDISTRIBUTABLE` collection. The complete Fischer–Spassky file is `INTERNAL_TEST_ONLY`: the source advertises free downloads, but no explicit redistribution license was found. Legacy one-game files remain `NEEDS_REVIEW`. Non-approved records retain historical metadata but expose neither public asset paths nor reader/download capabilities.

## Verification

- PGN validator: 21 Fischer–Spassky games, SHA-256 `562adc8a35bcd62d7c0ad0974de9a75e662fd808f704915cfe2ea0f00bd97c24`, zero malformed games.
- Node: 18/18 passed (`game-library-champions` + `game-replayer-gateway`).
- Lint: `lint:championship-archive` passed.
- Chromium: 7/7 passed.
- WebKit: 6 passed, 1 intentionally skipped by the pre-existing provider-runtime test guard.
- Personal library regression preserves the test IndexedDB collection and position byte-for-byte across archive navigation.
- Tests ran against a clean server instance on `127.0.0.1:8017` because an older local process already occupied port 8000.

## Visual evidence

- `artifacts/game-library-champions-phase3/champions-1920.png`
- `artifacts/game-library-champions-phase3/matches-1440.png`
- `artifacts/game-library-champions-phase3/restored-fischer-1440.png`

The structural inspiration was the FIDE Open Chess Museum's Champions index (prominent archive heading, clear champion navigation, and portrait-card rhythm). No FIDE layout, copy, portraits, or other assets were copied: <https://museum.fide.com/champions?type=men>.

## Publication gate

Do not promote Fischer–Spassky to production until explicit redistribution permission or a clearly applicable license is recorded, provenance is re-reviewed, and the registry status is deliberately changed to `VERIFIED_REDISTRIBUTABLE`. No deployment, push, or merge was performed in Phase 3.
