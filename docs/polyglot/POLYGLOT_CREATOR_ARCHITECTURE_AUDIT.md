# Polyglot Opening Book Creator Architecture Audit

Status: PGT-001 complete  
Baseline: `ac157ae2cc1d1ebc2c14fcd1927ce426f17ed5b6`

## Public route and shell

- `/tools/polyglot` is the canonical public route and resolves to `polyglot.html` in both `server.js` and `vercel.json`.
- `polyglot.html` owns the SEO metadata, page markup, tool form, educational content, and script/style entry points.
- The page uses the shared CAISSA standalone shell through `js/caissa-standalone-sidebar.js`, with `polyglot` as the active navigation item.
- The shared locale runtime loads before the sidebar, but the Polyglot page body has no page-specific i18n adapter at this baseline.

## A. Functional boundary

| Concern | Owner | Existing contract |
| --- | --- | --- |
| File selection | `polyglot.html`, `js/polyglot-tool.js` | One required `.pgn` file; browser accept hint includes supported PGN/text MIME types. |
| Client validation | `js/polyglot-tool.js` | Requires a file, `.pgn` extension, and at most 25 MB. |
| Build options | `polyglot.html`, `js/polyglot-tool.js` | Maximum plies 1–1024, minimum occurrence count 1–1000, side `both`, `white`, or `black`. |
| Upload | `js/polyglot-tool.js` | Same-origin JSON `POST /api/polyglot/build`; PGN text and existing option fields only. |
| API protection | `api/polyglot/build.js` | CORS/method gate, 25 MB body boundary, eight builds per ten minutes per client IP, 90-second build deadline, no-store response. |
| PGN parsing and BIN generation | `api/_lib/polyglot-builder.js` | Replays valid games, aggregates position/move records, filters by existing controls, writes sorted standard 16-byte Polyglot entries. |
| Build log | `js/polyglot-tool.js` | Appends timestamped ready/start/info/error/success lines to `#buildLog`. |
| Download | `js/polyglot-tool.js` | Creates an object URL from the successful response, retains the named Download BIN link, and starts one automatic browser download. |
| Portable app | `polyglot.html` | External download remains the approved versioned CAISSA portable ZIP. |

The presentation work must not change these values, request fields, service boundaries, response headers, parsing behavior, rate limits, or download behavior.

## B. Educational boundary

The single `.poly-education` section currently follows the tool in the same vertical column. It owns five useful sections and one related-resources navigation:

1. What Is a Polyglot Opening Book?
2. What Is a BIN File?
3. PGN vs Polyglot BIN
4. How to Use the CAISSA Polyglot Tool
5. Important Compatibility Notes
6. Links to the detailed Polyglot guide, Opening Database, ECO codes, and CAISSA blog

PGT-002 will move this one source of truth into a dedicated Help column. It must not clone, truncate, or leave a second copy below the tool.

## C. Visual and layout boundary

- `css/polyglot-tool.css` owns the wallpaper treatment, glass page card, content cards, controls, log, educational typography, and responsive rules.
- `.poly-container` currently caps every tool and Help section at 960 px and centers them in one long vertical flow.
- `.polyglot-card` caps the complete page at 1050 px, so there is no independent tool/Help workspace.
- At 900 px and below the page reduces padding and makes related links a vertical grid. The existing form grid uses `auto-fit`, but Help is still part of the same long column.
- The page depends on the shared UX-012 mobile drawer; Polyglot layout rules must not modify shared drawer selectors or state.

## Accessibility baseline

- Form controls have native label associations and minimum 44 px sizing.
- Buttons, inputs, selects, and resource links have visible focus treatment.
- Help headings have stable `aria-labelledby` relationships.
- The build log is visually identifiable but lacks explicit status/log live-region semantics.
- Dynamic client messages and page content are English-only at baseline.

## Approved implementation boundary

PGT-002 through PGT-005 may change only `polyglot.html`, `css/polyglot-tool.css`, the page adapter in `js/polyglot-tool.js`, shared EN/ES/PT catalog entries, and focused tests. Backend files remain unchanged unless a separately demonstrated functional defect requires otherwise. Desktop will use a flexible main-tool column and a readable independent Help column; mobile will stack Tool then Help in natural document order.
