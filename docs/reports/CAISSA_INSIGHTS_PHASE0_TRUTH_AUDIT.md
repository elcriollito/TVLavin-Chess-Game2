# CAISSA Insights - Phase 0: Architecture & Truth Audit

**Estado:** auditoría completada; implementación del nuevo perfil pendiente.
**Fecha local:** 2 de octubre de 2026 (America/New_York). Evidencia técnica: 3 de octubre, UTC.
**Código auditado:** `45de5ca2e0f4b3e711a6c39209fcd9caed7b6106`, rama `main`.
**Trabajo:** `docs/insights-phase0-truth-audit-2026-10-03`.
**Alcance:** /insights, Coach Report agregado, importación, almacenamiento, Clerk, Supabase y puntos de integración con Mentor/Puzzles.

## 1. Respuesta a Alexander

**Hoy, generar un Coach Report de Insights no lo guarda en el perfil de la cuenta, aunque el usuario esté signed in.**

El perfil importado se escribe en `localStorage.caissa_insight_profile`. El Coach Report generado se asigna a `coachReportData`, una variable en memoria. El botón Export crea un JSON descargable. No hay escritura/recuperación del reporte en localStorage, IndexedDB ni una API de Insights en esta versión.

Las claves `caissa_coach_report` y `caissa_insight_sessions` aparecen en operaciones de borrado; eso no constituye un mecanismo de guardado. En concreto, sessions lleva el comentario “Future: session history”.

La autenticación o un control de créditos no crea persistencia por sí solo. La Library de CAISSA sí tiene infraestructura local y de nube, pero el flujo de Insights no escribe sus reportes allí.

## 2. Mapa de funcionamiento actual

| Superficie o dato | Dueño actual | Persistencia observada |
| --- | --- | --- |
| /insights | Rewrite a index.html; js/insights-section.js abre el modal | No página analítica independiente |
| Dataset importado / perfil | insightProfile, app.js | Un único JSON de localStorage, sin owner |
| Metadata de importación online | lastGameImport | localStorage, separada del dataset |
| Radar y narrativa | calculateRadarMetrics / generateCaissaNarrative | Se recalculan desde el PGN |
| Coach Report agregado | generateCoachReport / coachReportData | Memoria y exportación manual JSON |
| Sesiones históricas | Clave mencionada solo para borrado | No implementación observada |
| Library local | caissa_library, IndexedDB v2 | positions, tags, collections, sync_metadata, deletions |
| Library de nube | /api/library/push y pull | library_positions y library_collections, por users.id |
| Progreso de Puzzles | /api/puzzles/progress | Tablas dedicadas por users.id |
| Mentor antiguo | MentorAI.onInsightDataAvailable | Conserva datos en memoria; personalización marcada como futura |
| Mentor actual | mentor-insights.js / mentor-page.js | Controlador local de notificaciones con owner y evidencia; no historial cloud |

Los controles de Insights y Coach se inicializan antes del bootstrap diferido de Play. El motor compartido se inicializa globalmente, pero su disponibilidad sigue siendo una condición de ejecución. No se infiere que /insights tenga necesariamente el motor apagado.

## 3. Hallazgos reproducibles

Estos resultados proceden de funciones del código auditado ejecutadas en Node VM. Las entradas son partidas y evaluaciones sintéticas. No son partidas del usuario ni una medición del rendimiento de Stockfish en producción.

| ID | Prioridad | Resultado observado | Implicación |
| --- | --- | --- | --- |
| I0-01 | P0 | Solo se guarda caissa_insight_profile, sin ownerId/userId | Un navegador compartido puede presentar el mismo dataset a otra cuenta; no hay aislamiento en esta clave |
| I0-02 | P0 | 2 victorias y 1 derrota de Alex producen wins=3, losses=0 en Coach | El resultado se atribuye sin resolver el jugador; userColor permanece unknown |
| I0-03 | P0 | Invertir todos los resultados decisivos deja idéntico el radar | Los ocho valores no son mediciones de habilidades por jugada |
| I0-04 | P0 | Start Fresh / Keep History borra la única clave de perfil guardada | El texto promete un historial que este flujo no conserva |
| I0-05 | P0 | PGN con SAN inválido cuenta como una partida, con cero jugadas | La validación acepta encabezados sin un replay válido |
| I0-06 | P0 | White y Black analizan las mismas 3 partidas; no se escribe el reporte | El filtro es un return true; el reporte no es recuperable tras recarga |
| I0-07 | P0 | Fallback sin motor falla al consultar move.before en Chess.js 0.10.3 | Esa versión no entrega before en history verbose; hay una incompatibilidad real |
| I0-08 | P0 | MultiPV 1,2,3 termina mostrando score=0.2 / Nf3, aunque bestmove=e4 | Se toma la última línea, no necesariamente la principal; además se pierden callbacks previos |
| I0-09 | P0 | Cambio favorable para blancas 0 a +2 se registra como loss=2 | abs(evalAfter-evalBefore) confunde una mejora con una pérdida |
| I0-10 | P0 | PGN desde FEN de dos reyes se analiza desde posición inicial | chess.reset() descarta el FEN inicial de la partida |

**Probes:** `node tools/insights/audit-phase0.mjs`.
**Evidencia:** `docs/reports/evidence/insights-phase0-2026-10-03.json`.

### Qué significan actualmente los valores del radar

| Etiqueta | Cálculo del código actual | Lo que permite afirmar |
| --- | --- | --- |
| Tactics | Partidas decisivas cortas, incluyendo derrotas del jugador | Frecuencia de partidas decisivas cortas |
| Strategy | Frecuencia de partidas largas | Duración de las partidas |
| Opening | Diversidad ECO y presencia de ese encabezado | Cobertura/diversidad de datos ECO |
| Endgame | Partidas de más de 80 plies | Duración, sin confirmar el material o la técnica |
| Precision | Resultados decisivos y tablas | Distribución de resultados, sin evaluar movimientos |
| Aggression | Inverso de duración promedio | Tendencia a partidas más cortas |
| Defense | Frecuencia de tablas | Porcentaje de tablas |
| Consistency | Variación de duración | Regularidad de duración |

**Decisión propuesta:** mantener estadísticas descriptivas verificables y retirar/reformular las afirmaciones de habilidad hasta tener evidencia de jugadas. No convertir estas ocho fórmulas en el nuevo Chess Profile.

### Otras limitaciones confirmadas por lectura

- Coach solicita profundidad 12 y MultiPV 3, pero no almacena una evaluación para cada jugada. Guarda principalmente momentos seleccionados. Eso no alcanza para una Accuracy by Phase fiable.
- `getEngineEvaluation` puede resolver con score=0/depth=0 al no recibir evidencia. Un timeout o un dato faltante no equivale a una posición igualada.
- Mate se recibe por separado, pero el análisis convierte score=null a cero y omite su semántica.
- El clasificador usa reglas simplificadas. Por ejemplo, Back Rank comprueba rey en primera/última fila y presencia de torre/dama rival; no demuestra una debilidad táctica.
- OPENING_MOVES=15 se compara con ply: el umbral es 15 medios movimientos. Además classifyError consulta chess.history().length de una instancia recién creada desde FEN, por lo que ese contador es cero.
- Los errores de ambas piezas de color se agregan sin separar al usuario del oponente. Las fases se comparan por conteos, sin denominadores de jugadas.
- La importación online reconstruye el dataset desde los PGN y añade source; pierde la relación estructurada con id, username y playedAt de ImportedGame. No construye estadísticas de reloj por jugada ni conserva rating como campo analítico.
- Refresh vuelve a parsear y no reconstruye el source asignado previamente.
- El flujo compartido toma control directo de App.engine.onInfo/onBestMove; no aporta una sesión de análisis aislada, cancelación/reanudación del reporte ni limpieza garantizada mediante finally.
- El cliente de Library envía campos snake_case que push.js no acepta uniformemente, y marca elementos como synced a partir de un HTTP 200. No conviene utilizar este flujo como atajo para reportes sin auditar su contrato.

## 4. Supabase y autenticación: evidencia real

Se consultaron únicamente metadatos, permisos y claves estructurales, mediante transacciones **READ ONLY** en CAISSA-PRODUCTION-DO-NOT-DELETE, PostgreSQL 17.

Confirmado:

- `public.users.id` es UUID; `clerk_id` es texto.
- Existen `library_positions`, `library_collections`, `library_sync_log`, `puzzle_training_attempts` y `puzzle_training_progress`.
- No aparecen tablas/vistas de usuario dedicadas a Insights, Coach Reports, historial de análisis o Chess Profile en el inventario consultado.
- Library ofrece `engine_report` y `game_context` JSONB por posición, y `game_metadata` por colección. No se observó un flujo que guarde allí Coach Report.
- RLS está habilitado en users, Library y Puzzles; las tablas consultadas no tienen políticas para clientes ni grants a anon/authenticated. El acceso existente es por backend con service_role y restricciones explícitas por user_id.
- El único nombre de función de Coach observado corresponde a acceso/entitlement del modo de juego, no a persistencia de este reporte.

**Ruta que se debe reutilizar:** JWT Clerk verificado en servidor -> búsqueda de users.id por clerk_id -> user_id establecido en servidor -> operación privada.

No usar un user_id del body ni asumir que auth.uid() de Supabase equivale al UUID de users cuando la identidad real entra por Clerk.

## 5. Qué reutilizar y qué falta conectar

**Reutilizable:** auth.js, resolución users UUID, patrón privado/no-store de Puzzles, registro de motor, estándares de tablero y Quiet Drag, contratos de evidencia de Mentor y sus controladores de cambio de owner.

**Pendiente:** un productor de análisis completo y verificable de cuenta que emita/recupere evidencia para Mentor. La página Mentor escucha `caissa:account-analysis-completed`; el generador agregado de app.js no emite ese evento. Un evento de navegador tampoco atraviesa por sí solo una navegación entre páginas.

**Puzzles:** puede recibir recomendaciones por temas, pero los intentos actuales no contienen una relación con un reporte o una recomendación. Tener progreso persistente no demuestra que ya exista la medición del ciclo Insights -> Training -> Insights.

La nueva conexión necesita IDs y recuperación por API, más un contexto seguro para posiciones críticas; debe respetar la separación existente entre estudio y ayuda durante juego activo.

## 6. Ideas externas: adoptar con requisitos de datos

| Referencia oficial | Idea útil para CAISSA | Requisito antes de publicarla |
| --- | --- | --- |
| Lichess Insights | Preguntas y filtros por apertura, color, fase, pieza y tiempo | Jugadas, identidad y denominadores; reloj para tiempo |
| Aimchess | Convertir patrones en entrenamiento; conversión y defensa | Posiciones y oportunidades verificadas; cohortes propias para peer comparison |
| DecodeChess | Explicar amenazas, planes y alternativas | Handoff de FEN, jugada, PV, evaluación y procedencia hacia Mentor |
| Chess.com Game Review | Momentos clave, Retry y separación de Self Analysis | Replay estable de partida/posición y evaluación fiable |
| Lichess Accuracy | Método explícito basado en evaluación de jugadas | Definir CAISSA metric_version; no prometer equivalencia con otros sitios |

Propuestas propias para este season:

1. **Calidad de evidencia visible:** partidas importadas/analizadas, jugadas evaluadas, cobertura de relojes, rango de fechas y versión del motor.
2. **My Insights History:** reportes recuperables con fecha, fuente, jugador analizado y estado de guardado.
3. **Dos preguntas útiles al abrir:** “¿Con qué apertura obtengo mejores posiciones?” y “¿En qué fase pierdo más ventaja?”. Añadir más dimensiones cuando haya datos.
4. **Critical positions:** revisar en tablero, Ask Mentor y Retry desde el mismo snapshot.
5. **Train this pattern:** enlazar solo motivos confirmados a temas del catálogo, con recommendation_id; evaluar cumplimiento del entrenamiento separadamente del progreso en partidas.

Peer groups, Chess DNA y parecido con campeones quedan para una fase posterior. Requieren población/comparabilidad y un método validado; el radar existente no los sostiene.

## 7. Secuencia de implementación

El contrato propuesto y los criterios de aceptación están en `docs/architecture/CAISSA_INSIGHTS_ACCOUNT_PROFILE_V1.md`.

| Fase | Resultado esperado | Dependencia |
| --- | --- | --- |
| 1A - Correctness | PGN válido, jugador/color, resultados propios, replay FEN y análisis fiable | Hallazgos I0-02/05/06/07/08/09/10 |
| 1B - Account History | Reporte completo guarda en cuenta y se recupera en otro navegador | API privada, ownership, snapshots y validación |
| 2 - Real Metrics | Calidad por fase, aperturas y conversión con cobertura visible | Análisis por jugada y método versionado |
| 3 - UX | Insights como superficie de perfil e historial | Datos fiables y persistentes |
| 4 - Training | Posiciones -> Mentor / Retry / Puzzles -> resultados asociados | Contratos de evidencia, temas e IDs |
| 5 - Trends / DNA | Evolución sobre muestras comparables; cohortes opcionales | Historial suficiente y validación del método |

## 8. Verificación y límites

- **12/12 tests existentes pasan:** insight-route-initialization y insight-coach-route. Cubren controles/rutas y eventos; no certifican el contenido ajedrecístico ni la persistencia.
- **10 casos reproducibles** ejecutados sobre funciones del commit auditado, con Chess.js 0.10.3 incluido en el repositorio.
- Lectura del árbol completo y fuentes fijadas por commit; consultas de esquema de producción en modo READ ONLY.
- Fuentes oficiales externas consultadas; se distinguen características de terceros de propuestas para CAISSA.
- No cambios de UI, esquema, cuentas, ratings, créditos o lógica productiva en Phase 0. El PR contiene documentación, evidencia y una herramienta diagnóstica.
- No se realizó login/smoke de recuperación entre dispositivos ni benchmark con WASM real. Tampoco se cotejó el SHA de un deployment Vercel: el código auditado es main; la base de datos consultada es producción. Esas verificaciones pertenecen a la implementación.

## Referencias

- [Código auditado](https://github.com/elcriollito/TVLavin-Chess-Game2/tree/45de5ca2e0f4b3e711a6c39209fcd9caed7b6106)
- [CAISSA Insights](https://www.caissa-chess.org/insights)
- [Lichess Chess Insights](https://lichess.org/@/lichess/blog/chess-insights/VmZbaigA)
- [Aimchess](https://aimchess.com/)
- [DecodeChess features](https://decodechess.com/features/)
- [Chess.com Game Review](https://support.chess.com/en/articles/8584089-how-does-game-review-work)
- [Lichess Accuracy](https://lichess.org/page/accuracy)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase changelog](https://supabase.com/changelog?types=breaking-change)

El changelog de Supabase advierte un cambio de exposición automática de tablas a Data API previsto para el 30 de octubre de 2026. La implementación debe declarar grants de servidor explícitos y comprobarlos; no depender del comportamiento automático de nuevas tablas.
