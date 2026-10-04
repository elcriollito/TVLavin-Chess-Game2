# CAISSA Public Route and Navigation Inventory

Contract: `CaissaPublicRouteInventory@1.3.0`

This document and [the machine-readable inventory](../../config/caissa-public-route-inventory.json) are generated deterministically from the routing and navigation owners. Do not edit either output manually.

## Sources of truth

- `home.html`
- `js/caissa-primary-navigation.js`
- `js/play/play-route-controller.js`
- `middleware.js`
- `server.js`
- `vercel.json`
- `public/sitemap.xml`

## Calculated summary

- Primary navigation entries: 35
- Internal primary pages: 31
- Public canonical routes not in primary navigation: 16
- External destinations: 4
- Redirects: 15
- Protected route families: 5
- Total inventoried records: 71

## Primary navigation

| Position | Group | Label | Canonical destination | Type | Owner |
| --- | --- | --- | --- | --- | --- |
| 1 | play-and-compete | Play | /play | internal-page | CaissaPrimaryNavigation |
| 2 | play-and-compete | CAISSA Classic | /yahoo-classic | internal-page | CaissaPrimaryNavigation |
| 3 | play-and-compete | FICS | /fics | internal-page | CaissaPrimaryNavigation |
| 4 | play-and-compete | Playchess | /play-online/playchess | internal-page | CaissaPrimaryNavigation |
| 5 | play-and-compete | Fritz | /play-online/fritz | internal-page | CaissaPrimaryNavigation |
| 6 | learn-and-improve | Puzzles | /puzzles | internal-page | CaissaPrimaryNavigation |
| 7 | learn-and-improve | Academy | /academy | internal-page | CaissaPrimaryNavigation |
| 8 | learn-and-improve | CAISSA Mentor | /mentor | internal-page | CaissaPrimaryNavigation |
| 9 | learn-and-improve | Endgame Trainer | /endgame-trainer | internal-page | CaissaPrimaryNavigation |
| 10 | learn-and-improve | Endgame Library | /endgame-library | internal-page | CaissaPrimaryNavigation |
| 11 | learn-and-improve | Endgame Tablebase | /endgame-tablebase | internal-page | CaissaPrimaryNavigation |
| 12 | analyze-and-watch | Insights | /insights | internal-page | CaissaPrimaryNavigation |
| 13 | analyze-and-watch | Analyze | /analyze | internal-page | CaissaPrimaryNavigation |
| 14 | analyze-and-watch | CAISSA PGN Reader | /pgn-replayer | internal-page | CaissaPrimaryNavigation |
| 15 | analyze-and-watch | Chess TV | /spectator-tv | internal-page | CaissaPrimaryNavigation |
| 16 | analyze-and-watch | Lichess TV | /watch/lichess-tv | internal-page | CaissaPrimaryNavigation |
| 17 | analyze-and-watch | Live Blitz | /watch/live-blitz | internal-page | CaissaPrimaryNavigation |
| 18 | analyze-and-watch | Live Tournaments | /watch/live-tournaments | internal-page | CaissaPrimaryNavigation |
| 19 | analyze-and-watch | Engine Arena | /arena | internal-page | CaissaPrimaryNavigation |
| 20 | tools | Cheater Insight | /cheater-insight | internal-page | CaissaPrimaryNavigation |
| 21 | tools | Polyglot Tool | /tools/polyglot | internal-page | CaissaPrimaryNavigation |
| 22 | tools | Opening Database | /opening-database | internal-page | CaissaPrimaryNavigation |
| 23 | tools | ECO Codes | /eco | internal-page | CaissaPrimaryNavigation |
| 24 | tools | World Champions | /game-library/champions | internal-page | CaissaPrimaryNavigation |
| 25 | tools | History | /history | internal-page | CaissaPrimaryNavigation |
| 26 | tools | DOS Chess | /dos-chess | internal-page | CaissaPrimaryNavigation |
| 27 | tools | Vault | /vault | internal-page | CaissaPrimaryNavigation |
| 28 | more | Blog | /blog | internal-page | CaissaPrimaryNavigation |
| 29 | more | Support CAISSA | /support | internal-page | CaissaPrimaryNavigation |
| 30 | more | Help | /help | internal-page | CaissaPrimaryNavigation |
| 31 | more | About | /about | internal-page | CaissaPrimaryNavigation |
| 32 | more | Share an Idea / Contact & Feedback | mailto:tvlavin1978@gmail.com?subject=CAISSA%20Feedback&body=Hello%20CAISSA%20Team%2C%0A%0AI%20would%20like%20to%20report%3A%0A%0A%5B%20%5D%20Bug%0A%5B%20%5D%20Feature%20Request%0A%5B%20%5D%20Improvement%20Suggestion%0A%5B%20%5D%20General%20Feedback%0A%0ADetails%3A%0A | external-destination | CaissaPrimaryNavigation |
| 33 | social-footer | Facebook | https://www.facebook.com/CaissaChessOrg/ | external-destination | CaissaPrimaryNavigation |
| 34 | social-footer | CAISSA Chess YouTube | https://www.youtube.com/@CaissaChessOrg | external-destination | CaissaPrimaryNavigation |
| 35 | social-footer | CAISSA Discord | https://discord.gg/TM7GJPUVfr | external-destination | CaissaPrimaryNavigation |

## Public canonical routes outside primary navigation

| Label | Canonical path | Owner | Status |
| --- | --- | --- | --- |
| CAISSA Home | / | home.html, vercel.json and server.js | public |
| What Is A Polyglot Opening Book | /blog/what-is-a-polyglot-opening-book | public/sitemap.xml | public |
| Who Is Caissa Goddess Of Chess | /blog/who-is-caissa-goddess-of-chess | public/sitemap.xml | public |
| Yahoo Chess Spirit Caissa Classic | /blog/yahoo-chess-spirit-caissa-classic | public/sitemap.xml | public |
| Chess Database | /database | vercel.json | public |
| Legacy Game Library | /game-library | vercel.json and server.js | public |
| World Championship Replay | /game-library/champions/replay | vercel.json and server.js | public |
| Library | /library | vercel.json | public |
| Play Bots | /play/bots | PlayV2RouteController | public |
| Play Coach | /play/coach | PlayV2RouteController | public |
| Play Games | /play/games | PlayV2RouteController | public |
| Premium | /premium | vercel.json | public |
| Roadmap | /roadmap | vercel.json | public |
| Sign In | /signin | vercel.json | public |
| Sign Up | /signup | vercel.json | public |
| Capablanca Game Replayer | /watch/game-replayer | vercel.json and server.js | public |

## Redirects and aliases

| From | To | Status | Owner |
| --- | --- | --- | --- |
| /index.html | / | 308 | vercel.json and middleware |
| /home.html | / | 308 | vercel.json and middleware |
| /blog/ | /blog | 308 | vercel.json and middleware |
| /blog/:slug/ | /blog/:slug | 308 | vercel.json and middleware |
| /yahoo-classic/ | /yahoo-classic | 308 | vercel.json and middleware |
| /play/beta | /play | 308 | vercel.json and middleware |
| /play/beta/games | /play/games | 308 | vercel.json and middleware |
| /play/beta/bots | /play/bots | 308 | vercel.json and middleware |
| /play/beta/coach | /play/coach | 308 | vercel.json and middleware |
| /puzzles/chessbase-tactics | /puzzles | 308 | vercel.json and server.js |
| /puzzles/chessbase-tactics/ | /puzzles | 308 | vercel.json and server.js |
| /endgame-practice | /endgame-trainer | 308 | vercel.json and server.js |
| /endgame-practice/ | /endgame-trainer | 308 | vercel.json and server.js |
| /watch/lichess-broadcasts | /watch/live-tournaments | 308 | vercel.json and server.js |
| /watch/lichess-broadcasts/ | /watch/live-tournaments | 308 | vercel.json and server.js |

## Protected and fail-closed routes

| Label | Route or family | Owner | Status |
| --- | --- | --- | --- |
| Players | /play/players | PlayV2RouteController | fail-closed |
| Play beta and QA descendants | /play/beta/:path* | middleware | fail-closed |
| Direct generated Play documents | /play-v2*.html | middleware | fail-closed |
| Unknown Play descendants | /play/:unknown | PlayV2BetaEntryGate | fail-closed |
| Retired beta API | /api/play-beta/:path* | middleware | fail-closed |

## External destinations

| Label | URL | Target | Rel | Explicit click |
| --- | --- | --- | --- | --- |
| Share an Idea / Contact & Feedback | mailto:tvlavin1978@gmail.com?subject=CAISSA%20Feedback&body=Hello%20CAISSA%20Team%2C%0A%0AI%20would%20like%20to%20report%3A%0A%0A%5B%20%5D%20Bug%0A%5B%20%5D%20Feature%20Request%0A%5B%20%5D%20Improvement%20Suggestion%0A%5B%20%5D%20General%20Feedback%0A%0ADetails%3A%0A | _self | — | true |
| Facebook | https://www.facebook.com/CaissaChessOrg/ | _blank | noopener noreferrer | true |
| CAISSA Chess YouTube | https://www.youtube.com/@CaissaChessOrg | _blank | noopener noreferrer | true |
| CAISSA Discord | https://discord.gg/TM7GJPUVfr | _blank | noopener noreferrer | true |

## Change rule

Any task that adds, removes, renames, redirects, protects, or reorders a public CAISSA destination must regenerate and validate CaissaPublicRouteInventory before checkpoint.

The visible order remains owned only by `CaissaPrimaryNavigation`; adapters must never introduce private navigation arrays. Add or remove a route in its real routing owner first, then run `node scripts/build-caissa-public-route-inventory.mjs` and the inventory guard.

`PLAY & COMPETE` includes the credited Playchess and Fritz gateways at positions 4 and 5. `LEARN & IMPROVE` begins with native CAISSA Puzzles. `ANALYZE & WATCH` places the native CAISSA PGN Reader directly after Analyze, then retains Lichess TV, Live Blitz, and the active ChessBase Live Tournaments gateway before Arena. Secondary and institutional destinations live under `More`; official social destinations live in the fixed icon-only sidebar footer. Interactive Diagrams is fully retired with no public route, alias, redirect, or replacement relationship.
