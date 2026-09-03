# UX-009 first-party localization inventory

This audit uses `config/caissa-public-route-inventory.json` as the certified UX-001 source. Its 61 records remain unchanged: 34 primary-navigation records (30 internal and 4 external), 14 additional public canonical routes, 8 redirects, and 5 protected route families.

## Classification rules

- **A — shell:** shared navigation, account controls, and language control; localized by UX-002.
- **B — CAISSA first-party UI:** static and bounded dynamic interface copy; eligible for catalog keys.
- **C — chess/technical terminology:** localized only when natural. CAISSA, CAISSA Classic, Stockfish, Elo, PGN, FEN, ECO, FICS, Playchess, Fritz, Lichess, Polyglot, Bullet, Blitz, CM, FM, IM, and GM remain unchanged.
- **D — names/products:** bot character names, player names, event names, opening names, brands, and product names remain unchanged.
- **E — user/game data:** PGN headers, moves, comments, FEN, imported filenames, game results, ratings, and user content remain unchanged.
- **F — external/legacy:** no automatic content mutation without a separately certified architecture.

## Fully localized in UX-009

| Routes | Architecture | Coverage |
| --- | --- | --- |
| `/play`, `/play/games` | Generated Play v3 document plus shared dynamic shell | Tabs, setup, time controls, colors, strength, actions, status, validation, board utilities, and dialogs |
| `/play/bots` | Play v3 bot panel | Categories, difficulty metadata, controls, descriptions, states, and actions; character names stay unchanged |
| `/play/coach` | Play v3 native Coach panel | Levels, controls, access states, bounded Coach dialogue, and actions |
| `/game-library` | First-party construction presentation inside the main application | Complete visible construction surface |
| `/pgn-replayer` | Independent first-party reader using the shared shell and UX-002 locale | Reader controls, tabs, empty/error states, engine labels, Options/About, album-family UI, collection metadata, and search controls; game data stays unchanged |

## Shell-localized, content pending a later scoped pass

These first-party routes use the current shared shell, so class A is localized. Their class B application/article content was audited but is outside the UX-009 priority implementation to avoid coupling unrelated products to the Play/PGN adapter:

- Main-application sections: `/fics`, `/academy`, `/insights`, `/analyze`, `/spectator-tv`, `/arena`, `/cheater-insight`, `/history`, `/dos-chess`.
- Standalone first-party tools and learning surfaces: `/play-online/playchess`, `/play-online/fritz`, `/puzzles/chessbase-tactics`, `/learn/interactive-diagrams`, `/endgame-trainer`, `/endgame-practice`, `/endgame-library`, `/watch/lichess-tv`, `/watch/live-blitz`, `/watch/live-tournaments`, `/watch/lichess-broadcasts`, `/watch/game-replayer`, `/tools/polyglot`, `/opening-database`, `/eco`, `/vault`.
- Supporting/public surfaces: `/about`, `/database`, `/help`, `/library`, `/premium`, `/roadmap`, `/signin`, `/signup`, `/blog`, `/blog/what-is-a-polyglot-opening-book`, `/blog/who-is-caissa-goddess-of-chess`, `/blog/yahoo-chess-spirit-caissa-classic`.

No claim of full class-B localization is made for these 37 routes. They keep the UX-002 localized shell and English fallback.

## Excluded surfaces

- `/yahoo-classic` is a legacy application with its own stateful lobby, FICS controls, embedded game surface, dialogs, and copy-producing modules. It shares the UX-002 shell but not a clean first-party content translation boundary. UX-009 deliberately does not mutate its internal UI; it requires an independent certification season.
- Facebook, YouTube, Discord, and the feedback `mailto:` are external destinations (class F); only their shared navigation labels belong to CAISSA.
- The 8 redirect records have no independent visible content.
- The 5 protected route families are fail-closed technical boundaries and have no public page content to localize.

## Pending-surface summary

- Full class-B completion in UX-009: 6 canonical routes.
- Shared shell only, class-B content pending: 37 canonical routes.
- Legacy internal application excluded: 1 canonical route (`/yahoo-classic`).
- Non-page/external records excluded: 17 (4 external destinations, 8 redirects, 5 protected records).
- Total certified UX-001 records accounted for: 61.
