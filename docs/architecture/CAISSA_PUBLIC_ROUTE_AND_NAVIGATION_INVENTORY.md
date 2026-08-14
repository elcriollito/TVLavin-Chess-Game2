# CAISSA Public Route and Navigation Inventory

Contract: `CaissaPublicRouteInventory@1.0.0`

This document and [the machine-readable inventory](../../config/caissa-public-route-inventory.json) are generated deterministically from the routing and navigation owners. Do not edit either output manually.

## Sources of truth

- `js/caissa-primary-navigation.js`
- `js/play/play-route-controller.js`
- `middleware.js`
- `server.js`
- `vercel.json`
- `public/sitemap.xml`

## Calculated summary

- Primary navigation entries: 25
- Internal primary pages: 21
- Public canonical routes not in primary navigation: 14
- External destinations: 4
- Redirects: 8
- Protected route families: 5
- Total inventoried records: 52

## Primary navigation

| Position | Group | Label | Canonical destination | Type | Owner |
| --- | --- | --- | --- | --- | --- |
| 1 | play-and-compete | Play | /play | internal-page | CaissaPrimaryNavigation |
| 2 | play-and-compete | CAISSA Classic | /yahoo-classic | internal-page | CaissaPrimaryNavigation |
| 3 | play-and-compete | FICS | /fics | internal-page | CaissaPrimaryNavigation |
| 4 | play-and-compete | Playchess | /play-online/playchess | internal-page | CaissaPrimaryNavigation |
| 5 | learn-and-improve | Academy | /academy | internal-page | CaissaPrimaryNavigation |
| 6 | learn-and-improve | Endgame Trainer | /endgame-trainer | internal-page | CaissaPrimaryNavigation |
| 7 | learn-and-improve | Endgame Practice | /endgame-practice | internal-page | CaissaPrimaryNavigation |
| 8 | learn-and-improve | Endgame Library | /endgame-library | internal-page | CaissaPrimaryNavigation |
| 9 | analyze-and-watch | Insights | /insights | internal-page | CaissaPrimaryNavigation |
| 10 | analyze-and-watch | Analyze | /analyze | internal-page | CaissaPrimaryNavigation |
| 11 | analyze-and-watch | Spectator TV | /spectator-tv | internal-page | CaissaPrimaryNavigation |
| 12 | analyze-and-watch | Arena | /arena | internal-page | CaissaPrimaryNavigation |
| 13 | tools | Cheater Insight | /cheater-insight | internal-page | CaissaPrimaryNavigation |
| 14 | tools | Polyglot Tool | /tools/polyglot | internal-page | CaissaPrimaryNavigation |
| 15 | tools | Opening Database | /opening-database | internal-page | CaissaPrimaryNavigation |
| 16 | tools | ECO Codes | /eco | internal-page | CaissaPrimaryNavigation |
| 17 | tools | Game Library | /game-library | internal-page | CaissaPrimaryNavigation |
| 18 | tools | History | /history | internal-page | CaissaPrimaryNavigation |
| 19 | tools | DOS Chess | /dos-chess | internal-page | CaissaPrimaryNavigation |
| 20 | tools | Vault | /vault | internal-page | CaissaPrimaryNavigation |
| 21 | tools | Blog | /blog | internal-page | CaissaPrimaryNavigation |
| 22 | connect-with-caissa-chess | Facebook | https://www.facebook.com/CaissaChessOrg/ | external-destination | CaissaPrimaryNavigation |
| 23 | connect-with-caissa-chess | CAISSA Chess YouTube | https://www.youtube.com/@CaissaChessOrg | external-destination | CaissaPrimaryNavigation |
| 24 | connect-with-caissa-chess | CAISSA Discord | https://discord.gg/TM7GJPUVfr | external-destination | CaissaPrimaryNavigation |
| 25 | connect-with-caissa-chess | Share an Idea / Contact & Feedback | mailto:tvlavin1978@gmail.com?subject=CAISSA%20Feedback&body=Hello%20CAISSA%20Team%2C%0A%0AI%20would%20like%20to%20report%3A%0A%0A%5B%20%5D%20Bug%0A%5B%20%5D%20Feature%20Request%0A%5B%20%5D%20Improvement%20Suggestion%0A%5B%20%5D%20General%20Feedback%0A%0ADetails%3A%0A | external-destination | CaissaPrimaryNavigation |

## Public canonical routes outside primary navigation

| Label | Canonical path | Owner | Status |
| --- | --- | --- | --- |
| About CAISSA Chess | /about | CaissaPrimaryNavigation.support | public |
| What Is A Polyglot Opening Book | /blog/what-is-a-polyglot-opening-book | public/sitemap.xml | public |
| Who Is Caissa Goddess Of Chess | /blog/who-is-caissa-goddess-of-chess | public/sitemap.xml | public |
| Yahoo Chess Spirit Caissa Classic | /blog/yahoo-chess-spirit-caissa-classic | public/sitemap.xml | public |
| Chess Database | /database | vercel.json | public |
| Help | /help | CaissaPrimaryNavigation.support | public |
| Library | /library | vercel.json | public |
| Play Bots | /play/bots | PlayV2RouteController | public |
| Play Coach | /play/coach | PlayV2RouteController | public |
| Play Games | /play/games | PlayV2RouteController | public |
| Premium | /premium | vercel.json | public |
| Roadmap | /roadmap | vercel.json | public |
| Sign In | /signin | vercel.json | public |
| Sign Up | /signup | vercel.json | public |

## Redirects and aliases

| From | To | Status | Owner |
| --- | --- | --- | --- |
| / | /play | 308 | vercel.json and middleware |
| /blog/ | /blog | 308 | vercel.json and middleware |
| /blog/:slug/ | /blog/:slug | 308 | vercel.json and middleware |
| /yahoo-classic/ | /yahoo-classic | 308 | vercel.json and middleware |
| /play/beta | /play | 308 | vercel.json and middleware |
| /play/beta/games | /play/games | 308 | vercel.json and middleware |
| /play/beta/bots | /play/bots | 308 | vercel.json and middleware |
| /play/beta/coach | /play/coach | 308 | vercel.json and middleware |

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
| Facebook | https://www.facebook.com/CaissaChessOrg/ | _blank | noopener noreferrer | true |
| CAISSA Chess YouTube | https://www.youtube.com/@CaissaChessOrg | _blank | noopener noreferrer | true |
| CAISSA Discord | https://discord.gg/TM7GJPUVfr | _blank | noopener noreferrer | true |
| Share an Idea / Contact & Feedback | mailto:tvlavin1978@gmail.com?subject=CAISSA%20Feedback&body=Hello%20CAISSA%20Team%2C%0A%0AI%20would%20like%20to%20report%3A%0A%0A%5B%20%5D%20Bug%0A%5B%20%5D%20Feature%20Request%0A%5B%20%5D%20Improvement%20Suggestion%0A%5B%20%5D%20General%20Feedback%0A%0ADetails%3A%0A | _self | — | true |

## Change rule

Any task that adds, removes, renames, redirects, protects, or reorders a public CAISSA destination must regenerate and validate CaissaPublicRouteInventory before checkpoint.

The visible order remains owned only by `CaissaPrimaryNavigation`; adapters must never introduce private navigation arrays. Add or remove a route in its real routing owner first, then run `node scripts/build-caissa-public-route-inventory.mjs` and the inventory guard.

`PLAY & COMPETE` includes the credited Playchess guest gateway at position 4. The route embeds the public ChessBase service without changing CAISSA Play, CAISSA Classic, or FICS behavior.
