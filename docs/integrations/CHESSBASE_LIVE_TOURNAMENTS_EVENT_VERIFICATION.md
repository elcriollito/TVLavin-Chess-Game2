# Featured Live Tournaments event verification

Verified at `2026-08-15T02:35:08Z` for LTR-0.3A.

- ChessBase “For Webmasters”: `https://live.chessbase.com/en/PgnShare?id=esports-world-cup-chess-playoff-2026&rnd=0` returned HTTP 200 and generated `https://live.chessbase.com/frame/Esports-World-Cup-Chess-Playoff-2026`.
- The generated ChessBase frame returned HTTP 200. Its completed games remained replayable during verification.
- Chess.com’s official event announcement and event page identify the event as the Esports World Cup Chess Finals, August 11–15, 2026, at Paris Expo Porte de Versailles in Paris, France: `https://www.chess.com/news/view/announcing-esports-world-cup-chess-finals-2026` and `https://www.chess.com/events/info/2026-esports-world-cup`.
- The Esports World Cup official resource center identifies the Esports World Cup Foundation as the event operator and provides the 2026 Chess rulebook: `https://resources.esportsworldcup.com/en/competitive-ops/rulebooks/chess`.
- Official organizer destination: `https://www.esportsworldcup.com/en`.

The official schedule available for this release is date-only. The configuration therefore uses conservative civil-day boundaries in `Europe/Paris`: midnight at the start of August 11 through midnight after August 15. Those boundaries convert to `2026-08-10T22:00:00Z` and `2026-08-15T22:00:00Z` while Paris observes CEST. Public copy deliberately says “Live coverage window”; it does not assert that a game is active. At the exact ending instant the state becomes completed.
