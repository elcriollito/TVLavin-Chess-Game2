# PR #71 — remediación local de los dos P2

## P2: escrituras Guest durante polling

Antes, cada request Guest podía llamar a `ensureGuestIdentity()` y actualizar físicamente la identidad. Ahora:

- `GET` de estado no provisiona ni actualiza identidad;
- solo `presence.join`, `queue.join` y `challenge.create` pueden provisionar;
- una identidad existente usa lectura, sin `updated_at` artificial;
- una creación concurrente tolera exclusivamente la colisión esperada `23505` y relee;
- no hay reintentos genéricos ni relajación de aislamiento;
- Guest se fuerza `rated=false` en servidor.

Regresiones: primera creación, Guest existente, carrera, ocho ciclos de polling con cero llamadas de provisión, reconexión, refresh, expiración, logout y flujos Online relacionados.

Gate: `GUEST_POLLING_WRITE_AMPLIFICATION_FIXED`.

## P2: ruta local de Tournament demo

`server.js` ahora sirve `/online/tournament-demo` mediante el shell Online existente, igual que `/online` y `/online/`. La prueba inicia el servidor real, consulta ruta directa y assets CSS/JS, y confirma HTTP 200. No se habilita Tournament real ni se añade backend de torneo.

Gate: `TOURNAMENT_DEMO_ROUTING_PARITY_PASS`.

## Estado de los threads

Las correcciones existen solo en este worktree local. Los threads de GitHub no fueron marcados como resueltos y PR #71 no fue modificada. Su traslado requiere commit/push y revisión bajo una autorización posterior.
