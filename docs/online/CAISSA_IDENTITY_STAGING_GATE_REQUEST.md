# CAISSA Public Identity — solicitud futura de gate Staging

## Borrador de autorización mínima

> Autorizo una única ventana controlada en Supabase Staging `aqizagaskicotorfpwfn` y una Preview protegida de la rama `fix/caissa-public-player-identity`. Autoriza: preflight read-only Direct/TLS; captura cifrada de los objetos PostgreSQL afectados y prueba de restauración en destino aislado; aplicación exclusiva de `20261014035549_caissa_public_identity_v1.sql` si el backup es recuperable y el ledger coincide; verificación de DDL, RLS, grants, RPC, Unicode y rollback lógico sin ejecutarlo sobre Staging; deployment Preview con Clerk Development y rollout internal; y smoke con identidades sintéticas bajo un límite de escrituras separado. Autoriza prompt local oculto y efímero para las credenciales indispensables. No autoriza Production, identidades humanas, migraciones adicionales, reparación automática de ledger, borrado de datos, merge ni rollout público. Ante identidad, backup, ledger o configuración ambiguos, detenerse sin escribir.

## Procedimiento revisable

1. Reconfirmar project ref, región, versión PostgreSQL, ledger y ausencia de la versión Identity.
2. Verificar Direct con `sslmode=verify-full` y CA oficial; credenciales solo en prompt oculto/PGPASSFILE temporal en memoria.
3. Capturar de forma consistente esquema, tabla Identity si existiera, definición/grants de `users` y `caissa_online_games`, y preimagen de columnas afectadas. Cifrar antes de persistir.
4. Restaurar en PostgreSQL aislado sin salida de red; comparar catálogo, datos, owners, ACL, extensiones y publicaciones pertinentes.
5. Solo con recuperación PASS, aplicar una unidad: `20261014035549_caissa_public_identity_v1.sql`.
6. Verificar objetos, cero políticas browser, permisos exactos, RPC service-only, Unicode y ausencia de cambios en ratings/economía.
7. Crear Preview branch-scoped conforme a `CAISSA_PREVIEW_CONFIGURATION_PLAN.md`.
8. Ejecutar primero smoke read-only. Solicitar autorización separada para altas/updates sintéticos y partidas.
9. Mantener backup durante la ventana aprobada; registrar custodia, expiración y soft-delete. No eliminarlo hasta cierre humano.
10. Ante fallo, poner rollout off y conservar datos; no ejecutar rollback destructivo automáticamente.

Datos que una autorización ejecutable debe fijar: ventana, retención, ubicación remota del backup, custodio/clave pública GPG, destino de restauración, máximo de sesiones/conexiones y presupuesto si corresponde.

Este documento no concede autorización ni modifica Staging.
