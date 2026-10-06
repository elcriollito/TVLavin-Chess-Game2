# CAISSA Insights Account Profile v1 - Proposed Contract

**Estado:** propuesta de arquitectura; no migración aplicada ni funcionalidad publicada.
**Base:** Phase 0 en main `45de5ca2e0f4b3e711a6c39209fcd9caed7b6106`.
**Objetivo inmediato:** cada reporte terminado queda vinculado a la cuenta CAISSA correcta y puede recuperarse, con procedencia y calidad de evidencia explícitas.

## 1. Comportamiento del producto

| Situación | Comportamiento objetivo |
| --- | --- |
| Signed in + reporte terminado | Guardado automático idempotente; “Saved to your profile” solo tras confirmación del servidor |
| Guardado falla | Mantener resultado local, mostrar “Not saved” y Retry save; conservar exportación |
| Sin sesión | Respetar la política vigente de acceso; nunca anunciar guardado de cuenta |
| Recarga / otro dispositivo | Recuperar reportes del mismo owner mediante API |
| Cambio de cuenta / sign out | Cancelar solicitudes, limpiar vista/memoria de la cuenta previa y bloquear escrituras tardías |
| Nuevo análisis | Crear snapshot nuevo; no sobrescribir histórico |
| Reporte parcial o sin motor | Identificar estado y cobertura; excluir de métricas certificadas |
| PGN importado de otra persona | Identificar al jugador analizado; no incorporar automáticamente a “My Chess Profile” |
| Datos locales antiguos | Ofrecer importación explícita y etiquetar legacy/unverified; no atribuirlos silenciosamente al usuario |

La cuenta CAISSA **dueña del reporte** y el **jugador ajedrecístico analizado** son identidades diferentes. Un usuario puede estudiar las partidas públicas de un campeón. Eso no convierte esas partidas en evidencia de su propio estilo.

No cambiar pricing/entitlements en esta fase. Sign in, análisis y persistencia son responsabilidades separadas.

## 2. Modelo incremental

### MVP de guardado: dos tablas propuestas

| Entidad | Datos esenciales | Invariantes |
| --- | --- | --- |
| insight_datasets | id, user_id, source, subject, raw_pgn, input_hash, schema_version, created_at | Propietario de servidor; fuente/jugador explícitos; límite de tamaño; integridad del PGN |
| insight_reports | id, user_id, dataset_id, operation_id, input_hash, schema_version, method_version, analysis_status, verification_status, snapshot, created_at | Snapshot inmutable; unique(user_id, operation_id); relación a dataset del mismo dueño |

**subject** incluye provider, username normalizado, identidad seleccionada para PGN local, correspondencia de blancos/negras por partida y estado de verificación de vinculación con el owner. Analizar partidas públicas por username no acredita propiedad de esa cuenta externa.

**snapshot** conserva configuración, partidas seleccionadas, resultados, cobertura, análisis por jugada disponible, momentos, métricas, plan y provenance. El historial lista solo resúmenes; el detalle recupera el payload. PGN y snapshot no deben ir dentro de users ni dentro de metadata editable de Clerk.

Los límites concretos de partidas, bytes y tiempo se fijarán tras medir el reporte real. El endpoint debe rechazarlos de forma explícita, nunca truncar silenciosamente. Evitar payloads ilimitados desde el primer MVP.

El guardado de un snapshot recibido del navegador no certifica por sí solo su verdad ajedrecística. Diferenciar:

- **method:** legacy_heuristic, engine_browser, engine_server u otro método documentado.
- **verification_status:** client_reported, structurally_validated, server_verified.
- **analysis_status:** complete, partial, unavailable, failed, cancelled.

Validación estructural confirma propiedad, formato, legalidad del replay, límites y coherencia de IDs; **no** prueba que un cliente realmente haya ejecutado el motor a la profundidad declarada. No aceptar verified=true del cliente como autorización para rankings, cohortes o certificación.

### Modelo posterior, cuando la repetición lo justifique

| Entidad | Relación y función |
| --- | --- |
| user_games | Partidas importadas, fuente/ID, timestamps, jugadores/color, rating y reloj disponibles |
| game_analysis_runs | Análisis de una partida bajo versión y presupuesto determinados; cobertura por ply |
| insight_sessions + session_games | Conjunto histórico concreto de partidas y filtros |
| insight_reports | Snapshot de sesión y plan; referencias a runs |
| chess_profile_snapshots | Agregación derivada de partidas propias elegibles |
| training_recommendations | Reporte, evidencia y acción recomendada |
| training_sessions / outcomes | Práctica asociada, separada de los resultados reales en nuevas partidas |

No construir todas estas tablas por anticipado. Conservar el contrato v1 para una migración posterior sin romper reportes guardados.

## 3. Identidad y acceso

Reutilizar `authenticateRequest` y la resolución `users.id <- users.clerk_id`.

- Obtener owner exclusivamente de un token Clerk verificado y la fila canónica users.
- Ignorar/rechazar user_id, clerk_id, ownerId del body como fuente de autorización.
- Consultar y mutar siempre con restricciones por owner, incluido DELETE y paginación.
- RLS habilitado; sin grants/políticas de cliente para el MVP de servidor. Declarar los grants necesarios a service_role y revisar privilegios por defecto.
- No copiar una política auth.uid()=user_id sin integrar primero los subjects Clerk con los UUID canónicos.
- Una FK compuesta (user_id, dataset_id) garantiza que un reporte no referencia un dataset de otro owner.
- No-store/private en todo endpoint de reportes; logs de IDs y estados, sin PGN, email, FEN privado, reportes completos ni tokens.
- Migración ensayada en staging; producción solo al publicar la implementación validada.

La Library general tiene un contrato diferente. Mantener sus posiciones/colecciones intactas; no guardar un reporte agregado como una posición ficticia.

## 4. Contrato API propuesto

| Operación | Función | Reglas |
| --- | --- | --- |
| POST /api/insights/datasets | Validar e importar dataset del owner | Input bounded; hash canónico calculado en servidor |
| POST /api/insights/reports | Persistir snapshot | operation_id; mismo ID + mismo payload devuelve mismo reporte; conflicto devuelve 409 |
| GET /api/insights/reports | Listar historial resumido | Cursor estable created_at + id; límites; scope owner |
| GET /api/insights/reports/:id | Recuperar detalle | Igual respuesta 404 para inexistente o ajeno |
| DELETE /api/insights/reports/:id | Borrar reporte propio | Acción explícita; no borra datasets compartidos por otros reportes |

Los nombres finales pueden adaptarse al router Vercel existente sin alterar estas garantías.

Estados de cliente separados: computed -> saving -> saved, o computed -> save_failed. Un HTTP 200 vacío o un contador parcial no equivale a guardado. Respuesta debe incluir reportId, timestamp servidor y estado persistente.

Si la sesión se pierde entre cálculo y guardado, conservar un borrador local del owner original. Nunca reintentar automáticamente con la nueva cuenta.

El esquema del reporte y la idempotencia se validan en servidor. No permitir que un reintento cambie el snapshot ya guardado bajo el mismo operation_id.

## 5. Datos y análisis correctos antes del perfil

1. Validar cada replay PGN y separar partidas inválidas, inacabadas y variantes no soportadas. Conservar starting FEN, promociones, en passant, enroques y resultados.
2. Resolver jugador objetivo antes de calcular resultado. Filtrar color antes de limitar cantidad. Registrar missing/ambiguous identity.
3. Conservar metadatos originales de importación. Usar IDs del proveedor para dedup por owner; para PGN local evitar fusionar dos partidas distintas solo porque repiten jugadas.
4. Emplear una sesión de análisis con request/run IDs, ownership y cancelación. Reutilizar el registro de motores y los contratos de aislamiento, adaptándolos al batch; no tomar callbacks globales prestados sin control.
5. Usar únicamente MultiPV=1 para la evaluación principal. Preservar las alternativas como alternativas, si se solicitan.
6. Registrar score unit, perspectiva, mate separado, límites, depth/nodes efectivos, versión/identidad del motor y estado de cada búsqueda.
7. Obtener pérdidas desde la perspectiva de quien mueve. Una mejora no es un error. Comparar búsquedas equivalentes y refinar posiciones críticas antes de una afirmación fuerte.
8. Timeout, falta de motor o resultado faltante producen “unavailable/partial”, no evaluación 0. No derivar “good accuracy” de cero momentos cuando no hubo análisis suficiente.
9. Clasificar fases con una política explícita y versionada; usar ply y fullMove de forma coherente, y denominadores de oportunidades/jugadas.
10. Aplicar tags tácticos solo con evidencia específica. Una heurística se etiqueta hypothesis y no dispara automáticamente ejercicios de un motivo supuesto.
11. Analizar la secuencia de posiciones una vez: N+1 posiciones para N plies cuando sea compatible con el presupuesto, evitando repetir cada before/after. Cache keys incluyen FEN, motor, método y límites.
12. Yield/cancelación en importaciones grandes; no bloquear el tablero ni dejar una búsqueda activa al salir.

Profundidad 12 sola no garantiza una calidad idéntica entre posiciones o dispositivos. Benchmarks desktop/móvil definirán el preset. Accuracy será una métrica CAISSA versionada; no se anunciará que es igual a CAPS2 o Lichess sin validación y revisión de licencia/método.

## 6. Métricas: disponibilidad, no números decorativos

| Métrica inicial | Evidencia y denominador | Estado sin datos suficientes |
| --- | --- | --- |
| W/D/L propio | Resultado + jugador/color resuelto, partidas terminadas | Not enough identified games |
| ACPL / pérdida por fase | Jugadas propias con evaluación comparable, cantidad por fase | Analysis incomplete |
| Aperturas | ECO resoluble, resultados propios, número por apertura | Missing opening data |
| Conversión | Oportunidades de ventaja definidas por método + resultado posterior | No eligible opportunities |
| Resiliencia | Posiciones inferiores y recuperación bajo método documentado | No eligible opportunities |
| Gestión de tiempo | %clk/%emt y control/incremento interpretados correctamente | Clock data unavailable |
| Error patterns | Eventos confirmados y cantidad de oportunidades; evidencia FEN/PV | No verified pattern |

En v1 mostrar observaciones, ejemplos y tamaño de muestra. No traducir automáticamente todo a “skill 76/100”.

Trends comparan ventanas temporales y partidas **distintas** elegibles, no dos reportes repetidos del mismo PGN. Separar plataforma, time control, color y método/engine cuando su mezcla haga inválida la comparación. Fecha jugada y fecha análisis son campos diferentes.

Comparación con pares necesita una cohorte real, permisos de uso, tamaño de muestra, estratos de rating/plataforma y política versionada. No usar un benchmark inventado “players around your rating: 63”.

## 7. Mentor y entrenamiento

El Mentor actual ya valida owner, fuente, estado completed y temas. Integración requerida:

- Guardar y recuperar un reportId estable; obtener desde backend el detalle autorizado al abrir Mentor.
- Extender de forma controlada el contrato de posición para origen insights-study; /insights no está permitido actualmente como proveedor contextual.
- Snapshot de momento: reportId, gameId/runId, ply, FEN before/after, lado del jugador, SAN/UCI, evaluación/mate, PV y provenance.
- Notificación de cuenta solo a partir de un análisis elegible. Un CustomEvent local sirve para actualizar una página; no sustituye persistencia ni verificación.
- Mentor explica la evidencia y reconoce incertidumbre; no presenta tags heurísticos como hechos.
- Separar estudio post-partida de juego activo conforme a las políticas existentes.

**Puzzles:** traducir tags confirmados a taxonomía real del catálogo, con recommendation_id, fuente y versión de datos. No suponer que todas las etiquetas actuales de Coach tienen un tema equivalente. Una práctica completada mide práctica; no demuestra automáticamente mejor desempeño en partidas.

**Retry:** practicar desde el FEN original en estado de estudio separado, conservar el PGN fuente y evaluar la alternativa. Para el tablero, reutilizar el patrón Board + Workspace y CAISSA Quiet Drag. La vista agregada de perfil puede ser un dashboard; el patrón de tablero corresponde al estudio de momentos.

## 8. Plan y gates

| ID | Trabajo | Definition of Done |
| --- | --- | --- |
| INS-001 | PGN + target identity + outcomes | Casos blancos/negras, derrota/tablas/inacabado, jugador ajeno, SAN inválido y FEN inicial correctos |
| INS-002 | Batch engine ownership + scoring | MultiPV principal, mate, timeout, cancelación, stale response, pérdida favorable y cleanup probados |
| INS-003 | Dataset/report API y persistencia | Mismo reporte recuperado tras recarga y en navegador limpio; snapshot inmutable e idempotencia |
| INS-004 | Aislamiento owner | Usuario A/B no ven ni escriben datos ajenos; cambio de owner invalida requests; sin sesión=401 |
| INS-005 | Historial y recuperación | Lista estable; Start Fresh conserva reportes; Delete explícito borra solo seleccionado |
| INS-006 | Métricas verificables | Cobertura/denominadores; null cuando falta evidencia; método versionado |
| INS-007 | UX de Insights | Desktop y móvil; estados vacío/analizando/partial/save_failed; accesibilidad y estabilidad |
| INS-008 | Mentor / Retry / Puzzles | Posición correcta de principio a fin; recomendación y outcome relacionados |
| INS-009 | Trends | Dedup, comparabilidad y muestra visibles; sin mejora inferida de reanálisis |
| INS-010 | DNA / peer groups | Experimento y metodología propia validados antes de publicar |

La primera entrega funcional integra INS-001 a INS-005. No anunciar “report saved to your profile” antes de cumplirlos. INS-006 en adelante puede publicarse progresivamente.

**Validación de persistencia:** guardar una sesión sintética en staging, recargar, recuperar en contexto limpio autenticado del mismo usuario y comprobar aislamiento con segundo usuario. Probar doble envío, error/retry, cierre de sesión durante guardado y payload inválido. No gastar créditos del usuario ni alterar ratings de Puzzles para certificar esta función.

**Validación de motor:** pruebas con datos UCI deterministas y un smoke WASM real; desktop/móvil para rendimiento. Los 12 tests de rutas existentes son necesarios pero insuficientes para estos gates.

## 9. Alcance y decisiones pendientes

No están implementadas todavía las tablas ni APIs de este documento. La propuesta no implica un cambio automático de planes de pago, proveedor de identidad, motor publicado, progreso de Puzzles o esquema de Library.

Antes de Phase 1: medir volumen/límites y escoger la política de vinculación de cuentas externas para incorporar partidas a My Profile. Se puede guardar un reporte privado sobre cualquier jugador identificado sin certificar que ese jugador es el dueño de CAISSA.

La temporada comienza por la verdad de los datos y la recuperación del historial. El rediseño utiliza esos contratos como base.
