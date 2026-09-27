# CAISSA Puzzles 1.0: catálogo completo — decisión de infraestructura

Fecha de comprobación: 2026-09-27. Estado: ensayo remoto Free completado y
eliminado; ningún recurso permanente ni importación completa fue creado.

## Alcance e inventario comprobado

- Único conjunto presupuestado: 6,100,952 puzzles Lichess, publicación
  2026-09-10, 304,429,328 bytes Zstandard, SHA-256
  `95fd454bec9efe8f940d5863d5db4c57474f281a865834997bd8cb5d6a149bb9`.
- SQLite local verificado: 2,166,308,864 bytes, `integrity_check=ok`; conserva
  las 11 columnas, incluido `GameUrl`.
- Quedan expresamente fuera los 2.57 TB de partidas/evaluaciones Lichess. Los
  PGN de campeones y los índices de Opening Database son otro producto.
- Cloudflare: cuenta accesible; R2 `caissa-openingdb` tiene 258 objetos y
  17.2 GB. Se creó una D1 y un Worker temporales para el ensayo autorizado y
  ambos se eliminaron al terminar; `wrangler d1 list` volvió a `[]`. No se creó
  ningún bucket y no se modificó `caissa-openingdb`.
- Supabase: organización **Free**, spend cap activo; dos proyectos activos y
  uno inactivo. Este checkout no está enlazado a ningún proyecto. El límite
  Free de base de datos es 500 MB, por lo que el catálogo completo no cabe.
- Vercel: `tv-lavin-chess-game2` sigue alojando la web. En los últimos 30 días
  registró 665,814 solicitudes y 48,627 invocaciones de Functions. No hay
  variables `CAISSA_PUZZLE_*` ni integración de catálogo conectada.
- PR #21: abierto y no fusionado. El commit `40dc6eb` permanece en su historia;
  Scanner y las dos vistas previas Vercel estaban en verde antes de añadir este
  informe de ensayo.

La implementación real conserva correctamente el fallback de 1,404 puzzles.
`/api/puzzles/select` limita rango (600 puntos), temas (12), lote (16), página
(50), aplica 60 solicitudes/minuto/IP, timeout de 3 s y caché de 60 s. Hoy arma
una consulta PostgREST privada con `service_role`; el modo SQLite sólo se activa
explícitamente fuera de producción. El cliente mantiene un `seen` por sesión.
La debilidad para 6.1 M es que pagina con `OFFSET=page*limit` y orden fijo: se
mantiene para la vista previa, pero no es el contrato de paginación definitivo.
Las migraciones Supabase ya están correctamente cerradas por RLS forzada y usan
GIN/B-tree; no se aplicaron.

## Límites y precios oficiales vigentes

Fuentes: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/),
[D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[R2 limits](https://developers.cloudflare.com/r2/platform/limits/),
[Supabase pricing](https://supabase.com/pricing),
[Supabase compute/disk](https://supabase.com/docs/guides/platform/compute-and-disk),
[Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase),
[Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress) y
[Supabase backups](https://supabase.com/docs/guides/platform/backups).

| Servicio | Límite/coste que gobierna la decisión |
| --- | --- |
| D1 Paid | 10 GB por base (no ampliable), importación máxima 5 GB, consulta máxima 30 s, 30 días Time Travel, 25 mil millones de filas leídas/mes y 50 millones escritas/mes incluidas, 5 GB incluidos; exceso $0.001/M lecturas, $1/M escrituras, $0.75/GB-mes. |
| Workers Paid | Mínimo $5/mes; 10 M solicitudes y 30 M CPU-ms incluidos; exceso $0.30/M solicitudes y $0.02/M CPU-ms. CPU por invocación: 5 min máximo, 30 s por defecto; 128 MB RAM. |
| R2 Standard | $0.015/GB-mes, $4.50/M Class A, $0.36/M Class B; 10 GB, 1 M A y 10 M B gratuitos por cuenta; egreso gratis. El almacenamiento/operaciones gratis ya se comparten con los buckets existentes. |
| Supabase Pro | $25/organización, $10 de crédito de cómputo; Micro $10/proyecto, Small $15, Medium $60; 8 GB/proyecto incluidos y $0.125/GB adicional; 250 GB de egreso y $0.09/GB adicional; copia diaria, 7 días. PITR 7 días añade ~$100/mes. |

La muestra D1 remota proyecta ~2.78 GB decimales (2.59 GiB) para la base
completa y ~2.93 GB para el SQL de importación. Con 15% de reserva son ~3.20 y
~3.37 GB, respectivamente: bajo 10 GB por base y 5 GB por importación, pero el
artefacto final seguirá siendo la autoridad. Una base por encima de 8 GB se
rechaza aunque aún esté bajo el límite contractual. D1 procesa cada base de
forma monohilo; por eso producción exige consultas indexadas y réplicas
globales mediante Sessions API. R2 no ejecuta SQL: sólo es viable con pools
invertidos precalculados, no subiendo el SQLite como objeto consultable.

## Medición y diseño de selección

Medición del SQLite completo, siete ejecuciones:

| Consulta actual | Mediana local | Plan |
| --- | ---: | --- |
| Fork 1700–1900, calidad estándar | 0.123 ms | índices parciales + PK de tema |
| Equality 1700–2100, calidad relajada | 0.058 ms | índice parcial Equality |
| Sicilian Defense 1700–1900 | 545.070 ms | crea B-tree temporal para ordenar |

La apertura demuestra que copiar el esquema actual a D1 no basta. El primer
ensayo local reversible materializó 48,067 puzzles y 49,685 entradas
(13,467,648 bytes) con la clave primaria
`(pool_key, shuffle_key, puzzle_id)`. Resultados:

| Pool candidato | Mediana local | Candidatos leídos por el merger | Plan |
| --- | ---: | ---: | --- |
| Fork | 1.428 ms | 36 | búsqueda por PK |
| Sicilian Defense | 1.268 ms | 36 | búsqueda por PK; sin sort temporal |
| Equality | 2.558 ms | 15 | búsqueda por PK |

`pool_key` codifica dimensión (`theme`/`opening`), etiqueta oficial, nivel de
calidad disjunto y banda de 100 puntos. `shuffle_key` es un hash estable de 48
bits. El Worker elige un comienzo aleatorio, recorre circularmente por cursor,
fusiona como máximo los pools acotados y elimina duplicados. El cursor opaco va
firmado y contiene versión, hash de filtros, última clave, estado de vuelta y
caducidad. Así no hay `OFFSET`, `ORDER BY random()` ni repetición sistemática;
el `seen` de la sesión del navegador continúa como defensa adicional.

El catálogo completo contiene 27,614,296 relaciones tema-puzzle (73 temas) y
2,429,518 relaciones apertura-puzzle (1,589 etiquetas). Sumadas a 6,100,952
filas canónicas dan ~36.14 M escrituras lógicas para una base nueva si cada
relación se guarda una sola vez y las tablas `WITHOUT ROWID` evitan un índice
secundario duplicado. Ese diseño mantiene la primera carga dentro de las 50 M
escrituras mensuales incluidas. Incluso sumando el máximo teórico de 149,580
contadores de pool y el factor DDL medido, la extrapolación queda por debajo de
36.3 M `rows_written`.

### Ensayo D1 Free remoto autorizado

La muestra reproducible usa IDs con prefijos `00`–`04`, todos los puzzles
Equality de calidad relajada, 1,000 Sicilian Defense de calidad estándar y el
caso `4TN7E`. Contiene 10,733 puzzles, 52,232 relaciones indexadas, 5,738
contadores y 3 filas de metadatos: 68,706 filas lógicas. El SQL mide 5,569,887
bytes y su SHA-256 es
`6e0c8b3db194ec17a6b988fceaa54728719c82a9dfffc9fe1b145b51cf96ddb4`.
La validación local dio `integrity_check=ok` y 5,275,648 bytes.

La importación remota ejecutó 1,724 sentencias en 6.4 s de pared: 2,268.632 ms
SQL, 68,714 `rows_written`, 4 `rows_read` y 5,287,936 bytes finales. Los conteos
remotos coincidieron exactamente. Quince solicitudes consecutivas por caso,
desde Florida hasta Worker MIA y D1 ENAM, dieron:

| Caso (12 puzzles) | HTTP p50 / p95 | Worker wall p50 / p95 | D1 p50 / p95 | `rows_read` | consultas |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fork 1700–1900 | 183.00 / 319.81 ms | 88 / 151 ms | 1.452 / 4.131 ms | 80 | 4 |
| Sicilian 1700–1900 | 178.55 / 309.10 ms | 86 / 96 ms | 1.406 / 4.023 ms | 100 | 4 |
| Equality 1700–2100 | 223.22 / 276.13 ms | 150 / 167 ms | 2.755 / 3.329 ms | 54 | 11 |

Cloudflare Tail observó 0–3 CPU-ms por invocación, bajo el límite Free de
10 ms; la espera D1 no cuenta como CPU. Todas las selecciones escribieron 0
filas. La segunda página leyó 76/96/21 filas para Fork/Sicilian/Equality y tuvo
0 IDs repetidos respecto de la primera. El 404 sin token confirmó el cierre del
Worker de ensayo. El contador final de la base fue 303 consultas, 301,922
`rows_read` y 68,714 `rows_written`; incluye los `COUNT(*)` deliberadamente
completos de validación y no representa el flujo de usuario.

La extrapolación lineal por fila es `5,287,936 × 36,144,766 / 68,706`, o
2,781,870,715 bytes antes de contadores completos y reserva. Cumple los umbrales
de tamaño, `rows_read <= 500` y CPU `< 10 ms`. No se activó read replication en
la muestra Free; el Worker sí usó Sessions API, y producción deberá habilitar
réplicas antes del corte. La evidencia estructurada está en
`docs/research/evidence/puzzle-d1-free-trial-2026-09-27.json`.

## Coste incremental

Supuestos mensuales: bajo 100,000 selecciones; medio 5 M; alto 50 M. Cada
respuesta contiene hasta 12 puzzles y ~6 KB. El ensayo midió 54–100 filas y
0–3 CPU-ms; el presupuesto conserva 100 filas y 5 CPU-ms por selección. Para R2
puro, dos GET por selección y 4 GB de objetos/índices. El backup R2 de D1 se
presupuesta en 4 GB, por encima de la proyección D1 de 2.78 GB.

Fórmulas:

- Worker = `5 + max(0,R-10M)*$0.30/M + max(0,5R-30M)*$0.02/M`.
- D1 reads = `100R`; incluso 50 M selecciones son 5,000 M, bajo los 25,000 M
  incluidos.
- Supabase egress = `max(0,6KB*R-250GB)*$0.09/GB`.
- Supabase dedicado = `$25 + cómputo de proyectos - $10 crédito + excesos`.

| Arquitectura permanente | Bajo | Medio | Alto | Qué incluye |
| --- | ---: | ---: | ---: | --- |
| **D1 + Worker + backup R2** | **$5.06** | **$5.06** | **$21.46** | Worker $5/$5/$21.40; D1 $0 dentro de cuotas; ~4 GB R2 $0.06; egreso y Time Travel $0. Si Workers Paid ya está activo, restar $5. |
| R2 indexado + Worker | $5.06–$5.42 | $5.06–$8.66 | $53.86–$57.46 | Rango según quede cuota Class B compartida; alta complejidad de build/merge y peor coste de operaciones a tráfico alto. |
| Supabase dedicado | $45.00 | $50.00 | $99.50 | Pro con los dos proyectos actuales más puzzle Micro/Small/Medium; alta añade 50 GB de egreso. Disco hasta 8 GB y backup diario incluidos. |

Importar en el proyecto Supabase de producción bajaría el fijo a ~$35/$40/$89.50,
pero mezcla un catálogo público voluminoso con identidad/progreso y aumenta el
radio de fallo; se descarta. Si PostgreSQL supera 8 GB, añadir `$0.125` por GB.
PITR no está incluido en la tabla; sumaría ~$100/mes y no se justifica para un
catálogo público reconstruible.

Coste de ensayo frente a producción:

| Acción | Coste estimado | Estado |
| --- | ---: | --- |
| Ensayo local ejecutado | $0 | Completo; temporal eliminado automáticamente. |
| D1 remoto con muestra <500 MB | $0 dentro de Free | Completo: 5.29 MB, Worker y D1 eliminados; no hubo cargo ni recurso persistente. |
| Primera carga D1 completa | ~$5.06 primer mes a tráfico bajo | Requiere aprobación separada de Workers Paid. Proyección ~2.78 GB y <36.3 M escrituras; el artefacto final debe confirmar <5 GB SQL y <8 GB D1 antes de importar. |
| Ensayo Supabase completo de 24 h | hasta ~$35.32 el primer mes | Pro $25 + dos Micros $20 - crédito $10 + rama $0.01344/h; no autorizado. |
| Producción Supabase dedicada | desde $45/mes | No autorizada. |

## Decisión

**Primaria:** web en Vercel; catálogo público e inmutable en una D1 exclusiva,
consultado por un Worker con read replication/Sessions API; archivo oficial,
manifiesto y export SQL versionado en un bucket R2 nuevo para puzzles. Nunca usar
`caissa-openingdb`. El Worker conserva el contrato de `/api/puzzles/select`; el
fallback de 1,404 puzzles permanece activo durante despliegues o incidentes.

**Datos de cuenta futuros:** rating, progreso, racha e historial en Supabase
PostgreSQL, en tablas separadas con RLS y autorización servidor/Clerk. Nunca en
el D1/R2 público. El catálogo D1 es de sólo lectura y una exploración de motor no
escribe resultados de usuario.

**Alternativa:** proyecto Supabase dedicado para el catálogo, con los índices
GIN/B-tree ya preparados y paginación por clave, si la importación D1 supera 8
GB, `rows_read` p95 supera 500, CPU p95 supera 10 ms o las consultas remotas no
cumplen latencia. No usar `OFFSET` en producción.

Actualización/recuperación: construir y validar una base nueva localmente,
importarla con nombre versionado, habilitar réplicas, probar, cambiar el binding
de forma blue/green y conservar la versión anterior durante la ventana de
Time Travel. R2 conserva fuente + checksum + export. Nunca actualizar 6.1 M filas
en el D1 activo.

## Próxima decisión solicitada al propietario

No se debe ejecutar aún. El ensayo pasa los umbrales y mantiene la recomendación
D1. La siguiente acción concreta requiere nueva aprobación: activar Workers Paid
por **$5/mes**, generar el SQL completo, detenerse si supera 5 GB o proyecta una
D1 de 8 GB, y sólo entonces crear una D1 permanente versionada y un bucket R2
separado `caissa-puzzles`. Coste incremental estimado a tráfico bajo:
**$5.06/mes** ($5 Worker + ~$0.06 por 4 GB R2; D1 y egreso dentro de incluidos).
No se importará el catálogo completo ni se activará el plan de pago sin esa
decisión explícita.
