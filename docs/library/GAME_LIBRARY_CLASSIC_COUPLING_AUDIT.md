# Game Library / Classic coupling audit

Status: LIB-001 complete  
Audited baseline: `1c1d81a12dff1cd176a50d0718b1b246cab8f4d6`

## Finding

`/game-library` is mounted on top of CAISSA Classic. It does not use an iframe and it does not depend on Classic for Library data.

The coupling is created by three explicit presentation decisions:

1. `server.js` and `vercel.json` route `/game-library` to `index.html`.
2. `js/caissa-navigation.js` maps the logical `library` section to `#yahooClassicSection`, activates that section, and then opens the Library panel.
3. `#libraryPanel` in `index.html` is a fixed, left-positioned slide-out (`caissa-library.css`). The panel therefore sits above the already-rendered Classic/Chess Room surface.

The temporary public presentation in `js/caissa-game-library-presentation.js` hides the functional children of that panel and shows “Under Construction”, but does not remove the Classic host underneath it.

## Current entry points

- `/game-library` -> `index.html`: personal positions/games Library presentation.
- `/library` -> `library.html`: separate editorial articles Library. This route and page are unrelated and must remain unchanged.
- `/yahoo-classic` -> `yahoo-classic.html`: authoritative Classic route; it must remain unchanged.

## Library-owned data and behavior to preserve

- `caissa-library-db.js`: IndexedDB database `caissa_library` v2; positions, tags, collections, sync metadata, and deletions stores.
- `caissa-library.js`: position and game-collection CRUD, FEN validation/normalization, deduplication, filtering, tag handling, JSON/FEN import-export, statistics, and active-game collection state.
- `caissa-library-ui.js`: Positions/Games tabs, search, tags, pagination, empty states, collection navigation, Backup/Import, position actions, and optional sync UI.
- `query-engine.js` and `query-engine-ui.js`: advanced in-memory position filters.
- `position-forge.js` and `position-forge-ui.js`: optional position tooling used from saved-position actions.
- `caissa-sync.js` plus auth/access modules: optional cloud synchronization; Library remains usable locally without them.
- `/api/library/push`, `/api/library/pull`, and `/api/library/delete`: server-side sync endpoints.

The primary persistence boundary is IndexedDB, not Classic. Board-dependent actions such as “load position”, “save current position”, and “save current game” integrate opportunistically with the global analysis application when it exists; listing, searching, filtering, importing, exporting, and managing saved records do not require Classic.

## Coupling to remove

- Stop rewriting `/game-library` to `index.html`.
- Remove the `library` -> `yahooClassicSection` host exception from the legacy navigation controller.
- Move the Game Library markup out of the Classic document and into a standalone first-party entry.
- Replace fixed slide-out/overlay geometry with normal document-flow content inside the shared CAISSA standalone shell.
- Do not initialize Classic, Chess Room, FICS lobby, room tables, player lists, or the legacy application bootstrap on `/game-library`.

## Public boundary decision

The existing “Under Construction” status remains authoritative. LIB-002–LIB-006 may correct the route, shell, responsive layout, accessibility, localization, and preserve the recoverable functional Library, but must not publicly claim that incomplete functions are released.

The standalone entry will therefore own both boundaries:

- public mode: first-party CAISSA shell plus the localized Under Construction surface;
- future/internal functional mode: the same first-party shell plus the preserved Library controls and runtime, with no Classic host.

Changing which mode is public is a separate product-release decision and is outside LIB-001–LIB-006.

## Acceptance boundary

Loading `/game-library` must produce a document whose route entry, DOM, scripts, and styles contain no Classic-only host or visual markers. Classic remains available only through its own authoritative route and assets.
