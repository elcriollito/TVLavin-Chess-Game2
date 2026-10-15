# CAISSA Online Native v1 — Human Test Checklist

Todas las filas están **BLOCKED** hasta que exista una Preview del candidato exacto y se autorice el smoke/escritura en Staging. No hay resultados humanos implícitos.

| Test ID | Scenario | PC A | PC B | Expected | Actual | PASS/FAIL/BLOCKED | Evidence | Issue |
|---|---|---|---|---|---|---|---|---|
| T01 | Login independiente | Clerk Dev A | Clerk Dev B | Identidades correctas y aisladas | No ejecutado | BLOCKED | — | Gate A/B |
| T02 | Presencia | Ver Players | Ver Players | Conteo/estado coherentes | No ejecutado | BLOCKED | — | Gate A/B |
| T03 | Matchmaking | Join compatible | Join compatible | Una partida canónica | No ejecutado | BLOCKED | — | Gate B |
| T04 | Colores | Confirmar lado | Confirmar lado | Orientación e identidad correctas | No ejecutado | BLOCKED | — | Gate B |
| T05 | Movimientos | Blancas | Negras | Legales, sincronizados | No ejecutado | BLOCKED | — | Gate B |
| T06 | Quiet Drag | Drag mouse/touch | Drag mouse/touch | Sin ghost/jitter | No ejecutado | BLOCKED | — | Gate B |
| T07 | Relojes | Observar/mover | Observar/mover | Estado autoritativo e incremento | No ejecutado | BLOCKED | — | Gate B |
| T08 | Realtime | Mover | Recibir | Broadcast real, sin duplicados | No ejecutado | BLOCKED | — | Gate B |
| T09 | Reconexión | Desconectar/reconectar | Mantener | Resync seguro | No ejecutado | BLOCKED | — | Gate B |
| T10 | Refresh | Recargar | Mantener | Misma partida, no duplicada | No ejecutado | BLOCKED | — | Gate B |
| T11 | Fin de partida | Resultado permitido | Confirmar | Finaliza exactamente una vez | No ejecutado | BLOCKED | — | Gate B |
| T12 | Rating | Rated/unrated/Guest | Contraparte | Guest 0 rating; rated una vez | No ejecutado | BLOCKED | — | Gate B |
| T13 | Challenge | Enviar | Aceptar/rechazar | Invitación única y válida | No ejecutado | BLOCKED | — | Gate B |
| T14 | Presencia expirada | Logout/cierre | Observar | Fila/desafío caducado desaparece | No ejecutado | BLOCKED | — | Gate B |
| T15 | Aislamiento | Partida propia | Identidad controlada C | Tercero no lee/actúa | No ejecutado | BLOCKED | — | Gate B |
| T16 | Guest lifecycle | Crear/jugar/logout | Contraparte | Temporal, unrated, sin acceso posterior | No ejecutado | BLOCKED | — | Gate B |
| T17 | Mobile smoke | Móvil | Observador | Tablero, scroll, menú, footer y touch | No ejecutado | BLOCKED | — | Gate A/B |
| T18 | History | Terminar partida | Consultar Games | Historial refleja contrato | No ejecutado | BLOCKED | — | Gate B |
| T19 | Estados futuros | Revisar UI | Revisar UI | Daily/Watch/Open/Tournament no activos | No ejecutado | BLOCKED | — | Gate A |
| T20 | Cleanup | Salir de queue/sesión | Igual | Sin presencia/retos obsoletos tras TTL | No ejecutado | BLOCKED | — | Gate B |

## Exit criteria

La fase humana futura solo será PASS si ambos jugadores se autentican, completan una partida, ven movimientos/relojes coherentes, Realtime y reconexión funcionan, Guest permanece unrated, no hay fallo de autorización, el resultado es único y no quedan defectos críticos abiertos.
