# CAISSA Public Identity — informe de remediación

## Alcance y baseline

- Repositorio: `elcriollito/TVLavin-Chess-Game2`.
- Rama local: `fix/caissa-public-player-identity`.
- HEAD/base sin commits nuevos: `b6ccd5d0bd0bd85bd1fd8829366443450937045e`.
- Dependencia: PR Online #71; este trabajo no la actualiza.
- Digest baseline de 23 archivos: `ccdffd81a7224d73d3d05fb7cdb3214e3abd379a06c6214267a6928b24981225`.
- No hubo conexiones ni mutaciones en Supabase, Clerk, Vercel, Staging o Production.

## Bloqueos corregidos

1. **Paridad Unicode.** La política de aceptación vive en Node, está versionada y exige `Intl.Segmenter`. PostgreSQL protege las invariantes persistidas: versión, NFC, clave NFKC+lower, longitud defensiva y unicidad. Un payload con clave forjada falla cerrado.
2. **Amplificación Guest.** `GET` de estado no provisiona identidad. Solo `presence.join`, `queue.join` y `challenge.create` pueden iniciar el aprovisionamiento. La ruta lee primero, inserta una vez, tolera la carrera `23505` y relee sin tocar `updated_at` para Guests existentes.
3. **Paridad de ruta Tournament demo.** El servidor local reconoce `/online/tournament-demo` con el mismo shell autorizado; no activa Tournament real.
4. **Privacidad histórica.** Todas las respuestas Online pasan por una proyección server-side. Los nombres legacy no certificados se reemplazan antes de JSON, historial, directorio, challenges, PGN y Analyze handoff.

## Arquitectura resultante

- `Internal User ID`: Clerk subject y `public.users.id`; solo autorización.
- `Public Nickname`: nombre voluntario, único y versionado.
- `Private Full Name` y `Email`: permanecen privados; nunca son fallback público.
- `Fallback Alias`: `Player-` más 16 hexadecimales aleatorios, estable y no derivado de PII.
- `Guest Alias`: temporal, validado aparte y siempre unrated.

El API rechaza campos de propietario enviados en el body, revalida el contrato y usa RPC server-only. El trigger de creación de partidas congela snapshots v1 canónicos. Cambiar un nickname no reescribe partidas v1 anteriores.

## Invariantes no alteradas

No se cambió rating, economía, Stripe, Analyzer Engine, Tournament real, autenticación remota, Realtime/RLS remoto, geometría del tablero, Quiet Drag ni Game Action Footer. Movimientos, resultados, relojes, colores y timestamps históricos se preservan.

## Evidencia

- PostgreSQL 17.11 local: aplicación, concurrencia, rollback y reaplicación PASS.
- Unit/integration Public Identity: 22/22.
- Online unit/integration: 78/78.
- Browser Public Identity: 12/12 en Chromium, Firefox y WebKit.
- Online browser: 69/69 sumando los tres motores.
- Seguridad: 17/17 archivos revisados; 0 hallazgos reportables.

Los detalles y excepciones de suites no afectadas están en `CAISSA_IDENTITY_QA_MATRIX.md`.

## Estado

La remediación local está terminada. Falta autorización independiente para verificar y aplicar el candidato en Staging; no implica autorización de Production ni de publicación.
