# Game Library Champions · Phase 1 audit and prototype

Status: local prototype only. No deployment, push, production route replacement, external dataset import, or portrait publication is included.

## 1. Current Game Library audit

**Route:** `/game-library` rewrites to `index.html`. `LegacyCanonicalSectionRoutePolicy@1.0.0` resolves it to the `library` section; `js/caissa-navigation.js` keeps the Classic section underneath and calls `LibraryUI.open()`.

**Current files:** `index.html` owns the drawer markup; `caissa-library-ui.js` owns interaction/rendering; `caissa-library.js` owns the domain operations; `caissa-library-db.js` owns persistence; `caissa-library.css` owns presentation. `app.js` contains a separate legacy PGN catalog loader. `pgn/library.json` and `pgn/**` contain its manifest/assets.

**Current data sources:** Personal positions, tags and collections live in browser IndexedDB database `caissa_library`, version 2. Optional sync hooks are rendered for authenticated users. The unrelated public article library at `/library` reads `public/data/blogPosts.json` and is not the Game Library.

**Current PGN storage:** The legacy catalog manifest is `pgn/library.json`; files are under `pgn/world-champions`, `pgn/great-gms`, and `pgn/demo`. The manifest currently exposes 15 entries across six champions, four other players and four demos. Several empty player folders and download tooling describe a larger intended corpus that is not present locally. A separate owner-authorized 597-game Capablanca collection lives at `public/data/pgn/capablanca-games-1901-1941.pgn`.

**Current download path:** Personal Library exports JSON backups and FEN lists by client-created Blob downloads. Current game export uses `app.js::exportPGN()`. Historical PGNs can be fetched directly from their same-origin asset paths; only the Capablanca public collection has a dedicated released download link.

**Current open-in-reader flow:** No reusable Game Library → Reader API exists. The legacy selector flow fetches a selected PGN and parses its first game into the main CAISSA board. The web replayer at `/watch/game-replayer` is hardcoded to the Capablanca collection through `integrations/chessbase-pgn-replayer.html`. The Windows CAISSA PGN Reader is a prelaunch portable release and accepts local files, but no browser deep-link or registered protocol is defined.

**Current search/filters:** The personal drawer searches saved positions by title/source/author and filters tags, favorites, engine reports and collections. Its Games tab lists saved game collections. The historical `pgn/library.json` loader used category/player/file dropdowns, but those element IDs are not rendered in `index.html`, so initialization intentionally exits early.

**Current mobile state:** The personal library is a slide-out panel with responsive CSS and remains covered by navigation/browser regression tests. This phase does not redesign it or begin the archive’s mobile season. The prototype includes defensive small-screen containment only.

**Dependencies:** Browser IndexedDB; existing CAISSA navigation and auth/sync globals; `chess.js` through the main app for legacy parsing; the ChessBase-hosted replayer runtime for `/watch/game-replayer`; static same-origin PGN assets.

**Technical debt:** “Library” currently names three different concepts (personal drawer, historical PGN catalog, public articles). The historical manifest and the personal drawer are not connected. Legacy PGN parsing is embedded in `app.js`, uses DOM selectors as its API, and intentionally chooses only the first game from a multi-game file. The web reader is collection-specific. Historical asset completeness and provenance are inconsistent, and `pgn/README.md` describes downloads that are not in the worktree.

## 2. PGN Reader integration audit

- Web route: `/watch/game-replayer`.
- Web handoff: none; the wrapper is hardcoded to `/data/pgn/capablanca-games-1901-1941.pgn`.
- Multi-game support: verified in the ChessBase wrapper for the Capablanca file. The legacy main-app loader can split a multi-game PGN but selects only the first game.
- Browser open behavior: same-origin page embeds the wrapper in a sandboxed iframe and falls back to retry/download after failure.
- Desktop Reader: Windows x64 portable RC1, prelaunch. It can open/paste local PGN and browse albums/games. The website has no safe launch protocol or direct file handoff.
- Download: same-origin static asset links are technically available; the prototype exposes only files already in the repository.

### Canonical future action

`Open in PGN Reader` should resolve an allowlisted collection ID, never raw PGN text or an arbitrary URL:

```js
CaissaPgnReader.open({ collectionId, gameId: null, target: 'best-available' })
```

The adapter should choose a web route such as `/watch/game-replayer?collection=<id>` or a future registered desktop protocol. The server/reader must resolve the ID through the static collection manifest. Parsing remains reader-owned. Until that contract exists, the prototype enables the action only for the already certified Capablanca reader and labels every other reader action pending.

## 3. Proposed architecture

Phase 1 uses static ES-module data in `js/game-library/championship-archive-data.js`. This is sufficient for a curated v1, is testable without a database, and preserves entity boundaries:

- `Champion` owns identity, display metadata and referenced reign/collection IDs.
- `Reign` owns dates, lineage, transition pointers and summary counts.
- `ChampionshipEvent` owns historical title events, including tournament, forfeit, aborted-match, split and reunification formats.
- `PGNCollection` owns an approved asset, provenance, completeness signal and reader/download capability.

The UI resolves IDs at render time and fails validation when IDs duplicate or references do not resolve.

## 4. Champion and reign schema

```js
Champion { id, order?, displayName, country?, initials, summary, reignIds[], collectionIds[]?, parallelOnly? }
Reign { id, championId, startYear, endYear?, lineage, wonEventId?, lostEventId?, splitEventId?, reunifiedEventId?, endedBy?, defenseCount, championshipMatchCount, eventIds[]? }
```

## 5. Championship event and collection schema

```js
ChampionshipEvent { id, year, title, championId?, challengerId?, participantIds[]?, winnerId?, loserId?, score?, location?, format, lineage, classification, pgnCollectionId?, note?, verification, source }
PGNCollection { id, championId?, eventId?, title, gamesCount, asset, downloadable, readerCompatible, readerHref?, provenance }
```

## 6. Split-title handling

The model never assigns one flat champion for 1993–2006. It stores `classical` reigns (Kasparov → Kramnik) and `fide` reigns (Karpov → Khalifman → Anand → Ponomariov → Kasimdzhanov → Topalov) concurrently. `wcc-2006-reunification` joins the tracks and creates Kramnik’s `reunification` reign. The prototype renders both tracks explicitly.

## 7. Historical coverage and verification

The primary mural covers the 18 official champions from Wilhelm Steinitz through current champion Gukesh Dommaraju. Transition events cover each change of the primary crown. Special structured events cover the 1948 five-player tournament, Fischer’s 1975 default, the 1984 aborted Karpov–Kasparov match, the 1993 split, the FIDE knockout/tournament era and the 2006 reunification.

Primary references are FIDE and the FIDE Open Chess Museum. Before publication, nationality labels, title-defense totals and match totals need an independent editorial pass. The prototype does not use external biography copy or unlicensed portraits.

## 8. Prototype

Local URL: `http://127.0.0.1:8000/game-library/champions`

The desktop-first screen uses a restrained black, parchment and gold system. A large editorial title leads into era navigation and a continuous horizontal champion mural. Generated monogram portraits intentionally reserve the future image area. Champion details open in an accessible native dialog; Fischer and Karpov have enough event and PGN depth to validate the architecture. The split era is shown as two parallel tracks that merge in 2006.

## 9. Open questions

1. Should the long-term product preserve `/game-library` for personal saves and name the archive `/champions`, or should personal saves move under a “My Library” sub-route?
2. Should title counts treat drawn-retention matches and aborted 1984 separately from completed defenses?
3. Which portrait license/credit standard will CAISSA accept?
4. Should the first import prioritize complete title-match PGNs or complete champion-career PGNs?
5. Should the future reader handoff prefer web, desktop, or prompt when both are available?

## 10. Recommended Phase 2

Approve the visual direction and route naming first. Then perform a second-source editorial verification, add an allowlisted reader collection registry, import one legally reviewed complete match collection (recommended: Fischer–Spassky 1972 or Karpov–Korchnoi 1978), and replace monograms only after portrait rights are recorded. After those decisions, integrate archive discovery into navigation without removing the personal-library drawer.
