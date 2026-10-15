# CAISSA Public Identity — matriz QA local

Fecha: 2026-10-14. Todos los datos son sintéticos.

| Superficie | Resultado |
|---|---:|
| `lint:public-identity` | PASS |
| `lint:online` | PASS |
| Public Identity unit/API/migration/projection | 22/22 PASS |
| Online unit/integration | 78/78 PASS |
| Public Identity browser, Chromium/Firefox/WebKit | 12/12 PASS |
| Online browser Chromium | 23/23 PASS |
| Online browser Firefox/WebKit | 46/46 PASS |
| Board unit | 26/26 PASS |
| Board browser | 19 PASS, 1 visual SKIPPED esperado |
| Navegación | 9/9 PASS |
| Auth/navigation/policy combinado | 84/85; 1 FAIL preexistente no afectado |
| PGN replayer unit | 146/147; 1 FAIL ambiental no afectado |
| Servidor local `/online`, `/online/`, Tournament demo, CSS/JS | PASS, HTTP 200 |
| PostgreSQL 17.11 DDL/RLS/grants/races/rollback/reapply | PASS |
| `git diff --check` | PASS |
| Codex Security diff scan del candidato anterior | 17/17; 2 hallazgos reportables, ambos remediados en el candidato recertificado |
| Revisión independiente posterior al parche | U+FEFF detectado y corregido; limitación del rollback documentada |
| Public Identity Node | 23/23 PASS |
| Public Identity browser | 12/12 PASS, Chromium/Firefox/WebKit |
| Online Node | 78/78 PASS |
| Online browser | 23/23 PASS |
| Board foundation | 26/26 unitarias; 19 PASS + 1 visual omitida en browser |
| Navegación | 9/9 PASS |

## Fallos ajenos explicados

1. `tests/global-navigation-order-policy.test.js` espera navegación v1.17, pero `js/caissa-primary-navigation.js` en el HEAD base ya es v1.18. Ambos archivos son idénticos a HEAD; el candidato no los modifica.
2. Un guard de packaging PGN falla porque existe el archivo local ignorado `public/data/pgn/capablanca-games-1901-1941.pgn`. La prueba y el código del replayer son idénticos a HEAD. No se eliminó un archivo ajeno al alcance.

Estas excepciones no se presentan como PASS. Las suites afectadas por Public Identity sí pasaron completas.

## Cobertura funcional

Unicode NFC/NFD/NFKC, longitud 2/3/24/25, invisibles, bidi, escritura mixta, reservados, puntuación, spoofing, colisiones, doble submit, sesión/cambio de usuario, Guest nuevo/existente/carrera, ocho polls sin escrituras de identidad, listas de 205 sujetos, historial, PGN, Analyzer handoff, rutas, responsive y accesibilidad.

No se verificaron aún la migración revisada en Staging, JWT reales, Realtime remoto ni la Preview del candidato revisado. Gate local: `LOCAL_SECURITY_FIXES_VERIFIED`; el gate alojado requiere el nuevo hash autorizado.
