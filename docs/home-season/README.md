# CAISSA Home & Experience Season — HOME-001

Started 2026-10-01. Branch: feature/caissa-home-season-2026-10-01.
Base: main at 35c467ac072c01a83d0dd6f1d055a73a9f5eb6e8.

## Scope and ownership

First slice: standalone home.html, css/home/home.css and js/home/home.js.
No changes to existing routes, index.html, app.js, server.js, vercel.json,
Mentor, Scanner, cleanup work, authentication or database state.
Independent clone; no stash, reset or checkout in any other workspace.

## Product direction

Deep black dashboard, restrained violet accents, existing CAISSA identity.
Desktop: left navigation, central discovery, right journey/Chat column.
Mobile: compact launcher, two-column tools, bottom navigation with safe area.
Classic omitted from mobile navigation. Boards are static thumbnails only.
Hero highlights the full puzzle catalog. Every tool link targets current production.
Chess TV uses the canonical /spectator-tv route.
CAISSA Chat is a noninteractive Coming next card; no Mentor implementation here.
Account card is a signup invitation, not a claimed live session or player report.
Recent tools are Home-owned local navigation history, not saved games or training.
No fabricated rating, rank, streak, accuracy or resume position.

## Review and next slices

1. Review desktop and mobile home composition at /home.html in branch preview.
2. Connect the existing account runtime and real puzzle progress through supported
   read APIs. Distinguish signed-in, guest, loading, empty and failed states.
3. Add genuine resume actions only when each tool exposes a supported contract.
4. Coordinate root routing separately: remove the permanent / -> /play redirect,
   add / -> /home.html in Vercel and the local server. Keep index.html as the
   existing tool shell. Audit cache consequences of the previous 308, canonical
   metadata, sitemap, auth return URLs and all route-based tests before release.
5. CAISSA Chat integration belongs to a later coordinated slice after Mentor work
   settles. It must not be advertised as functional until verified.

The first preview is additive and noindex. It must not replace production yet.

## Asset reuse

Thumbnails reference existing read-only Kosal piece assets in the repository.
Font Awesome is loaded locally from the existing vendor distribution.
No changes are made to either source or to Scanner's dataset.

## First checkpoint validation

- JavaScript syntax: passed.
- Local HTML stylesheet/script/logo references: passed.
- Piece thumbnails: all 12 referenced SVG assets exist.
- Diff whitespace: passed.
- Browser QA: pending. Local Playwright has no installed browser and its official
  browser download returned an invalid archive. Cloud Browser blocks localhost.
- GitHub upload authorized by Alexander on 2026-10-01. Upload uses the connected
  GitHub app because this environment has no Git HTTPS write credentials.
- This branch is preview-only; no production merge is authorized.

A local CAISSA_HOME_PREVIEW.html is an offline, self-contained review copy with bundled
fonts, thumbnail pieces, styles and behavior. It is a local review artifact, not part of this remote source commit. Tool links open current production.
The account card is provisional and does not detect an existing signed-in user.
