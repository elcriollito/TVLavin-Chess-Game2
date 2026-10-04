# Champions external Player collection audit

Reviewed: 2026-10-04

Scope: the 18 primary World Champions shown at `/game-library/champions`. Player collections remain distinct from World Championship event collections.

The 17 SmallChess rows reuse the stable IDs and filenames already present in `js/pgn-replayer/pgn-album-catalog.js`. They are registered as external-link-only capabilities: CAISSA does not proxy, copy, or activate these provider files in the Champions Reader flow. A live review returned HTTP 200 and `application/vnd.chess-pgn` for every registered direct URL.

| championId | Canonical player | Player collection ID | Provider | Approved external URL | Link | CAISSA Reader | External action | Registry / rights |
|---|---|---|---|---|---|---|---|---|
| `wilhelm-steinitz` | Wilhelm Steinitz | `smallchess-wilhelm-steinitz` | SmallChess | `https://www.smallchess.com/Games/Wilhelm%20Steinitz.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `emanuel-lasker` | Emanuel Lasker | `smallchess-emanuel-lasker` | SmallChess | `https://www.smallchess.com/Games/Emanuel%20Lasker.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `jose-raul-capablanca` | José Raúl Capablanca | `capablanca-complete` | CAISSA repository owner | — | — | Yes | No | `VERIFIED_REDISTRIBUTABLE` / `RIGHTS_CLEARED_LOCAL` |
| `alexander-alekhine` | Alexander Alekhine | `smallchess-alexander-alekhine` | SmallChess | `https://www.smallchess.com/Games/Alexander%20Alekhine.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `max-euwe` | Max Euwe | `smallchess-max-euwe` | SmallChess | `https://www.smallchess.com/Games/Max%20Euwe.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `mikhail-botvinnik` | Mikhail Botvinnik | `smallchess-mikhail-botvinnik` | SmallChess | `https://www.smallchess.com/Games/Mikhail%20Botvinnik.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `vasily-smyslov` | Vasily Smyslov | `smallchess-vasily-smyslov` | SmallChess | `https://www.smallchess.com/Games/Vasily%20Smyslov.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `mikhail-tal` | Mikhail Tal | `smallchess-mikhail-tal` | SmallChess | `https://www.smallchess.com/Games/Mikhail%20Tal.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `tigran-petrosian` | Tigran Petrosian | `smallchess-tigran-petrosian` | SmallChess | `https://www.smallchess.com/Games/Tigran%20Petrosian.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `boris-spassky` | Boris Spassky | `smallchess-boris-spassky` | SmallChess | `https://www.smallchess.com/Games/Boris%20Spassky.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `bobby-fischer` | Bobby Fischer | `smallchess-bobby-fischer` | SmallChess | `https://www.smallchess.com/Games/Bobby%20Fischer.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `anatoly-karpov` | Anatoly Karpov | `smallchess-anatoly-karpov` | SmallChess | `https://www.smallchess.com/Games/Anatoly%20Karpov.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `garry-kasparov` | Garry Kasparov | `smallchess-garry-kasparov` | SmallChess | `https://www.smallchess.com/Games/Garry%20Kasparov.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `vladimir-kramnik` | Vladimir Kramnik | `smallchess-vladimir-kramnik` | SmallChess | `https://www.smallchess.com/Games/Vladimir%20Kramnik.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `viswanathan-anand` | Viswanathan Anand | `smallchess-viswanathan-anand` | SmallChess | `https://www.smallchess.com/Games/Viswanathan%20Anand.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `magnus-carlsen` | Magnus Carlsen | `smallchess-magnus-carlsen` | SmallChess | `https://www.smallchess.com/Games/Magnus%20Carlsen.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `ding-liren` | Ding Liren | `smallchess-ding-liren` | SmallChess | `https://www.smallchess.com/Games/Ding%20Liren.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |
| `gukesh-dommaraju` | Gukesh Dommaraju | `smallchess-dommaraju-gukesh` | SmallChess | `https://www.smallchess.com/Games/Dommaraju%20Gukesh.pgn` | Direct PGN | No | Yes | `LINK_ONLY` / `NEEDS_REVIEW` |

`NEEDS_REVIEW` above describes local/commercial redistribution rights. The separately reviewed `LINK_ONLY` capability permits only the exact external URL stored in the allowlist. Capablanca deliberately has no external action because no external player URL is registered for that collection.
