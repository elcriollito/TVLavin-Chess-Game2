# CAISSA Online Native v1 — QA Matrix

Fecha: 2026-10-13
Entorno: Windows local; backend y Realtime simulados por harness cuando corresponde. Ningún resultado de esta tabla certifica Staging alojado.

## Suites actuales

| Comando/área | Resultado | Nota |
|---|---:|---|
| `npm run lint:online` | PASS | Sin errores. |
| `npm run test:online` | 65/65 PASS | New Game, Games, Players, Guest, polling, estados y contratos UI. |
| `npm run test:online:browser` | 21/21 PASS | Configuración Online Chromium. |
| `online-native.spec.js` Chromium/Firefox/WebKit | 63/63 PASS | 21 casos por motor. |
| `npm run test:board:unit` | 26/26 PASS | Reglas y comportamiento unitario del tablero. |
| `npm run test:board:browser` | 19 PASS, 1 SKIP | El único skip es captura visual opt-in, no una aserción funcional fallida. |
| `npm run test:navigation` | 9/9 PASS | Navegación compartida. |
| Auth/API/policy dirigido | 40/40 PASS | Cinco suites explícitas de auth, registration sync, policy y Guest. |
| `git diff --check` | PASS | Sin whitespace errors. |
| Axe integrado | PASS | Sin hallazgos serious/critical en el recorrido automatizado. |

## Cobertura funcional

- New Game, selector de tiempo, Custom y flujo visitante explícito.
- Footer alcanzable y oculto correctamente para miembro autenticado.
- Guest crea como máximo una solicitud, conserva identidad temporal y permanece unrated.
- Games cambia entre Daily, History y Watch sin mostrar contenidos simultáneos.
- Open Games y Tournament permanecen futuras/inertes.
- Players elimina filas antiguas cuando presence devuelve `[]`.
- Partida completada seleccionada se conserva durante tres ciclos de polling; Game Over, Rematch, Analyze y PGN permanecen.
- Movimiento provisional no se revierte por snapshot obsoleto; no se habilita doble submit.
- Realtime resync, versionado y cleanup cubiertos por pruebas locales/mocks; no equivalen a WebSocket alojado.

## Responsive y geometría

| Viewport/condición | Resultado |
|---|---|
| 1440×900 | Tablero 749.94 px cuadrado; panel 403.19 px; gap 28.80 px; bases alineadas. |
| 1440×720 | Tablero 604 px; panel 403.19 px; gap 28.80 px; sin intersección. |
| 2560×1440 con zoom 25/33/50/67/80/100/125% | Grupo centrado, sin solapamiento ni overflow horizontal. |
| 390×844 | Tablero 370 px; panel debajo con 14 px; menú/tablero intersección 0; scroll vertical esperado. |
| 340×760 | Tablero 320 px; panel debajo con 14 px; sin intersección ni overflow horizontal. |
| 900×844 | Layout apilado; separación 24 px; sin intersección. |
| 901×844 | Layout lateral; gap ≥24 px, alineación superior/inferior y sin overflow. |

## Quiet Drag y rendimiento medido

Captura Chromium actual:

- Pointer events: 17.
- Escrituras visuales: 16.
- Lecturas geométricas durante movimiento: 0.
- Cursor p95: 2.1 ms.
- Frame p50/p95: 16.7/16.7 ms.
- Drop visual: 10.7 ms.
- Confirmación HTTP simulada: 3506.1 ms.
- Long tasks: 0.
- Reversión visual durante ACK tardío: false.

Firefox y WebKit también aprobaron el mismo contrato. Las métricas de instrumentación no son comparables entre motores en todos sus campos; no se interpreta un valor ausente como latencia cero real.

## Visuales y datos

Las capturas de Players usan presencia sintética controlada. Las capturas de partida activa y Game Over provienen del harness local. Ninguna representa usuarios humanos, cuentas reales ni datos de Staging.

## Pendiente fuera de este gate

- Build/deployment Vercel del candidato exacto.
- Compatibilidad y configuración real de Clerk Development/Supabase Staging.
- Realtime WebSocket real, aislamiento del tercero y fallback alojado.
- Smoke con escrituras y matriz humana T01–T20, ambos sujetos a autorizaciones separadas.
