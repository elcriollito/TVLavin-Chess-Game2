# CAISSA Online Native v1 — Visual Acceptance

Estado: **PASS local** para la composición aprobada; revisión humana de la futura Preview pendiente.

## Decisiones preservadas

- Workspace sin barra superior: tablero/jugadores y panel aprovechan el área visible.
- Tablero cuadrado, dominante y centrado con el panel; separación desktop estable de 24–32 px.
- Panel alineado con el bloque rival–tablero–jugador y con un único cuerpo desplazable cuando hace falta.
- Identidad CAISSA verde/dorada sin zoom CSS ni márgenes correctivos arbitrarios.
- New Game con jerarquía clara, Tournament Coming Soon y footer adaptable.
- Games y Players mantienen la composición aprobada; Open Games permanece independiente.
- Menú móvil visible al inicio y fuera del viewport al hacer scroll, sin cubrir piezas ni interceptar input.

## Evidencia principal

| Estado | Archivo |
|---|---|
| New Game desktop | `evidence/online-micro-polish-new-game-desktop-1440x900.png` |
| New Game mobile superior | `evidence/online-micro-polish-new-game-mobile-top-390x844.png` |
| New Game mobile footer | `evidence/online-micro-polish-new-game-mobile-footer-390x844.png` |
| Games desktop | `evidence/online-reference-games-1440x900.png` |
| Players desktop sintético | `evidence/online-reference-players-1440x900.png` |
| Menú móvil superior/medio/footer | `evidence/online-mobile-nav-top-390x844.png`, `online-mobile-nav-middle-390x844.png`, `online-mobile-nav-footer-390x844.png` |
| Partida activa | `evidence/current-caissa-online-live-desktop.png` |
| Game Over tras tres polls | `evidence/current-caissa-online-game-over-poll-1.png` a `-3.png` |
| Presence antes/después de expirar | `evidence/current-caissa-online-players-before-expiry.png`, `current-caissa-online-players-after-expiry.png` |

## Criterios comprobados

- Sin overflow horizontal involuntario.
- Sin intersección tablero/panel o menú/tablero en viewports medidos.
- Footer accesible mediante scroll en móvil; no usa absolute positioning.
- Foco de tabs/controles y restauración de foco cubiertos por Playwright.
- Estados Coming Soon contrastan y no parecen acciones activas.
- No aparecen `null` de rating.
- Visitante ve el tablero normal y el prompt de acceso aparece solo por acción explícita.
- Quiet Drag y proporciones del tablero no fueron alterados por el micro-polish.

Digest agregado SHA-256 de las 23 imágenes, calculado sobre `nombre sha256` ordenado y LF: `ce99852edc98c38802f1cd7f24c0a98d31d441d6f742385954d9ab7581ea510b`.

## Límite

Estas imágenes certifican el harness local. Deben repetirse capturas representativas en el deployment exacto una vez exista autorización para Preview; no sustituyen la revisión de dos jugadores reales.
