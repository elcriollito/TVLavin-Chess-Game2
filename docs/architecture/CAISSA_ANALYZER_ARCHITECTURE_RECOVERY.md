# CAISSA Chess — Analyzer Architecture, Play Handoff & Recovery Runbook

> **Documento de continuidad técnica / fuente de referencia para Codex**<br>
> Proyecto: **CAISSA Chess** — https://www.caissa-chess.org/<br>
> Repositorio: `elcriollito/TVLavin-Chess-Game2`<br>
> Ruta canónica del Analyzer: **`/analyze`**<br>
> Elaborado: **2026-10-30**<br>
> Estado documentado: **hotfix de aplicación `44e557c0` preparado, Human QA aprobado (6/6) y release readiness verificado; merge, push y producción NO autorizados ni ejecutados**. Esta versión del runbook se añade en un commit de documentación posterior, sin cambiar la identidad del código de aplicación aprobado.

## 0. Leer primero — reglas de recuperación

1. **NO reconstruir el Analyzer.** El código moderno existe y está integrado en el repositorio.
2. **NO eliminar `#analyzeSection`, `AnalyzeSection`, los módulos PGN/RAV ni el motor compartido.** La versión moderna conserva IDs y dependencias históricas.
3. **NO copiar el shell moderno dentro del documento Play.** Play y Analyzer usan documentos HTML diferentes en producción.
4. **NO tratar una URL cambiada con `history.pushState` como navegación entre documentos.** Para salir desde el documento dedicado Play hay que abrir el documento real `/analyze`.
5. **NO borrar todavía el Analyzer antiguo embebido en Play.** Su retiro es una operación posterior y separada de la corrección de navegación.
6. Antes de publicar: comparar contra `main` actual, comprobar artefactos generados, repetir QA relevante, preparar rollback y obtener autorización explícita del propietario.

Este documento consolida **dos auditorías de Codex y sus reportes posteriores de implementación/QA** proporcionados por el propietario. No sustituye comprobar el estado actual de GitHub, del worktree y de Vercel antes de intervenir.

## 1. Estado conocido y versiones

| Tema | Identidad / estado documentado |
| --- | --- |
| Punto histórico de `main` auditado | `f8bf140f4b7d4779bce7e5167e3632ce866cf4aa` (despliegue reportado el 2026-10-28; `origin/main` local volvió a verificarse en ese SHA el 2026-10-30) |
| Analyzer moderno | Presente en `main`, ruta **`/analyze`**, V2.0.1 + actualización PGN/RAV del 2026-09-30 |
| Hotfix aislado | `hotfix/play-analyzer-routing-coach-ux` |
| Commit del hotfix | `44e557c062ac580fad28b1d642ed764df0d07888` |
| Baseline del hotfix | `f8bf140f4b7d4779bce7e5167e3632ce866cf4aa` |
| QA automatizado **reportado** | 8/8 handoff, 1/1 regresión pública, 4/4 accesibilidad, 63/63 unitarios/contratos = **76/76** |
| Human QA del propietario | **6/6 PASS** para Game, Bots, Coach, selección de nivel, Back y móvil |
| Release readiness | **VERIFICADO / GO para PR y staging controlado**; autorización de producción todavía pendiente |
| Producción del hotfix | **PENDIENTE**: no merge, push ni deploy al cierre de los reportes |
| Retiro del Analyzer embebido | **NO IMPLEMENTADO / NO AUTORIZADO** |

**Importante:** SHA de `main` y despliegue son un *punto de referencia histórico*, no afirmaciones sobre el HEAD actual. Actualizar esta tabla únicamente con pruebas verificadas. No confundir el QA del candidato con un despliegue publicado.

### Verificación del repositorio — 2026-10-30

Esta incorporación documental se verificó en la rama aislada `hotfix/play-analyzer-routing-coach-ux`, partiendo del commit de aplicación aprobado `44e557c062ac580fad28b1d642ed764df0d07888`, con worktree limpio antes de añadir documentación.

- `origin/main` se obtuvo y verificó en `f8bf140f4b7d4779bce7e5167e3632ce866cf4aa`, padre exacto del hotfix; no había commits intermedios ni conflictos.
- Todas las rutas de implementación, pruebas, artefactos generados, candidatos de retiro y documentos históricos nombrados en este runbook existen en el repositorio actual.
- Los commits históricos de la sección 10 existen; los tags anotados `analyze-v2-certified` y `analyze-v2.0.1-certified` resuelven respectivamente a `ac8ea70b41c704a8ad8307648a1ea699dbacba00` y `b28328cffee2a001c66e2cb19ba51b3fc6ffadfc`.
- Los merges locales de PR #34 (`c7581e354ad512637e74930c1e870b979e276ce3`) y PR #36 (`2bef6d2072eb7922ec0f4c04664fc25e2fdff31a`) coinciden con las referencias históricas.
- `middleware.js:119–132` continúa sirviendo el documento Play oficial para `/play/*`; `vercel.json` conserva el rewrite `/analyze` → `/index.html`.
- La verificación final del candidato volvió a obtener 76/76 en la regresión autorizada, build público PASS e integridad de documentos generados PASS. Los avisos CSP preexistentes y las expectativas históricas obsoletas se documentaron por separado y no fueron modificados por el hotfix.
- No existe un índice general vigente bajo `docs`; `AGENTS.md` enlaza ahora este runbook y exige consultarlo y mantenerlo para trabajo futuro de Analyzer, handoff, recuperación o retiro del legado.

Las afirmaciones de despliegue siguen siendo **históricas/reportadas** hasta comprobar GitHub/Vercel en el momento de una publicación autorizada. El estado actual de este documento es **producción en HOLD**.

## 2. Qué es el Analyzer oficial y cómo debe verse

### Experiencia esperada en `/analyze`

- **Analyzer V2, dos regiones principales:** tablero persistente protagonista a la izquierda y workspace de análisis a la derecha, con barra vertical de evaluación.
- **Pestañas/secciones funcionales:** **Analysis**, **Games** y **Setup Position**, conservando la sesión y el tablero al alternarlas.
- **Motor:** un propietario de **Stockfish 18 Lite WASM**, análisis en vivo con **MultiPV 4**; Review serializado con **MultiPV 1** según certificación histórica.
- **Importación y navegación:** pegar/abrir PGN, lista de partidas de un PGN múltiple, árbol real PGN/RAV con variantes anidadas, importación de fuentes públicas compatibles.
- **Análisis y revisión:** evaluación/barra, jugadas recomendadas, Move Evidence, Game Review, resumen de precisión/calidad y momentos críticos.
- **Tablero:** movimiento directo, configuración de posición/FEN, Flip Board sin perder contexto y renderer persistente.
- **Responsive:** el tablero y workspace se apilan bajo ~820 px; tratamiento compacto bajo ~560 px (según auditoría de CSS; verificar si cambia).

**Referencias geométricas de la auditoría (no objetivos CSS rígidos):**

- Analyzer moderno a 1557×920: tablero de aproximadamente **713×713**, workspace **480 px**, barra de evaluación **34 px**.
- Versión heredada mostrada al entrar desde Play a 1600×1000: tablero **548×548**, import sidebar **320 px**, grandes espacios vacíos y panel de Game Info muy separado.

Si después de pulsar Analyze desde Play aparece la segunda disposición, **diagnosticar la ruta/documento cargado** antes de retocar CSS.

### UI de `/play/coach`

- Selector **Choose your level**: Casual / Balanced / Challenging y niveles expandidos.
- **Tipografía original conservada**: el problema reportado se debía a zoom del navegador al 50%; al 100% la lectura fue aprobada.
- Cambio aprobado en el hotfix: **selección con fondo verde apagado, borde verde, checkmark, foco visible y soporte de forced-colors**.
- Mantener intactos paddings, geometría, responsive, nombres de niveles y el botón naranja **Play**.

## 3. Arquitectura: dos documentos HTML, un único Analyzer oficial

```text
                          CAISSA Chess
                               |
         +---------------------+---------------------+
         |                                           |
 /play/games, /play/bots, /play/coach              /analyze
         |                                           |
 middleware.js sirve                              index.html SPA
 PLAY_V2_PUBLIC_BETA_DOCUMENT                       |
         |                                      Modern Analyze V2
 Documento Play dedicado                       CSS + JS V2 shell
         |                                           |
 Finalizar partida, Analyze/Review              Analyzer completo
         |                                           ^
 CaissaPostGameExperience                          |
 crea handoff (token)                              |
         |                                           |
   [HOTFIX] location.assign('/analyze?handoff=TOKEN')
         +-------------------------------------------+
```

### Documentos y middleware

- `middleware.js` (auditoría: líneas 119–132) intercepta `/play/*` y sirve `PLAY_V2_PUBLIC_BETA_DOCUMENT`.
- El documento Play se genera a partir de plantillas (`play-v2-public-beta.html` y export del middleware), y **contiene todavía un Analyzer embebido heredado**.
- `/analyze` abre `index.html`, que **sí** incluye el markup moderno, `css/analyze-v2-shell.css` y `js/analyze-v2-shell.js`.
- `vercel.json` hace el **rewrite SPA normal** de `/analyze` a `index.html`. **No es una redirección al Analyzer antiguo** y debe conservarse.

### Flujo de handoff que debe mantenerse

1. Play genera un registro válido de la partida / posición con `CaissaPostGameExperience` y el contrato de `js/play/analyze-handoff.js`.
2. El handoff se guarda localmente y se entrega mediante **token opaco** (no meter PGN extenso en URL).
3. Desde el documento Play oficial se realiza una **navegación real entre documentos** hacia `/analyze?handoff=<token>`.
4. El documento principal inicializa Analyzer V2 y consume el token.
5. La posición, jugadas, Game Review y MultiPV continúan allí.

**Invariantes del handoff:** PGN completo, FEN inicial/final, `selectedPly`, orientación, color y etiquetas de jugadores, resultado, terminación, estado del registro y modo de Play. Debe preservarse tanto el handoff postgame como la compatibilidad con posiciones activas que corresponda.

## 4. Bug de 2026-10-30: causa confirmada y reparación

### Síntoma original

Desde cualquiera de los tres módulos Play:

- Play Game → **Analyze This Game**.
- Play Bots → **Analyze This Game**.
- Play Coach → **Review Game**.

En lugar de mostrar el workspace moderno V2 se abría la estructura visual heredada y aparecía la URL `/?section=analyze&handoff=…`.

### Causa raíz reproducida por Codex

- La acción generaba el token correctamente.
- `CaissaNavigation.navigateToSection('analyze', { handoffToken })` activaba un `#analyzeSection` que **ya existía dentro del documento Play**.
- `js/play/play-route-controller.js` realizaba `history.pushState`, **no** una navegación de documento.
- El lazy-loader de Play cargaba scripts de sesión/PGN/Analyzer, pero **no** el CSS, controlador y markup del shell V2 exclusivo de `index.html`.
- Resultado: funciones relativamente modernas renderizadas sobre una interfaz vieja. No era pérdida de código, ni cache, ni un simple error CSS.

### Corrección que contiene el commit `44e557c0`

- `js/caissa-navigation.js`: detecta **solo** el documento dedicado Play oficial y usa `location.assign('/analyze?handoff=…')`.
- `js/play/post-game-core.js`: evita cargar innecesariamente el bundle Analyzer viejo antes de abandonar Play.
- La navegación SPA del `index.html` principal y los caminos QA-only inline **no se cambian**.
- Contrato de handoff, propietario Stockfish y módulos V2 **no se reconstruyen**.
- `css/play-coach-review.css`: resaltado verde del nivel elegido sin incrementar tipografía.
- Actualización de versionado/cache keys, regeneración de documentos Play y pruebas de regresión.

### Verificaciones obtenidas

- Handoff desde los tres modos abre **`/analyze?handoff=…`** mediante navegación real.
- Marcador V2 listo: **`data-analyze-v2-ready="true"`**.
- La estructura vieja `.analyze-layout` **no** se vuelve visible.
- PGN/FEN/resultado/selected ply/orientación conservados.
- Tablero persistente, MultiPV y arranque Game Review funcionales.
- Limpieza de workers/engine Play al salir sin duplicación del motor.
- Browser Back vuelve a la ruta y modo de origen.

**Limitación UX conocida:** BFCache puede restaurar el postgame anterior al pulsar Back; una recarga fresca sin BFCache vuelve al modo correcto pero con configuración limpia e inactiva. No prometer restauración exacta universal del estado final sin un trabajo independiente.

## 5. Mapa de archivos — qué tocar y qué proteger

### Analyzer moderno: proteger

| Ruta | Responsabilidad |
| --- | --- |
| `index.html` | Sección canónica V2, layout, evaluación, tabs, importación, Review/Flip y script de inicialización |
| `css/analyze-v2-shell.css` | Geometría y responsive certificado del shell V2 |
| `js/analyze-v2-shell.js` | Controlador/presentación moderna |
| `js/analyze-section.js` | Ciclo de vida y funciones compartidas de Analyze |
| `js/analyze-session.js` | Sesión del Analyzer |
| `js/analyze-game-import.js` | Importación de partidas |
| `js/analyze-setup-draft.js` | Edición/configuración de posición |
| `js/analyze-board-projection.js` | Proyección persistente del tablero |
| `js/analyze-variation-tree.js` | Árbol PGN/RAV |
| `js/play/analyze-handoff.js` | Transporte de contexto Play → Analyzer |

### Integración Play: revisar al depurar

| Ruta | Responsabilidad |
| --- | --- |
| `middleware.js` | Selección de documento HTML para `/play/*` |
| `js/caissa-navigation.js` | Salida al Analyzer canónico para Play oficial |
| `js/play/post-game-core.js` | Handoff postgame y salida |
| `js/play/post-game-experience.js` | Acción Analyze/Review del postgame |
| `js/play/play-route-controller.js` | Historial SPA del documento Play (no navegación real por sí mismo) |
| `js/play/performance/play-load-registry.js` | Carga de módulos/lazy bundles |
| `css/play-coach-review.css` | Estado visual de selección Coach |
| `play-v2-public-beta.html` | Documento Play generado |
| `api/_lib/play-v2-public-beta-document.js` | Export generado servido por middleware |
| `scripts/build-play-v2.mjs` | Generador de documentos Play (consultar instrucciones antes de regenerar) |

**No editar a mano documentos generados** como solución permanente: cambiar fuente/plantillas, ejecutar los generadores existentes, revisar diffs y validar integridad del output.

## 6. Diagnóstico rápido si el bug reaparece

| Observación | Sospecha principal | Primera prueba |
| --- | --- | --- |
| La URL acaba en `/?section=analyze&handoff=…` después de Analyze en Play | `pushState` dentro del documento Play heredado | Comprobar documento actual, `location.assign`, selector de documento oficial y versión JS |
| URL `/analyze?handoff=…` pero UI no es V2 | Carga/inicialización del shell V2 | Inspeccionar `data-caissa-analyze-v2`, `data-analyze-v2-ready`, CSS/JS V2 y consola |
| Analyzer moderno abre, pero sin partida | Handoff/token / ciclo de vida | Verificar validez y lectura del token, sesión, FEN/PGN y caducidad, sin exponer tokens privados |
| Se perdió posición/resultado/`selectedPly` | Contrato o serialización | Comparar payload antes y después de navegación |
| Varias instancias de Stockfish, análisis detenido | Ownership/cleanup | Revisar motor de Play vs. Analyzer y contratos de `AnalyzeSection` |
| Coach no resalta nivel | Estado/CSS del selector | Inspeccionar `play-coach-review.css`, estado seleccionado, foco y documentos generados |
| Tras Back la partida no reaparece | BFCache no usado | Confirmar URL y modo de origen; registrar limitación UX prevista |

**Procedimiento mínimo (sin mutaciones):**

1. Registrar URL inicial, URL final, ruta, nombre del documento cargado, SHA/versiones de assets y captura.
2. Comparar acceso directo a `/analyze` con un Analyze/Review desde `/play/*`.
3. Verificar que Play es servido por middleware real; no probar solo la SPA principal.
4. Confirmar una navegación de documento y `data-analyze-v2-ready="true"`.
5. Comparar integridad PGN/FEN/resultado/movimiento/orientación.
6. Revisar errores de consola, pestaña Network y workers del motor.
7. Identificar **el primer commit que cambió el comportamiento** con Git antes de modificar código.
8. Reparar primero la mínima divergencia; evitar duplicar rutas, shells o motores.

## 7. QA obligatorio y gate de publicación

### Casos manuales del propietario — aprobados para el candidato `44e557c0`

| ID | Escenario | Estado reportado |
| --- | --- | --- |
| HQA-01 | Play Game: jugar al menos una jugada → finalizar → Analyze → V2 | **PASS** |
| HQA-02 | Play Bots: handoff PGN/FEN y posición | **PASS** |
| HQA-03 | Play Coach: Review → V2, MultiPV, Game Review | **PASS** |
| HQA-04 | Coach: niveles normales/expandidos, resaltado verde | **PASS** |
| HQA-05 | Browser Back a ruta y modo original | **PASS** (limitación BFCache documentada) |
| HQA-06 | Móvil a 390×844: selector/touch/navegación | **PASS** |

Los PASS anteriores describen el **candidato aislado probado localmente**, no un pase automático de producción o de futuros commits.

### Antes de merge/deploy

- [ ] Confirmar SHA exacto y worktree limpio del candidato a publicar.
- [ ] Comparar SHA actual de `main` con el baseline y evaluar conflictos/intervenciones posteriores.
- [ ] Confirmar integridad de documentos generados contra las plantillas y scripts.
- [ ] Ejecutar build, tests Play/Analyzer, browser Chromium/WebKit y accesibilidad.
- [ ] Validar que V2 sigue funcional al acceder directamente a `/analyze`.
- [ ] Smoke test de autenticación/CSP para detectar regresiones (separar problemas preexistentes).
- [ ] Validar la navegación de los tres modos con **middleware real**.
- [ ] Preparar PR, SHA final, evidencia, plan de despliegue y rollback.
- [ ] Obtener aprobación explícita para merge y publicación.
- [ ] Tras deploy: smoke test en producción de los tres modos, V2, Coach y Back.

**No confundir un test `HTTP 200` con una garantía de que se ha cargado el shell correcto.** Comprobar markup y estado inicializado.

## 8. Retiro del legado — temporada separada, todavía NO aprobada

**Objetivo posterior:** que la única experiencia Analyzer accesible desde Play sea `/analyze`, sin fragmentos heredados que vuelvan a activarse accidentalmente.

Candidatos propuestos por auditoría/implementación; verificar consumidores primero:

1. `templates/play-v2-inline-analyze-section.html` (markup de la sección embebida).
2. `js/play/play-v2-inline-analyze.js` (controlador Play-only, sujeto a auditoría de dependencias).
3. CSS exclusivamente scoped bajo `.caissa-play-v2-inline-analyze` en `css/play-simplified-shell.css`.
4. Inyección de plantilla/scripts de legado en `scripts/build-play-v2.mjs`.
5. Regenerar `play-v2.html`, beta/public/QA y `api/_lib/play-v2-public-beta-document.js` con **generadores existentes**.
6. Actualizar pruebas de rutas y expectativas de Analyzer inline: `play-v2-inline-analyze-containment.spec.js`, `play-routing.spec.js`, `play-v2-product-boundary.spec.js`, `play-post-game-exits.spec.js`.
7. Revisar enlaces históricos `/?section=analyze` y mantener/redirigir hacia `/analyze` **preservando handoff** cuando exista.

**No eliminar sin auditoría:** `AnalyzeSection`, `analyze-handoff.js`, `analyze-v2-shell.*`, variaciones PGN/RAV, Game Review, Move Evidence, estilos `.analyze-*` compartidos, ni dependencias que siguen usando Coach/Bots/FICS/PGN Reader.

**Secuencia obligatoria:** hotfix publicado y smoke PASS → inventario de consumidores → PR de limpieza separado → QA → aprobación humana → despliegue.

## 9. Riesgos y asuntos fuera de alcance

- En el documento Play se reportaron advertencias CSP de **Clerk** relacionadas con `https://clerk.caissa-chess.org`; seguimiento **separado** de autenticación, salvo regresión introducida por el hotfix.
- Los controladores de Coach/Bots pueden depender de hooks inline de review aunque el destino final ya sea canónico.
- El Analyzer, FICS y el PGN Reader comparten contratos de handoff y componentes: cualquier limpieza necesita búsqueda de referencias completa.
- Evitar limpiar worktrees históricos, reflogs, guard refs o snapshots de recuperación sin una operación de higiene expresamente aprobada.
- Para diagnóstico, usar URL/estado sin exponer handoff tokens reales, sesiones o datos sensibles en reportes públicos.

## 10. Historia y puntos de restauración

| Etapa | Fecha | Ref | Significado |
| --- | --- | --- | --- |
| Analyzer V1.2 | 2026-06-14 | `42101cd` | Workspace de revisión de tres columnas y QA histórico |
| Analyze V2 | 2026-09-09 | `ac8ea70b41c704a8ad8307648a1ea699dbacba00` | Rediseño V2; tag `analyze-v2-certified` |
| V2.0.1 | 2026-09-09 | `b28328cffee2a001c66e2cb19ba51b3fc6ffadfc` | Tag `analyze-v2.0.1-certified`, ciclo de motor/URL import |
| Renderer móvil persistente | 2026-09-12/13 | `b39a4edacca796405320de5065a4caebd57f431d` | Una autoridad de sesión/tablero/motor |
| Reparación histórica del routing | 2026-09-29 | `c3a9698`; merge PR **#34** `c7581e3` | Handoff PostGame hacia Analyze canónico (SPA) |
| Upgrade PGN/RAV | 2026-09-30 | `b134135f3aba95491c26acba8ef460a9c142268e`; merge PR **#36** `2bef6d2` | PGN múltiple, variaciones, Flip, tipografía |
| Producción auditada | 2026-10-28 | `f8bf140f4b7d4779bce7e5167e3632ce866cf4aa` | Analyzer moderno V2 incluido en `main` |
| Hotfix Play → V2 + Coach verde | 2026-10-30 | `44e557c062ac580fad28b1d642ed764df0d07888` | Candidato aislado, 6/6 Human QA PASS; **no publicado aún** |

PRs clave:

- https://github.com/elcriollito/TVLavin-Chess-Game2/pull/34
- https://github.com/elcriollito/TVLavin-Chess-Game2/pull/36

Fuentes internas históricas a consultar si están disponibles:

- `docs/releases/CAISSA_ANALYZE_V2_0_1.md`
- `docs/reports/analyze-v1.2-stable-candidate-report.md`
- `docs/architecture/LEGACY_ANALYZE_COMPATIBILITY_RESTORATION.md`

Las ramas y worktrees históricos del Analyzer estaban disponibles en la auditoría de 2026-10-30; comprobar su existencia antes de confiar en ellos. **No restaurar wholesale** versiones antiguas si el shell actual ya existe: usar `b134135`/PR #36 como comparación, no como rollback indiscriminado.

## 11. Dónde guardar y cómo mantener este runbook

**Ruta propuesta en el repositorio:**

`docs/architecture/CAISSA_ANALYZER_ARCHITECTURE_RECOVERY.md`

Actualizar este documento **cuando cambien** rutas de navegación, documento servido por middleware, contratos de handoff, dependencias del motor, shell Analyzer, estados QA o política de recuperación.

Cada actualización debería incluir:

```text
Fecha | SHA del cambio | Qué cambió | Qué se comprobó | Estado de producción | Rollback conocido
```

**Regla de oro de CAISSA:** primero localizar la implementación existente y la causa raíz; después reparar el enlace más pequeño; solo entonces considerar limpieza del legado en una fase separada.
