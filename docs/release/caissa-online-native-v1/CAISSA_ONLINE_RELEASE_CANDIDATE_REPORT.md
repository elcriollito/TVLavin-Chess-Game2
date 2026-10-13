# CAISSA Online Native v1 — Release Candidate Report

Fecha de certificación local: 2026-10-13
Veredicto: **APPROVAL_REQUIRED**

## Identidad

- Repositorio local: `prod-e2e-src-27e360`
- Rama: `fix/caissa-online-workspace-geometry`
- HEAD/base: `932e630d3f0ea111232b7b47eac98670183e4452`
- Estado: candidato sin commit, compuesto por cambios de working tree.
- Digest SHA-256 del candidato de código/pruebas: `b28b50de76a424f593e32f80eeb3f32a11e18cb67f9395862f3ade72132a3f87`
- Algoritmo: SHA-256 de las líneas `ruta sha256`, ordenadas según el manifiesto y terminadas en LF.

## Alcance funcional

El candidato conserva el workspace sin cabecera global, el tablero cuadrado dominante y CAISSA Quiet Drag. Añade o refina:

- New Game con footer adaptativo de `Log in`, `Sign up` y `Play as Guest` solo para visitantes.
- Guest temporal y siempre unrated mediante validación del servidor ya existente.
- Acción visual `Tournaments — Coming Soon`, sin activar torneos reales.
- Games con Daily Games, Game History y Watch Games; las capacidades futuras se muestran honestamente como no disponibles.
- Open Games como área independiente, sin simular backend.
- Players con filtro, contador y presencia; elimina entradas cuando el snapshot queda vacío.
- Menú móvil absoluto hasta 900 px para que no cubra ni intercepte el tablero durante scroll.
- Regresiones responsive adicionales en 340×760 y alrededor del breakpoint 900/901 px.

## Diff de producto y pruebas

Respecto de la base, los cinco archivos del candidato contienen `+447 / -74`:

| Archivo | Cambio |
|---|---:|
| `css/online.css` | +64 / -20 |
| `js/online/online-page.js` | +42 / -7 |
| `online.html` | +30 / -19 |
| `tests/browser/online-native.spec.js` | +286 / -22 |
| `tests/online/shell.test.js` | +25 / -6 |

El paquete de certificación añade documentación, 23 PNG sanitizados y una excepción de `.gitignore` limitada a esa carpeta. No hay archivos eliminados, cambios de API, migraciones, dependencias o lockfile.

## Resultado por fase

| Fase | Estado | Resultado |
|---|---|---|
| 0 — Pre-flight | PASS | Rama, HEAD, remotes y cinco archivos reconciliados; sin secretos ni lockfile modificado. |
| 1 — Code review | PASS | UI, foco, estados futuros, cleanup e identidad revisados. |
| 2 — Security/Auth/Backend | PASS local | Cero hallazgos reportables; configuración alojada pendiente. |
| 3 — QA | PASS local | Suites funcionales, tablero, navegación, auth/policy y tres motores aprobados. |
| 4 — Performance/A11y | PASS local | Quiet Drag sin lecturas geométricas; axe sin hallazgos graves; geometría estable. |
| 5 — Independent review | PASS local | Scan `04affbb8-f5ab-4187-ae30-9581d5e78870`, cero hallazgos. |
| 6 — RC preparation | PASS | Manifiesto, QA, seguridad, visuales, runbook y rollback preparados. |
| 7 — Preview/Staging | APPROVAL_REQUIRED | No se creó commit, PR ni deployment; no hubo smoke alojado. |
| 8 — Human readiness | BLOCKED por Gate A/B | Plan T01–T20 preparado, aún no ejecutado. |

## Versiones observadas

- Node.js `v24.12.0`
- npm `11.6.2`
- Playwright del proyecto `1.62.0`
- `@supabase/supabase-js` `2.93.1`
- `@clerk/backend` `2.33.6`

## Propuesta de control de versiones

Commit propuesto: `feat(online): finalize native lobby workspace`

Descripción de PR propuesta:

> Finaliza la composición responsive de CAISSA Online Native v1: footer de acceso y Guest, Games/Players, estados futuros honestos, Tournaments Coming Soon y corrección del menú móvil para no cubrir el tablero. Conserva Quiet Drag, autoridad PostgreSQL y Guest unrated. Incluye matriz cross-browser, responsive, accesibilidad y paquete de certificación local. No contiene migraciones ni configuración remota.

## Límite de la certificación

El URL histórico `https://caissa-online-native-v1-validation-26a830.vercel.app/online` corresponde al deployment anterior reportado, no a este working tree. Por ello este paquete no declara `HUMAN_TEST_READY`.
