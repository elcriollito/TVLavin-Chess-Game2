# CAISSA Online — Two-Player Retest Plan

**Fecha:** 2026-10-21
**Estado:** `PLAN_READY / HUMAN_GATE`
**Ejecución en esta misión:** ninguna; no hubo push, deploy, cambios de variables ni fixtures.

## Objetivo del próximo gate

Crear una Preview nueva y aislada en el proyecto Vercel existente, con Clerk Development, Supabase Staging `aqizagaskicotorfpwfn`, credenciales modernas y el candidato integrado de recuperación + P2. Primero se ejecutará un smoke alojado; el flujo de dos jugadores sólo continuará con otra autorización explícita.

## Candidato

- Base conocida: `origin/main` `585d070e3226dcd10e0fa6c50355dec554f66977`.
- Commit de recuperación de credenciales: `d5e151cf170896e1b2309990ff0b19a368bd5b51`.
- Commit P2 revisado: `9e0d848e8aa8e16a030637196dcfed0cb7e92129`.
- Rama local: `fix/online-guest-security-p2-20261021`.
- La Preview debe resolver exactamente al commit integrado aprobado; no reutilizar el deployment fallido ni el Custom Staging de Account Control.

## Escrituras remotas que requieren aprobación

1. Publicar una rama remota dedicada desde el candidato local aprobado.
2. Crear variables Vercel exclusivas de Preview y limitadas a esa rama.
3. Crear una nueva Preview protegida por Vercel SSO/Deployment Protection.
4. Después del smoke y con autorización separada, crear exactamente dos identidades sintéticas nuevas en Clerk Development.
5. Ejecutar el retest con dos contextos de navegador y limpiar exclusivamente los fixtures inventariados.

No se autoriza ninguna de estas operaciones mediante este plan.

## Contrato de variables branch-scoped

| Variable | Valor/clase requerida |
|---|---|
| `SUPABASE_URL` | URL exacta de Staging `aqizagaskicotorfpwfn` |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` moderna predeterminada de ese Staging, server-only |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` moderna y activa de ese Staging |
| `CLERK_SECRET_KEY` / `CLERK_JWT_KEY` | exclusivamente Clerk Development |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_PUBLISHABLE_KEY` | exclusivamente Clerk Development |
| `CAISSA_CLERK_AUTHORIZED_PARTIES` | sólo el hostname exacto de la nueva Preview |
| `CAISSA_BROWSER_ORIGINS` | sólo el origen exacto de la nueva Preview |
| `CAISSA_ONLINE_ROLLOUT` | `internal` |
| `CAISSA_ONLINE_INTERNAL_USERS` | los dos IDs Clerk Development nuevos, después de inventariarlos |
| `CAISSA_ONLINE_RATED` | `0` |
| `CAISSA_ONLINE_GUESTS` | `0` |
| `CAISSA_ONLINE_TOURNAMENTS` | `0` |
| `CAISSA_ONLINE_SPECTATORS` | `0` |
| `CAISSA_ONLINE_MULTIBOARD` | `0` |

Debe quedar ausente `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, cualquier clave Production y la secret dedicada al relay EAE-015A. El inventario debe mostrar sólo nombres, targets y branch scope; nunca valores.

## Secuencia de certificación

### Gate A — pre-deploy

1. Confirmar worktree limpio, commit y tree del candidato.
2. Revisar el diff permitido y confirmar PR #93 fuera de alcance.
3. Repetir inventario read-only de Clerk Development y baseline Supabase Staging.
4. Instalar únicamente las variables aprobadas y comprobar branch/target sin revelar secretos.
5. Detenerse si existe herencia de Production, variable legacy, hostname inesperado o recurso no inventariado.

### Gate B — smoke alojado sin fixtures

1. Confirmar deployment `READY`, SHA exacto, target Preview y protección activa.
2. Verificar `/api/online?action=config`: rollout `internal`, `guestPlay=false`, Rated/Tournaments/Spectators/Multiboard desactivados y ref Staging esperada.
3. Confirmar que un principal no allowlisted recibe `403` y que las rutas sin autenticación reciben el fallo previsto.
4. Probar autenticación/sync mínima con un principal Development ya autorizado sólo si existe autorización para esa identidad.
5. Verificar logs sanitizados: ningún valor de key, JWT, cookie o IP en claro; ningún `401`, `403` inesperado o `5xx` de Supabase.
6. Confirmar que el baseline Staging no cambió. Detenerse antes de crear fixtures.

### Gate C — fixtures y dos jugadores, con autorización separada

1. Crear dos cuentas sintéticas con external IDs únicos para esta ejecución y registrar user IDs, session IDs y timestamps exactos.
2. Añadir sólo esos dos user IDs a `CAISSA_ONLINE_INTERNAL_USERS` en la rama Preview.
3. Abrir dos contextos de navegador independientes y verificar sesiones Development separadas.
4. Certificar Lobby Hub, presence, queue/matchmaking, match found, colores opuestos, clocks, movimiento legal, rechazo de movimiento inválido, sincronización Realtime/polling, draw/resign/rematch según matriz aprobada.
5. Mantener Rated y Guests desactivados. No probar Production ni Account Control.

### Stop gates

Detener inmediatamente ante:

- SHA, project ref, issuer, hostname, usuario o branch scope inesperado.
- Cualquier secret expuesta al navegador o log.
- `UNAUTHORIZED_DISABLED_LEGACY_KEY`, uso de credencial legacy, `401` Supabase o `5xx` persistente.
- Escritura fuera de los dos fixtures o variación del baseline no explicada.
- Bypass de allowlist, principal mezclado entre contextos o estado de partida inconsistente.

## Cleanup exacto

1. Capturar inventario de filas relacionadas con los dos IDs antes de borrar.
2. Finalizar/abandonar sólo sus partidas activas y retirar presence, tickets y challenges de esos fixtures según el procedimiento aprobado.
3. Revocar todas sus sesiones Clerk Development.
4. Eliminar únicamente las dos cuentas sintéticas por user ID exacto.
5. Verificar cero coincidencias por user ID y external ID, y cero sesiones asociadas.
6. Verificar cero filas de fixture y restauración exacta del baseline Supabase Staging.
7. Retirar las variables branch-scoped y la Preview si el gate ordena cierre; no tocar variables compartidas.

Si un ID no coincide o aparece un recurso inesperado, no borrar y detenerse.

## Rollback

- Antes de fixtures: retirar sólo la nueva Preview y sus variables branch-scoped.
- Después de fixtures: ejecutar primero el cleanup exacto anterior y comprobar baseline; luego retirar Preview/variables.
- No rotar claves, reactivar legacy, ejecutar rollback SQL, borrar datos históricos, modificar Production ni alterar PR #93.

## Criterio de salida futuro

El retest sólo puede declararse aprobado si el deployment, autenticación, sync, matchmaking, partida y cleanup terminan sin stop gates y Staging vuelve exactamente a su baseline. Hasta esa ejecución el estado alojado permanece `MULTIPLAYER_HOLD / CLEAN_STAGING`.
